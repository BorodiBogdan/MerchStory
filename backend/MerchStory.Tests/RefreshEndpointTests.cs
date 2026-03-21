using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Moq;
using Xunit;

namespace MerchStory.Tests;

public class RefreshEndpointTests : IDisposable
{
    private readonly Mock<UserManager<AppUser>> userManagerMock;
    private readonly Mock<SignInManager<AppUser>> signInManagerMock;
    private readonly WebApplicationFactory<Program> factory;
    private readonly HttpClient client;

    public RefreshEndpointTests()
    {
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
                    ["Jwt:ExpiryMinutes"] = "15",
                    ["Jwt:MobileRefreshTokenExpiryDays"] = "30",
                    ["Jwt:WebRefreshTokenExpiryDays"] = "1",
                    ["Google:ApiKey"] = "test-key",
                });
            });

            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<AppDbContext>>();
                services.RemoveAll<AppDbContext>();
                var dbName = "TestDb-Refresh-" + Guid.NewGuid();
                var inMemoryProvider = new ServiceCollection()
                    .AddEntityFrameworkInMemoryDatabase()
                    .BuildServiceProvider();
                services.AddDbContext<AppDbContext>(options =>
                    options.UseInMemoryDatabase(dbName)
                           .UseInternalServiceProvider(inMemoryProvider));

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
    public async Task Refresh_WithValidToken_ReturnsNewTokenPair()
    {
        using var scope = this.factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var user = new AppUser { Id = "refresh-user-1", Email = "r1@test.com", UserName = "r1@test.com" };
        db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            Token = "valid-refresh-token",
            UserId = user.Id,
            User = user,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(30),
            IsRevoked = false,
        });
        await db.SaveChangesAsync();

        var response = await this.client.PostAsJsonAsync(
            "/auth/refresh",
            new { refreshToken = "valid-refresh-token" });

        string body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Status: {response.StatusCode}, Body: {body}");

        var json = JsonDocument.Parse(body);
        string? newAccess = json.RootElement.GetProperty("token").GetString();
        string? newRefresh = json.RootElement.GetProperty("refreshToken").GetString();

        Assert.False(string.IsNullOrEmpty(newAccess));
        Assert.False(string.IsNullOrEmpty(newRefresh));
        Assert.NotEqual("valid-refresh-token", newRefresh);
    }

    [Fact]
    public async Task Refresh_WithRevokedToken_ReturnsUnauthorized()
    {
        using var scope = this.factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var user = new AppUser { Id = "refresh-user-2", Email = "r2@test.com", UserName = "r2@test.com" };
        db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            Token = "revoked-token",
            UserId = user.Id,
            User = user,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(30),
            IsRevoked = true,
        });
        await db.SaveChangesAsync();

        var response = await this.client.PostAsJsonAsync(
            "/auth/refresh",
            new { refreshToken = "revoked-token" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Refresh_WithExpiredToken_ReturnsUnauthorized()
    {
        using var scope = this.factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var user = new AppUser { Id = "refresh-user-3", Email = "r3@test.com", UserName = "r3@test.com" };
        db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            Token = "expired-token",
            UserId = user.Id,
            User = user,
            CreatedAt = DateTime.UtcNow.AddDays(-31),
            ExpiresAt = DateTime.UtcNow.AddDays(-1),
            IsRevoked = false,
        });
        await db.SaveChangesAsync();

        var response = await this.client.PostAsJsonAsync(
            "/auth/refresh",
            new { refreshToken = "expired-token" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Refresh_WithUnknownToken_ReturnsUnauthorized()
    {
        var response = await this.client.PostAsJsonAsync(
            "/auth/refresh",
            new { refreshToken = "does-not-exist" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Refresh_OldTokenIsRevoked_AfterSuccessfulRotation()
    {
        using var scope = this.factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var user = new AppUser { Id = "refresh-user-4", Email = "r4@test.com", UserName = "r4@test.com" };
        db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            Token = "rotate-me",
            UserId = user.Id,
            User = user,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(30),
            IsRevoked = false,
        });
        await db.SaveChangesAsync();

        await this.client.PostAsJsonAsync("/auth/refresh", new { refreshToken = "rotate-me" });

        var response = await this.client.PostAsJsonAsync(
            "/auth/refresh",
            new { refreshToken = "rotate-me" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
