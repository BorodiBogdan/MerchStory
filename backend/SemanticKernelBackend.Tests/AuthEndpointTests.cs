using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Moq;
using SemanticKernelBackend.Models;
using Xunit;

namespace SemanticKernelBackend.Tests;

public class AuthEndpointTests : IDisposable
{
    private readonly Mock<UserManager<AppUser>> userManagerMock;
    private readonly Mock<SignInManager<AppUser>> signInManagerMock;
    private readonly WebApplicationFactory<Program> factory;
    private readonly HttpClient client;

    public AuthEndpointTests()
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
                    ["Jwt:ExpiryMinutes"] = "60",
                    ["Google:ApiKey"] = "test-key",
                });
            });

            builder.ConfigureServices(services =>
            {
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
            "/generate-image",
            new { prompt = "a red apple" });

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

        var request = new HttpRequestMessage(HttpMethod.Post, "/generate-image")
        {
            Content = JsonContent.Create(new { prompt = "a red apple" }),
            Headers = { { "Authorization", $"Bearer {token}" } },
        };
        var response = await this.client.SendAsync(request);

        // Auth passed — expect 200 or 502 (Google API will fail with test key), not 401
        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
