using System.Net.Http.Json;
using System.Text.Json;
using MerchStory.Tests.Fakes;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryAPI.Storage;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Moq;

namespace MerchStory.Tests.Infrastructure;

// Shared host harness for integration tests. It centralises the boilerplate that the
// per-feature test classes copy verbatim: the JWT configuration, the real PostgreSQL +
// pgvector connection (a throwaway database cloned per test from the shared container),
// the mocked Identity managers, and the in-memory blob fake. Feature-specific seam swaps
// (image provider, LLM, inpaint, upscaler) are supplied through the configureServices hook
// so each class only declares what it needs.
//
// The database is deliberately NOT mocked: EF Core migrations and pgvector behaviour are
// part of what the integration suite verifies. Only external services are stubbed.
internal sealed class TestAppFactory : IDisposable
{
    public TestAppFactory(string connectionString, Action<IServiceCollection>? configureServices = null)
    {
        Environment.SetEnvironmentVariable("Jwt__Key", "test-super-secret-key-that-is-long-enough-32chars");
        Environment.SetEnvironmentVariable("Jwt__Issuer", "MerchStory");
        Environment.SetEnvironmentVariable("Jwt__Audience", "MerchStoryApp");
        Environment.SetEnvironmentVariable("Jwt__ExpiryMinutes", "60");

        var store = new Mock<IUserStore<AppUser>>();
        this.UserManagerMock = new Mock<UserManager<AppUser>>(
            store.Object, null!, null!, null!, null!, null!, null!, null!, null!);

        var contextAccessor = new Mock<IHttpContextAccessor>();
        var claimsFactory = new Mock<IUserClaimsPrincipalFactory<AppUser>>();
        this.SignInManagerMock = new Mock<SignInManager<AppUser>>(
            this.UserManagerMock.Object,
            contextAccessor.Object,
            claimsFactory.Object,
            null!,
            null!,
            null!,
            null!);

        this.Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
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
                });
            });

            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<AppDbContext>>();
                services.RemoveAll<AppDbContext>();
                services.AddDbContext<AppDbContext>(options =>
                    options.UseNpgsql(connectionString, o => o.UseVector()));

                services.RemoveAll<UserManager<AppUser>>();
                services.AddSingleton(this.UserManagerMock.Object);

                services.RemoveAll<SignInManager<AppUser>>();
                services.AddSingleton(this.SignInManagerMock.Object);

                services.RemoveAll<IBlobStorage>();
                services.AddSingleton<IBlobStorage, InMemoryBlobStorage>();

                configureServices?.Invoke(services);
            });
        });

        this.Client = this.Factory.CreateClient();
    }

    public Mock<UserManager<AppUser>> UserManagerMock { get; }

    public Mock<SignInManager<AppUser>> SignInManagerMock { get; }

    public WebApplicationFactory<Program> Factory { get; }

    public HttpClient Client { get; }

    // Registers a user through the real /auth/register endpoint. UserManager is mocked, so the
    // AppUser is persisted from inside the mocked CreateAsync callback (with a known credit
    // balance and admin flag) before the endpoint writes the refresh token; on the real
    // database that ordering is required so the refresh token's foreign key resolves. The
    // returned JWT is signed by the real JwtService, so RequireAuthorization (and the AdminOnly
    // policy when isAdmin is true) pass exactly as in production.
    public async Task<SeededUser> RegisterAndSeedUserAsync(string email, int credits, bool isAdmin = false)
    {
        string uniqueId = "user-" + Guid.NewGuid();

        this.UserManagerMock
            .Setup(m => m.CreateAsync(It.IsAny<AppUser>(), It.IsAny<string>()))
            .Callback<AppUser, string>((user, _) =>
            {
                user.Id = uniqueId;
                user.Email = email;
                user.UserName = email;
                user.IsAdmin = isAdmin;
                this.SeedUserAsync(uniqueId, email, credits, isAdmin).GetAwaiter().GetResult();
            })
            .ReturnsAsync(IdentityResult.Success);

        HttpResponseMessage registerResponse = await this.Client.PostAsJsonAsync(
            "/auth/register",
            new { email, password = "Test1234!" });
        registerResponse.EnsureSuccessStatusCode();

        string body = await registerResponse.Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(body);
        string token = json.RootElement.GetProperty("token").GetString()!;
        return new SeededUser(uniqueId, email, token);
    }

    // Seeds an AppUser row directly (used for grant targets that never authenticate).
    public async Task SeedUserAsync(string userId, string email, int credits, bool isAdmin = false)
    {
        using var scope = this.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Users.Add(new AppUser
        {
            Id = userId,
            Email = email,
            UserName = email,
            CreditBalance = credits,
            IsAdmin = isAdmin,
        });
        await db.SaveChangesAsync();
    }

    public IServiceScope CreateScope() => this.Factory.Services.CreateScope();

    public void Dispose()
    {
        this.Client.Dispose();
        this.Factory.Dispose();
    }
}

internal sealed record SeededUser(string UserId, string Email, string Token);
