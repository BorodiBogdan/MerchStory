using System.Net;
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
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Moq;
using Xunit;

namespace MerchStory.Tests;

public class AuthEndpointTests : IDisposable
{
    private readonly Mock<UserManager<AppUser>> userManagerMock;
    private readonly Mock<SignInManager<AppUser>> signInManagerMock;
    private readonly WebApplicationFactory<Program> factory;
    private readonly HttpClient client;

    public AuthEndpointTests()
    {
        // Override JWT config via env vars so the dev key in appsettings.Development.json
        // doesn't bleed into tests. Env vars are read by WebApplication.CreateBuilder before
        // user code runs, so AddJwtBearer's IssuerSigningKey and JwtService both see the
        // same test key.
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
                });
            });

            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<AppDbContext>>();
                services.RemoveAll<AppDbContext>();
                var dbName = "TestDb-Auth-" + Guid.NewGuid();
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

                // Keep the suite offline: the generate-image endpoint resolves
                // IBlobStorage, which otherwise builds a real Azure client from
                // appsettings. Tests must use mocks, never real storage.
                services.RemoveAll<IBlobStorage>();
                services.AddSingleton<IBlobStorage, InMemoryBlobStorage>();
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
    public async Task Register_WithValidData_ReturnsOkWithToken()
    {
        this.userManagerMock
            .Setup(m => m.CreateAsync(It.IsAny<AppUser>(), "Test1234!"))
            .Callback<AppUser, string>((user, _) =>
            {
                user.Id = Guid.NewGuid().ToString();
            })
            .ReturnsAsync(IdentityResult.Success);

        var response = await this.client.PostAsJsonAsync(
            "/auth/register",
            new { email = "newuser@test.com", password = "Test1234!" });

        string body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Status: {response.StatusCode}, Body: {body}");
        Assert.Contains("token", body);
        Assert.Contains("newuser@test.com", body);
    }

    [Fact]
    public async Task Register_WithDuplicateEmail_ReturnsBadRequest()
    {
        this.userManagerMock
            .Setup(m => m.CreateAsync(It.IsAny<AppUser>(), It.IsAny<string>()))
            .ReturnsAsync(IdentityResult.Failed(new IdentityError
            {
                Code = "DuplicateEmail",
                Description = "Email already taken.",
            }));

        var response = await this.client.PostAsJsonAsync(
            "/auth/register",
            new { email = "dup@test.com", password = "Test1234!" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Login_WithValidCredentials_ReturnsOkWithToken()
    {
        var user = new AppUser { Id = "user-1", Email = "loginuser@test.com", UserName = "loginuser@test.com" };

        this.userManagerMock
            .Setup(m => m.FindByEmailAsync("loginuser@test.com"))
            .ReturnsAsync(user);

        this.signInManagerMock
            .Setup(m => m.CheckPasswordSignInAsync(It.IsAny<AppUser>(), "Test1234!", false))
            .ReturnsAsync(SignInResult.Success);

        var response = await this.client.PostAsJsonAsync(
            "/auth/login",
            new { email = "loginuser@test.com", password = "Test1234!" });

        string body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Status: {response.StatusCode}, Body: {body}");
        Assert.Contains("token", body);
    }

    [Fact]
    public async Task Login_WithWrongPassword_ReturnsUnauthorized()
    {
        var user = new AppUser { Id = "user-2", Email = "wrongpw@test.com", UserName = "wrongpw@test.com" };

        this.userManagerMock
            .Setup(m => m.FindByEmailAsync("wrongpw@test.com"))
            .ReturnsAsync(user);

        this.signInManagerMock
            .Setup(m => m.CheckPasswordSignInAsync(It.IsAny<AppUser>(), "WrongPassword!", false))
            .ReturnsAsync(SignInResult.Failed);

        var response = await this.client.PostAsJsonAsync(
            "/auth/login",
            new { email = "wrongpw@test.com", password = "WrongPassword!" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GenerateImage_WithoutToken_ReturnsUnauthorized()
    {
        var response = await this.client.PostAsJsonAsync(
            "/generate-image/catalog",
            new
            {
                products = new[] { new { name = "Test Product", price = 9.99, imageBase64 = (string?)null } },
                layout = "Grid",
                colorTheme = "Vibrant",
                format = "Square 1:1",
                showPrices = true,
            });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GenerateImage_WithValidToken_PassesAuth()
    {
        this.userManagerMock
            .Setup(m => m.CreateAsync(It.IsAny<AppUser>(), "Test1234!"))
            .Callback<AppUser, string>((user, _) =>
            {
                user.Id = "gen-user-id";
                user.Email = "genuser@test.com";
                user.UserName = "genuser@test.com";
            })
            .ReturnsAsync(IdentityResult.Success);

        var registerResponse = await this.client.PostAsJsonAsync(
            "/auth/register",
            new { email = "genuser@test.com", password = "Test1234!" });
        string body = await registerResponse.Content.ReadAsStringAsync();
        var json = JsonDocument.Parse(body);
        string? token = json.RootElement.GetProperty("token").GetString();

        // The wallet check on protected endpoints requires the AppUser to exist in the DB.
        // UserManager is mocked, so the register call doesn't persist anything — seed the
        // user directly with enough credits to pass TryDeductAsync.
        using (var scope = this.factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.Add(new AppUser
            {
                Id = "gen-user-id",
                Email = "genuser@test.com",
                UserName = "genuser@test.com",
                CreditBalance = 100,
            });
            await db.SaveChangesAsync();
        }

        var request = new HttpRequestMessage(HttpMethod.Post, "/generate-image/catalog")
        {
            Content = JsonContent.Create(new
            {
                products = new[] { new { name = "Test Product", price = 9.99, imageBase64 = (string?)null } },
                layout = "Grid",
                colorTheme = "Vibrant",
                format = "Square 1:1",
                showPrices = true,
            }),
            Headers = { { "Authorization", $"Bearer {token}" } },
        };
        var response = await this.client.SendAsync(request);

        // Auth passed — expect 200 or 502 (Google API will fail with test key), not 401
        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
