using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;
using Xunit;
using semantic_kernel_backend.Data;

public class AuthEndpointTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:18")
        .Build();

    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();

        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                // Replace the real Npgsql DbContext with the test container connection string
                var descriptor = services.SingleOrDefault(
                    d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));
                if (descriptor != null) services.Remove(descriptor);

                services.AddDbContext<AppDbContext>(options =>
                    options.UseNpgsql(_postgres.GetConnectionString()));

                // Provide required JWT config
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
            });
        });

        // Run migrations on the test container
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync();

        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    [Fact]
    public async Task Register_WithValidData_ReturnsOkWithToken()
    {
        var response = await _client.PostAsJsonAsync("/auth/register",
            new { email = "newuser@test.com", password = "Test1234!" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("token", body);
        Assert.Contains("newuser@test.com", body);
    }

    [Fact]
    public async Task Register_WithDuplicateEmail_ReturnsBadRequest()
    {
        await _client.PostAsJsonAsync("/auth/register",
            new { email = "dup@test.com", password = "Test1234!" });

        var response = await _client.PostAsJsonAsync("/auth/register",
            new { email = "dup@test.com", password = "Test1234!" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Login_WithValidCredentials_ReturnsOkWithToken()
    {
        await _client.PostAsJsonAsync("/auth/register",
            new { email = "loginuser@test.com", password = "Test1234!" });

        var response = await _client.PostAsJsonAsync("/auth/login",
            new { email = "loginuser@test.com", password = "Test1234!" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("token", body);
    }

    [Fact]
    public async Task Login_WithWrongPassword_ReturnsUnauthorized()
    {
        await _client.PostAsJsonAsync("/auth/register",
            new { email = "wrongpw@test.com", password = "Test1234!" });

        var response = await _client.PostAsJsonAsync("/auth/login",
            new { email = "wrongpw@test.com", password = "WrongPassword!" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GenerateImage_WithoutToken_ReturnsUnauthorized()
    {
        var response = await _client.PostAsJsonAsync("/generate-image",
            new { prompt = "a red apple" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GenerateImage_WithValidToken_PassesAuth()
    {
        // Register and get token
        var registerResponse = await _client.PostAsJsonAsync("/auth/register",
            new { email = "genuser@test.com", password = "Test1234!" });
        var body = await registerResponse.Content.ReadAsStringAsync();
        var json = JsonDocument.Parse(body);
        var token = json.RootElement.GetProperty("token").GetString();

        // Call protected endpoint with token
        var request = new HttpRequestMessage(HttpMethod.Post, "/generate-image")
        {
            Content = JsonContent.Create(new { prompt = "a red apple" }),
            Headers = { { "Authorization", $"Bearer {token}" } }
        };
        var response = await _client.SendAsync(request);

        // Auth passed — expect 200 or 502 (Google API will fail with test key), not 401
        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
