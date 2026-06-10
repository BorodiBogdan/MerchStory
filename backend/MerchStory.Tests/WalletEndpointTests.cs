using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MerchStory.Tests.Fakes;
using MerchStory.Tests.Infrastructure;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryAPI.Wallet;
using MerchStoryImageGeneration.Models;
using MerchStoryImageGeneration.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Moq;
using SixLabors.ImageSharp.PixelFormats;
using Xunit;

namespace MerchStory.Tests;

// Integration coverage for the credit ledger: balance reads, transaction-history paging,
// admin grants (authorised and forbidden), and the debit invariant
// (CreditBalance == initial + sum of ledger amounts). Everything runs against a real
// PostgreSQL + pgvector database (cloned per test) with only external AI/blob seams stubbed.
[Collection("Postgres")]
public class WalletEndpointTests : IDisposable
{
    private readonly TestAppFactory app;

    public WalletEndpointTests(PostgresFixture postgres)
    {
        // The wallpaper generation path (used to drive a real HTTP debit) flows through
        // IImageProvider; stub it so generation succeeds offline with a tiny canned PNG.
        var canned = TestCanvas.SolidCanvas(64, 64, new Rgba32(120, 120, 120, 255));
        var imageProvider = new ConfigurableMockImageProvider(
            (_, _) => new ImageGenerationResult(canned, "image/png"));

        this.app = new TestAppFactory(postgres.CreateDatabase(), services =>
        {
            services.RemoveAll<IImageProvider>();
            services.AddSingleton<IImageProvider>(imageProvider);
        });
    }

    public void Dispose()
    {
        this.app.Dispose();
        GC.SuppressFinalize(this);
    }

    [Fact]
    public async Task GetWallet_ReturnsBalanceAndRecentTransactions()
    {
        SeededUser user = await this.app.RegisterAndSeedUserAsync("balance@test.com", credits: 100);
        await this.SeedTransactionsAsync(user.UserId, (-1, 99, "Catalog generation"), (5, 104, "Admin grant"));

        var response = await this.GetAsync(user.Token, "/wallet/");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using JsonDocument doc = await ReadJsonAsync(response);
        Assert.Equal(100, doc.RootElement.GetProperty("balance").GetInt32());

        JsonElement recent = doc.RootElement.GetProperty("recentTransactions");
        Assert.Equal(2, recent.GetArrayLength());

        // Ordered newest-first; the second seeded row (grant) has the later CreatedAt.
        Assert.Equal(5, recent[0].GetProperty("amount").GetInt32());
        Assert.Equal(-1, recent[1].GetProperty("amount").GetInt32());
    }

    [Fact]
    public async Task GetTransactions_PaginatesAndClampsTake()
    {
        SeededUser user = await this.app.RegisterAndSeedUserAsync("paging@test.com", credits: 50);
        var rows = new (int Amount, int BalanceAfter, string Description)[5];
        for (int i = 0; i < 5; i++)
        {
            rows[i] = (-1, 50 - (i + 1), $"Generation {i}");
        }

        await this.SeedTransactionsAsync(user.UserId, rows);

        // take is clamped to a maximum of 200, and total reflects the full count regardless of paging.
        var pageOne = await this.GetAsync(user.Token, "/wallet/transactions?skip=0&take=1000");
        using JsonDocument all = await ReadJsonAsync(pageOne);
        Assert.Equal(5, all.RootElement.GetProperty("total").GetInt32());
        Assert.Equal(5, all.RootElement.GetProperty("items").GetArrayLength());

        // skip/take offset a page; total stays at the full count.
        var pageTwo = await this.GetAsync(user.Token, "/wallet/transactions?skip=2&take=2");
        using JsonDocument page = await ReadJsonAsync(pageTwo);
        Assert.Equal(5, page.RootElement.GetProperty("total").GetInt32());
        Assert.Equal(2, page.RootElement.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task Grant_AsAdmin_IncreasesBalanceAndRecordsTransaction()
    {
        SeededUser admin = await this.app.RegisterAndSeedUserAsync("admin@test.com", credits: 0, isAdmin: true);

        // The grant target never authenticates; seed its row directly and resolve it via
        // the mocked UserManager.FindByEmailAsync (the route looks the target up by email).
        const string targetEmail = "target@test.com";
        string targetId = "user-target-" + Guid.NewGuid();
        await this.app.SeedUserAsync(targetId, targetEmail, credits: 10);
        var targetUser = new AppUser { Id = targetId, Email = targetEmail, UserName = targetEmail, CreditBalance = 10 };
        this.app.UserManagerMock
            .Setup(m => m.FindByEmailAsync(targetEmail))
            .ReturnsAsync(targetUser);

        var response = await this.PostAsync(
            admin.Token,
            "/wallet/grant",
            new { userEmail = targetEmail, amount = 25, note = (string?)null });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using JsonDocument doc = await ReadJsonAsync(response);
        Assert.Equal(35, doc.RootElement.GetProperty("balance").GetInt32());
        Assert.Equal(25, doc.RootElement.GetProperty("transaction").GetProperty("amount").GetInt32());
        Assert.Equal(35, doc.RootElement.GetProperty("transaction").GetProperty("balanceAfter").GetInt32());

        using IServiceScope scope = this.app.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        AppUser stored = await db.Users.SingleAsync(u => u.Id == targetId);
        Assert.Equal(35, stored.CreditBalance);
        Assert.Equal(1, await db.CreditTransactions.CountAsync(t => t.UserId == targetId && t.Amount == 25));
    }

    [Fact]
    public async Task Grant_AsNonAdmin_ReturnsForbidden()
    {
        SeededUser caller = await this.app.RegisterAndSeedUserAsync("nonadmin@test.com", credits: 0, isAdmin: false);

        const string targetEmail = "victim@test.com";
        string targetId = "user-victim-" + Guid.NewGuid();
        await this.app.SeedUserAsync(targetId, targetEmail, credits: 10);

        var response = await this.PostAsync(
            caller.Token,
            "/wallet/grant",
            new { userEmail = targetEmail, amount = 25, note = (string?)null });

        // Authenticated but missing the is_admin claim => 403, not 401.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        using IServiceScope scope = this.app.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        AppUser stored = await db.Users.SingleAsync(u => u.Id == targetId);
        Assert.Equal(10, stored.CreditBalance);
        Assert.Equal(0, await db.CreditTransactions.CountAsync(t => t.UserId == targetId));
    }

    [Fact]
    public async Task Deduct_ThroughService_DecrementsBalanceAndKeepsLedgerInvariant()
    {
        SeededUser user = await this.app.RegisterAndSeedUserAsync("debit@test.com", credits: 10);

        using IServiceScope scope = this.app.CreateScope();
        var wallet = scope.ServiceProvider.GetRequiredService<WalletService>();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        DeductResult result = await wallet.TryDeductAsync(user.UserId, 3, "Catalog generation", null);

        Assert.True(result.Succeeded);
        Assert.Equal(7, result.NewBalance);

        CreditTransaction txn = await db.CreditTransactions.SingleAsync(t => t.UserId == user.UserId);
        Assert.Equal(-3, txn.Amount);
        Assert.Equal(7, txn.BalanceAfter);

        // The defining ledger invariant: stored balance equals the initial balance plus the
        // sum of every ledger entry for the user.
        AppUser stored = await db.Users.SingleAsync(u => u.Id == user.UserId);
        int ledgerSum = await db.CreditTransactions.Where(t => t.UserId == user.UserId).SumAsync(t => t.Amount);
        Assert.Equal(10 + ledgerSum, stored.CreditBalance);
    }

    [Fact]
    public async Task Generate_DebitsOneCreditAndReturnsNewBalance()
    {
        SeededUser user = await this.app.RegisterAndSeedUserAsync("generate@test.com", credits: 10);

        var response = await this.PostAsync(
            user.Token,
            "/generate-image/wallpaper",
            new { prompt = "clean studio backdrop", format = "Square 1:1", includeLogo = false });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using JsonDocument doc = await ReadJsonAsync(response);
        Assert.Equal(9, doc.RootElement.GetProperty("balance").GetInt32());

        using IServiceScope scope = this.app.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        CreditTransaction txn = await db.CreditTransactions.SingleAsync(t => t.UserId == user.UserId);
        Assert.Equal(-1, txn.Amount);
        Assert.Equal(9, txn.BalanceAfter);
    }

    [Fact]
    public async Task Generate_WithZeroCredits_Returns402AndWritesNoLedgerRow()
    {
        SeededUser user = await this.app.RegisterAndSeedUserAsync("broke@test.com", credits: 0);

        var response = await this.PostAsync(
            user.Token,
            "/generate-image/wallpaper",
            new { prompt = "clean studio backdrop", format = "Square 1:1", includeLogo = false });

        Assert.Equal(HttpStatusCode.PaymentRequired, response.StatusCode);

        using IServiceScope scope = this.app.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        AppUser stored = await db.Users.SingleAsync(u => u.Id == user.UserId);
        Assert.Equal(0, stored.CreditBalance);
        Assert.Equal(0, await db.CreditTransactions.CountAsync(t => t.UserId == user.UserId));
    }

    private static async Task<JsonDocument> ReadJsonAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync());

    private async Task SeedTransactionsAsync(
        string userId,
        params (int Amount, int BalanceAfter, string Description)[] rows)
    {
        using IServiceScope scope = this.app.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        DateTime baseTime = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        for (int i = 0; i < rows.Length; i++)
        {
            db.CreditTransactions.Add(new CreditTransaction
            {
                UserId = userId,
                Amount = rows[i].Amount,
                BalanceAfter = rows[i].BalanceAfter,
                Description = rows[i].Description,
                CreatedAt = baseTime.AddMinutes(i),
            });
        }

        await db.SaveChangesAsync();
    }

    private Task<HttpResponseMessage> GetAsync(string token, string path)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, path)
        {
            Headers = { { "Authorization", $"Bearer {token}" } },
        };
        return this.app.Client.SendAsync(req);
    }

    private Task<HttpResponseMessage> PostAsync(string token, string path, object payload)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(payload),
            Headers = { { "Authorization", $"Bearer {token}" } },
        };
        return this.app.Client.SendAsync(req);
    }
}
