using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Moq;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;
using Xunit;

namespace MerchStory.Tests;

public class PrintRouteTests : IDisposable
{
    private readonly Mock<UserManager<AppUser>> userManagerMock;
    private readonly Mock<SignInManager<AppUser>> signInManagerMock;
    private readonly WebApplicationFactory<Program> factory;
    private readonly HttpClient client;

    public PrintRouteTests()
    {
        Environment.SetEnvironmentVariable("Jwt__Key", "test-super-secret-key-that-is-long-enough-32chars");
        Environment.SetEnvironmentVariable("Jwt__Issuer", "MerchStory");
        Environment.SetEnvironmentVariable("Jwt__Audience", "MerchStoryApp");
        Environment.SetEnvironmentVariable("Jwt__ExpiryMinutes", "60");

        var store = new Mock<IUserStore<AppUser>>();
        this.userManagerMock = new Mock<UserManager<AppUser>>(
            store.Object, null!, null!, null!, null!, null!, null!, null!, null!);

        var contextAccessor = new Mock<IHttpContextAccessor>();
        var claimsFactory = new Mock<IUserClaimsPrincipalFactory<AppUser>>();
        this.signInManagerMock = new Mock<SignInManager<AppUser>>(
            this.userManagerMock.Object,
            contextAccessor.Object,
            claimsFactory.Object,
            null!,
            null!,
            null!,
            null!);

        this.factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Key"] = "test-super-secret-key-that-is-long-enough-32chars",
                    ["Jwt:Issuer"] = "MerchStory",
                    ["Jwt:Audience"] = "MerchStoryApp",
                    ["Jwt:ExpiryMinutes"] = "60",
                    ["Jwt:MobileRefreshTokenExpiryDays"] = "30",
                    ["Jwt:WebRefreshTokenExpiryDays"] = "1",
                    ["Google:ApiKey"] = "test-key",
                    ["Print:PremiumCost:A4"] = "5",
                    ["Print:PremiumCost:A3"] = "10",
                });
            });

            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<AppDbContext>>();
                services.RemoveAll<AppDbContext>();
                var dbName = "TestDb-Print-" + Guid.NewGuid();
                var inMemoryProvider = new ServiceCollection()
                    .AddEntityFrameworkInMemoryDatabase()
                    .BuildServiceProvider();
                services.AddDbContext<AppDbContext>(options =>
                    options.UseInMemoryDatabase(dbName)
                           .UseInternalServiceProvider(inMemoryProvider)
                           .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)));

                services.RemoveAll<UserManager<AppUser>>();
                services.AddSingleton(this.userManagerMock.Object);

                services.RemoveAll<SignInManager<AppUser>>();
                services.AddSingleton(this.signInManagerMock.Object);
            });
        });

        this.client = this.factory.CreateClient();
    }

    public void Dispose()
    {
        this.client.Dispose();
        this.factory.Dispose();
        GC.SuppressFinalize(this);
    }

    [Fact]
    public async Task Render_StandardA4_ProducesPdfWithoutCharge()
    {
        (string token, string userId) = await this.RegisterAndGetTokenAsync("standard@test.com", coins: 10);
        Guid imageId = await this.SeedGeneratedImageAsync(userId);

        HttpResponseMessage response = await this.SendRenderAsync(token, new
        {
            generatedImageId = imageId,
            paperSize = "A4",
            orientation = "portrait",
            qualityTier = "standard",
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("ready", doc.RootElement.GetProperty("status").GetString());
        Guid jobId = doc.RootElement.GetProperty("jobId").GetGuid();

        // Standard tier never debits — newBalance is null, balance unchanged.
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("newBalance").ValueKind);
        Assert.Equal(10, await this.GetCoinBalanceAsync(userId));

        PrintJob? job = await this.GetJobAsync(jobId);
        Assert.NotNull(job);
        Assert.Equal("ready", job!.Status);
        Assert.False(string.IsNullOrEmpty(job.PdfBase64));
    }

    [Fact]
    public async Task Render_PremiumA3_DebitsCoinsAndUpscales()
    {
        (string token, string userId) = await this.RegisterAndGetTokenAsync("premium@test.com", coins: 50);
        Guid imageId = await this.SeedGeneratedImageAsync(userId);

        HttpResponseMessage response = await this.SendRenderAsync(token, new
        {
            generatedImageId = imageId,
            paperSize = "A3",
            orientation = "portrait",
            qualityTier = "premium",
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("ready", doc.RootElement.GetProperty("status").GetString());
        Assert.Equal(40, doc.RootElement.GetProperty("newBalance").GetInt32());
        Assert.Equal(40, await this.GetCoinBalanceAsync(userId));
    }

    [Fact]
    public async Task Render_PremiumWithoutEnoughCoins_Returns402()
    {
        (string token, string userId) = await this.RegisterAndGetTokenAsync("broke@test.com", coins: 2);
        Guid imageId = await this.SeedGeneratedImageAsync(userId);

        HttpResponseMessage response = await this.SendRenderAsync(token, new
        {
            generatedImageId = imageId,
            paperSize = "A4",
            qualityTier = "premium",
        });

        Assert.Equal(HttpStatusCode.PaymentRequired, response.StatusCode);
        Assert.Equal(2, await this.GetCoinBalanceAsync(userId));
    }

    [Fact]
    public async Task Render_WithQrUrl_CreatesResolvableSlug()
    {
        (string token, string userId) = await this.RegisterAndGetTokenAsync("qr@test.com", coins: 10);
        Guid imageId = await this.SeedGeneratedImageAsync(userId);

        HttpResponseMessage response = await this.SendRenderAsync(token, new
        {
            generatedImageId = imageId,
            paperSize = "A5",
            qrTargetUrl = "https://example.com/shop",
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        string? slug = doc.RootElement.GetProperty("qrSlug").GetString();
        Assert.False(string.IsNullOrEmpty(slug));

        // Public redirect endpoint resolves the slug and increments hit count.
        var redirectClient = this.factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
        });
        HttpResponseMessage redirect = await redirectClient.GetAsync($"/p/{slug}");
        Assert.Equal(HttpStatusCode.Redirect, redirect.StatusCode);
        Assert.Equal("https://example.com/shop", redirect.Headers.Location?.ToString());

        using IServiceScope scope = this.factory.Services.CreateScope();
        AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        PrintLink link = await db.PrintLinks.SingleAsync(l => l.Slug == slug);
        Assert.Equal(1, link.HitCount);
    }

    [Fact]
    public async Task Render_UnknownPaperSize_Returns400()
    {
        (string token, string userId) = await this.RegisterAndGetTokenAsync("badsize@test.com", coins: 10);
        Guid imageId = await this.SeedGeneratedImageAsync(userId);

        HttpResponseMessage response = await this.SendRenderAsync(token, new
        {
            generatedImageId = imageId,
            paperSize = "A0",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Render_ImageOwnedByDifferentUser_Returns404()
    {
        (string token, _) = await this.RegisterAndGetTokenAsync("a@test.com", coins: 10);
        (_, string otherUserId) = await this.RegisterAndGetTokenAsync("b@test.com", coins: 10);
        Guid otherImageId = await this.SeedGeneratedImageAsync(otherUserId);

        HttpResponseMessage response = await this.SendRenderAsync(token, new
        {
            generatedImageId = otherImageId,
            paperSize = "A4",
        });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private async Task<(string Token, string UserId)> RegisterAndGetTokenAsync(string email, int coins)
    {
        string uniqueId = "user-" + Guid.NewGuid();
        this.userManagerMock
            .Setup(m => m.CreateAsync(It.IsAny<AppUser>(), It.IsAny<string>()))
            .Callback<AppUser, string>((user, _) =>
            {
                user.Id = uniqueId;
                user.Email = email;
                user.UserName = email;
            })
            .ReturnsAsync(IdentityResult.Success);

        HttpResponseMessage registerResponse = await this.client.PostAsJsonAsync(
            "/auth/register",
            new { email, password = "Test1234!" });
        registerResponse.EnsureSuccessStatusCode();

        using (IServiceScope scope = this.factory.Services.CreateScope())
        {
            AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.Add(new AppUser
            {
                Id = uniqueId,
                Email = email,
                UserName = email,
                CoinBalance = coins,
            });
            await db.SaveChangesAsync();
        }

        string body = await registerResponse.Content.ReadAsStringAsync();
        using JsonDocument json = JsonDocument.Parse(body);
        return (json.RootElement.GetProperty("token").GetString()!, uniqueId);
    }

    private async Task<Guid> SeedGeneratedImageAsync(string userId)
    {
        // Tiny solid PNG so QuestPDF + Lanczos upscaler have real bytes to work with.
        byte[] png;
        using (var img = new Image<Rgba32>(64, 64, new Rgba32(120, 180, 240, 255)))
        using (var ms = new MemoryStream())
        {
            img.Save(ms, new PngEncoder());
            png = ms.ToArray();
        }

        var generated = new GeneratedImage
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            ImageBase64 = Convert.ToBase64String(png),
            MimeType = "image/png",
            CreatedAt = DateTime.UtcNow,
            GenerationType = "catalog",
            Name = "test-asset",
        };

        using IServiceScope scope = this.factory.Services.CreateScope();
        AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.GeneratedImages.Add(generated);
        await db.SaveChangesAsync();
        return generated.Id;
    }

    private async Task<int> GetCoinBalanceAsync(string userId)
    {
        using IServiceScope scope = this.factory.Services.CreateScope();
        AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        AppUser user = await db.Users.SingleAsync(u => u.Id == userId);
        return user.CoinBalance;
    }

    private async Task<PrintJob?> GetJobAsync(Guid jobId)
    {
        using IServiceScope scope = this.factory.Services.CreateScope();
        AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.PrintJobs.SingleOrDefaultAsync(j => j.Id == jobId);
    }

    private async Task<HttpResponseMessage> SendRenderAsync(string token, object payload)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/print/render")
        {
            Content = JsonContent.Create(payload),
            Headers = { { "Authorization", $"Bearer {token}" } },
        };
        return await this.client.SendAsync(req);
    }
}
