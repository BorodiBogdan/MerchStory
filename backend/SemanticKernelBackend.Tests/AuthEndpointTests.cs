using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SemanticKernelBackend.Data;
using Testcontainers.PostgreSql;
using Xunit;

namespace SemanticKernelBackend.Tests;

public class AuthEndpointTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer postgres = new PostgreSqlBuilder()
        .WithImage("postgres:18")
        .Build();

    private WebApplicationFactory<Program> factory = null!;
    private HttpClient client = null!;

    public async Task InitializeAsync()
    {
        await this.postgres.StartAsync();

        this.factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(
                    d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));
                if (descriptor != null)
                {
                    services.Remove(descriptor);
                }

                services.AddDbContext<AppDbContext>(options =>
                    options.UseNpgsql(this.postgres.GetConnectionString()));

                builder.ConfigureAppConfiguration(
                    (_, config) =>
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
            });
        });

        using var scope = this.factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync();

        this.client = this.factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        this.client.Dispose();
        await this.factory.DisposeAsync();
        await this.postgres.DisposeAsync();
    }

    [Fact]
    public async Task Register_WithValidData_ReturnsOkWithToken()
    {
        var response = await this.client.PostAsJsonAsync(
            "/auth/register",
            new { email = "newuser@test.com", password = "Test1234!" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("token", body);
        Assert.Contains("newuser@test.com", body);
    }

    [Fact]
    public async Task Register_WithDuplicateEmail_ReturnsBadRequest()
    {
        await this.client.PostAsJsonAsync(
            "/auth/register",
            new { email = "dup@test.com", password = "Test1234!" });

        var response = await this.client.PostAsJsonAsync(
            "/auth/register",
            new { email = "dup@test.com", password = "Test1234!" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Login_WithValidCredentials_ReturnsOkWithToken()
    {
        await this.client.PostAsJsonAsync(
            "/auth/register",
            new { email = "loginuser@test.com", password = "Test1234!" });

        var response = await this.client.PostAsJsonAsync(
            "/auth/login",
            new { email = "loginuser@test.com", password = "Test1234!" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("token", body);
    }

    [Fact]
    public async Task Login_WithWrongPassword_ReturnsUnauthorized()
    {
        await this.client.PostAsJsonAsync(
            "/auth/register",
            new { email = "wrongpw@test.com", password = "Test1234!" });

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
        var registerResponse = await this.client.PostAsJsonAsync(
            "/auth/register",
            new { email = "genuser@test.com", password = "Test1234!" });
        var body = await registerResponse.Content.ReadAsStringAsync();
        var json = JsonDocument.Parse(body);
        var token = json.RootElement.GetProperty("token").GetString();

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
