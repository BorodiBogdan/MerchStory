using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MerchStory.Tests.Fakes;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryAPI.Storage;
using MerchStoryImageGeneration.Models;
using MerchStoryImageGeneration.Services;
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
using SixLabors.ImageSharp.PixelFormats;
using Xunit;

namespace MerchStory.Tests;

public class CatalogRouteTests : IDisposable
{
    private readonly Mock<UserManager<AppUser>> userManagerMock;
    private readonly Mock<SignInManager<AppUser>> signInManagerMock;
    private readonly WebApplicationFactory<Program> factory;
    private readonly HttpClient client;
    private readonly ConfigurableMockImageProvider mockProvider;
    private Func<string, IReadOnlyList<string?>?, ImageGenerationResult> currentResponder;
    private string userId = string.Empty;

    public CatalogRouteTests()
    {
        Environment.SetEnvironmentVariable("Jwt__Key", "test-super-secret-key-that-is-long-enough-32chars");
        Environment.SetEnvironmentVariable("Jwt__Issuer", "MerchStory");
        Environment.SetEnvironmentVariable("Jwt__Audience", "MerchStoryApp");
        Environment.SetEnvironmentVariable("Jwt__ExpiryMinutes", "60");

        this.currentResponder = (_, _) =>
            throw new InvalidOperationException("Test did not configure a responder.");

        this.mockProvider = new ConfigurableMockImageProvider((prompt, images) =>
            this.currentResponder(prompt, images));

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
                var dbName = "TestDb-Catalog-" + Guid.NewGuid();
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

                services.RemoveAll<IImageProvider>();
                services.AddSingleton<IImageProvider>(this.mockProvider);

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
    public async Task Preserve_HappyPath_ReturnsCompositeImage()
    {
        byte[] canned = TestCanvas.CanvasWithOutlines(
            width: 1080,
            height: 1080,
            background: new Rgba32(200, 200, 200, 255),
            outlinedAreas:
            [
                (new Rectangle(50, 300, 300, 400), "#FF00FF"),
                (new Rectangle(400, 300, 300, 400), "#00FFFF"),
                (new Rectangle(750, 300, 280, 400), "#9D00FF"),
            ]);
        this.currentResponder = (_, _) => new ImageGenerationResult(canned, "image/png");

        string token = await this.RegisterAndGetTokenAsync("happy@test.com");
        Guid a = await this.SeedProductAsync("Product A");
        Guid b = await this.SeedProductAsync("Product B");
        Guid c = await this.SeedProductAsync("Product C");

        var response = await this.SendCatalogAsync(
            token,
            new
            {
                products = new[]
                {
                    ProductJson(a, "Product A"),
                    ProductJson(b, "Product B"),
                    ProductJson(c, "Product C"),
                },
                layout = "Grid",
                colorTheme = "Brand Colors",
                format = "Square 1:1",
                showPrices = true,
                preserveProductImages = true,
            });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        string body = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        Assert.True(doc.RootElement.TryGetProperty("imageBase64", out _));
        Assert.False(doc.RootElement.TryGetProperty("warning", out var warn) && warn.ValueKind == JsonValueKind.String);
        Assert.Single(this.mockProvider.Calls);
    }

    [Fact]
    public async Task Preserve_UnderdetectProducesPartialWarning()
    {
        // Canvas has outlines for only 2 of 3 colors (Charlie's color is missing).
        byte[] canned = TestCanvas.CanvasWithOutlines(
            width: 1080,
            height: 1080,
            background: new Rgba32(200, 200, 200, 255),
            outlinedAreas:
            [
                (new Rectangle(100, 300, 300, 400), "#FF00FF"),
                (new Rectangle(500, 300, 300, 400), "#00FFFF"),
            ]);
        this.currentResponder = (_, _) => new ImageGenerationResult(canned, "image/png");

        string token = await this.RegisterAndGetTokenAsync("partial@test.com");
        Guid alpha = await this.SeedProductAsync("Alpha");
        Guid bravo = await this.SeedProductAsync("Bravo");
        Guid charlie = await this.SeedProductAsync("Charlie");

        var response = await this.SendCatalogAsync(
            token,
            new
            {
                products = new[]
                {
                    ProductJson(alpha, "Alpha"),
                    ProductJson(bravo, "Bravo"),
                    ProductJson(charlie, "Charlie"),
                },
                layout = "Grid",
                colorTheme = "Brand Colors",
                format = "Square 1:1",
                showPrices = false,
                preserveProductImages = true,
            });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        string body = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        Assert.Equal("preserve_partial_missing_products", doc.RootElement.GetProperty("warning").GetString());
        var missing = doc.RootElement.GetProperty("missingProducts").EnumerateArray().Select(e => e.GetString()).ToList();
        Assert.Contains("Charlie", missing);
        Assert.Single(this.mockProvider.Calls);
    }

    [Fact]
    public async Task Preserve_ZeroRegionsReturnsRawImageWithDiagnosticWarning()
    {
        // Preserve mode now returns the raw Gemini output (with a diagnostic warning)
        // when detection finds zero regions, rather than triggering a fallback regeneration.
        byte[] emptyCanvas = TestCanvas.SolidCanvas(1080, 1080, new Rgba32(200, 200, 200, 255));
        this.currentResponder = (_, _) => new ImageGenerationResult(emptyCanvas, "image/png");

        string token = await this.RegisterAndGetTokenAsync("zero@test.com");
        Guid alpha = await this.SeedProductAsync("Alpha");
        Guid bravo = await this.SeedProductAsync("Bravo");

        var response = await this.SendCatalogAsync(
            token,
            new
            {
                products = new[] { ProductJson(alpha, "Alpha"), ProductJson(bravo, "Bravo") },
                layout = "Grid",
                colorTheme = "Brand Colors",
                format = "Square 1:1",
                showPrices = false,
                preserveProductImages = true,
            });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        string body = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        Assert.Equal("preserve_detection_failed_returning_raw", doc.RootElement.GetProperty("warning").GetString());
        Assert.Single(this.mockProvider.Calls);
    }

    [Fact]
    public async Task Preserve_RejectsRequestWhenProductMissingPhoto()
    {
        this.currentResponder = (_, _) => new ImageGenerationResult(
            TestCanvas.SolidCanvas(100, 100, new Rgba32(0, 0, 0, 255)),
            "image/png");

        string token = await this.RegisterAndGetTokenAsync("missing@test.com");
        Guid good = await this.SeedProductAsync("Good");
        Guid bad = await this.SeedProductAsync("Bad", withImage: false);

        var response = await this.SendCatalogAsync(
            token,
            new
            {
                products = new[]
                {
                    ProductJson(good, "Good"),
                    ProductJson(bad, "Bad"),
                },
                layout = "Grid",
                colorTheme = "Brand Colors",
                format = "Square 1:1",
                showPrices = true,
                preserveProductImages = true,
            });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        string body = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        Assert.Equal("preserve_requires_all_product_images", doc.RootElement.GetProperty("error").GetString());
        Assert.Contains("Bad", doc.RootElement.GetProperty("missing").EnumerateArray().Select(e => e.GetString()));
        Assert.Empty(this.mockProvider.Calls);
    }

    [Fact]
    public async Task Preserve_IgnoresProductOwnedByAnotherUser()
    {
        this.currentResponder = (_, _) => new ImageGenerationResult(
            TestCanvas.SolidCanvas(100, 100, new Rgba32(0, 0, 0, 255)),
            "image/png");

        string token = await this.RegisterAndGetTokenAsync("scope@test.com");
        Guid mine = await this.SeedProductAsync("Mine");

        // A product that exists and has a stored image, but belongs to a different user.
        Guid foreign = Guid.NewGuid();
        using (var scope = this.factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var blobs = (InMemoryBlobStorage)scope.ServiceProvider.GetRequiredService<IBlobStorage>();
            string foreignKey = $"products/someone-else/{Guid.NewGuid():N}.png";
            blobs.Seed(foreignKey, TestCanvas.SolidProductPng(100, 100, new Rgba32(10, 10, 10, 255)), "image/png");
            db.Products.Add(new Product
            {
                Id = foreign,
                UserId = "someone-else",
                Name = "Foreign",
                Price = 5m,
                Currency = Currency.USD,
                ImageBlobKey = foreignKey,
                ImageContentType = "image/png",
            });
            await db.SaveChangesAsync();
        }

        var response = await this.SendCatalogAsync(
            token,
            new
            {
                products = new[] { ProductJson(mine, "Mine"), ProductJson(foreign, "Foreign") },
                layout = "Grid",
                colorTheme = "Brand Colors",
                format = "Square 1:1",
                showPrices = true,
                preserveProductImages = true,
            });

        // The foreign product is not resolvable for this user, so its image never leaks
        // into the generation; preserve mode rejects the request as missing a photo.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        string body = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        Assert.Equal("preserve_requires_all_product_images", doc.RootElement.GetProperty("error").GetString());
        Assert.Contains("Foreign", doc.RootElement.GetProperty("missing").EnumerateArray().Select(e => e.GetString()));
        Assert.Empty(this.mockProvider.Calls);
    }

    [Fact]
    public async Task Catalog_RejectsMoreThanEightProducts()
    {
        string token = await this.RegisterAndGetTokenAsync("cap@test.com");

        // The >8 cap is enforced before any image resolution, so unseeded ids are fine here.
        var products = Enumerable.Range(0, 9).Select(i => ProductJson(Guid.NewGuid(), $"P{i}")).ToArray();
        var response = await this.SendCatalogAsync(
            token,
            new
            {
                products,
                layout = "Grid",
                colorTheme = "Brand Colors",
                format = "Square 1:1",
                showPrices = true,
                preserveProductImages = false,
            });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        string body = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        Assert.Equal("too_many_products", doc.RootElement.GetProperty("error").GetString());
    }

    // Builds the wire payload for a product. Image bytes are no longer sent inline —
    // the backend resolves them from blob storage by id (see SeedProductAsync).
    private static object ProductJson(Guid id, string name) =>
        new
        {
            id,
            name,
            price = 9.99,
            currency = "USD",
        };

    // Seeds a Product row for the registered user and (optionally) stores its image in
    // the in-memory blob fake under the product's ImageBlobKey, mirroring production.
    // Returns the product id to reference in a generation request.
    private async Task<Guid> SeedProductAsync(string name, bool withImage = true)
    {
        Guid productId = Guid.NewGuid();
        string? blobKey = null;

        using var scope = this.factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        if (withImage)
        {
            byte[] pngBytes = TestCanvas.SolidProductPng(100, 100, new Rgba32(200, 200, 200, 255));
            blobKey = $"products/{this.userId}/{Guid.NewGuid():N}.png";
            var blobs = (InMemoryBlobStorage)scope.ServiceProvider.GetRequiredService<IBlobStorage>();
            blobs.Seed(blobKey, pngBytes, "image/png");
        }

        db.Products.Add(new Product
        {
            Id = productId,
            UserId = this.userId,
            Name = name,
            Price = 9.99m,
            Currency = Currency.USD,
            ImageBlobKey = blobKey,
            ImageContentType = withImage ? "image/png" : null,
        });
        await db.SaveChangesAsync();
        return productId;
    }

    private async Task<string> RegisterAndGetTokenAsync(string email)
    {
        string uniqueId = "user-" + Guid.NewGuid();
        this.userId = uniqueId;
        this.userManagerMock
            .Setup(m => m.CreateAsync(It.IsAny<AppUser>(), It.IsAny<string>()))
            .Callback<AppUser, string>((user, _) =>
            {
                user.Id = uniqueId;
                user.Email = email;
                user.UserName = email;
            })
            .ReturnsAsync(IdentityResult.Success);

        var registerResponse = await this.client.PostAsJsonAsync(
            "/auth/register",
            new { email, password = "Test1234!" });
        registerResponse.EnsureSuccessStatusCode();

        // The wallet check on protected endpoints requires the AppUser to exist in the DB.
        // UserManager is mocked, so the register call doesn't persist anything — seed the
        // user directly with enough coins to pass EnsureCoinsAsync.
        using (var scope = this.factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.Add(new AppUser
            {
                Id = uniqueId,
                Email = email,
                UserName = email,
                CoinBalance = 100,
            });
            await db.SaveChangesAsync();
        }

        string body = await registerResponse.Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(body);
        return json.RootElement.GetProperty("token").GetString()!;
    }

    private async Task<HttpResponseMessage> SendCatalogAsync(string token, object payload)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/generate-image/catalog")
        {
            Content = JsonContent.Create(payload),
            Headers = { { "Authorization", $"Bearer {token}" } },
        };
        return await this.client.SendAsync(req);
    }
}
