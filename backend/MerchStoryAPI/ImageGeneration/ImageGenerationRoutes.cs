using System.Security.Claims;
using System.Text.Json;
using MerchStoryAPI.Auth;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryImageGeneration.Models;
using MerchStoryImageGeneration.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.ImageGeneration;

public static class ImageGenerationRoutes
{
    public static void MapImageGenerationEndpoints(this WebApplication app)
    {
        app.MapPost("/generate-image/catalog", async (
            CatalogImageApiRequest request,
            ClaimsPrincipal principal,
            ICatalogImageService catalogService,
            AppDbContext db,
            ILogger<Program> logger) =>
        {
            if (request.Products is null || request.Products.Count == 0)
            {
                return Results.BadRequest(new { error = "At least one product is required." });
            }

            string? userId = GetUserId(principal);
            BrandContext? brandContext = await BuildBrandContextAsync(db, userId, request.BrandContextFields);

            return await HandleGeneration(
                () => catalogService.GenerateCatalogImageAsync(request.ToServiceRequest(brandContext)),
                logger);
        })
        .WithName("GenerateCatalogImage")
        .RequireAuthorization();

        app.MapPost("/generate-image/wallpaper", async (
            WallpaperApiRequest request,
            ClaimsPrincipal principal,
            IWallpaperImageService wallpaperService,
            AppDbContext db,
            ILogger<Program> logger) =>
        {
            string? userId = GetUserId(principal);
            BrandContext? brandContext = await BuildBrandContextAsync(db, userId, request.BrandContextFields);
            string? brandLogo = null;

            if (request.IncludeLogo)
            {
                brandLogo = await db.ShopProfiles
                .Where(s => s.UserId == userId)
                .Select(s => s.LogoBase64)
                .FirstOrDefaultAsync();
            }

            return await HandleGeneration(
                () => wallpaperService.GenerateWallpaperAsync(request.ToServiceRequest(brandContext, brandLogo)),
                logger);
        })
        .WithName("GenerateWallpaper")
        .RequireAuthorization();

        app.MapPost("/generate-image/catalog-on-wallpaper", async (
            CatalogOnWallpaperApiRequest request,
            ILogger<Program> logger) =>
        {
            if (request.Products is null || request.Products.Count == 0)
            {
                return Results.BadRequest(new { error = "At least one product is required." });
            }

            if (string.IsNullOrWhiteSpace(request.WallpaperBase64))
            {
                return Results.BadRequest(new { error = "Wallpaper image is required." });
            }

            return await HandleGeneration(
                () => Task.FromResult(CatalogCompositor.Composite(request)),
                logger);
        })
        .WithName("GenerateCatalogOnWallpaper")
        .RequireAuthorization();

        app.MapPost("/generate-image/announcement", async (
            AnnouncementImageApiRequest request,
            ClaimsPrincipal principal,
            IAnnouncementImageService announcementService,
            AppDbContext db,
            ILogger<Program> logger) =>
        {
            if (string.IsNullOrWhiteSpace(request.Content))
            {
                return Results.BadRequest(new { error = "Content must not be empty." });
            }

            string? userId = GetUserId(principal);
            BrandContext? brandContext = await BuildBrandContextAsync(db, userId, request.BrandContextFields);

            return await HandleGeneration(
                () => announcementService.GenerateAnnouncementImageAsync(request.ToServiceRequest(brandContext)),
                logger);
        })
        .WithName("GenerateAnnouncementImage")
        .RequireAuthorization();
    }

    private static string? GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

    private static async Task<BrandContext?> BuildBrandContextAsync(
        AppDbContext db,
        string? userId,
        List<string>? selectedFields)
    {
        if (userId is null || selectedFields is null || selectedFields.Count == 0)
        {
            return null;
        }

        ShopProfile? profile = await db.ShopProfiles
            .AsNoTracking()
            .SingleOrDefaultAsync(s => s.UserId == userId);

        if (profile is null)
        {
            return null;
        }

        var fields = new HashSet<string>(selectedFields, StringComparer.OrdinalIgnoreCase);

        string? brandColors = null;
        if (fields.Contains("brandColors") && !string.IsNullOrEmpty(profile.BrandColorsJson))
        {
            BrandColorDto[]? colors = JsonSerializer.Deserialize<BrandColorDto[]>(profile.BrandColorsJson);
            if (colors is { Length: > 0 })
            {
                brandColors = string.Join(", ", colors.Select(c => $"{c.Hex} ({c.Percentage}%)"));
            }
        }

        string? addresses = null;
        if (fields.Contains("addresses") && !string.IsNullOrEmpty(profile.Addresses))
        {
            string[]? addrs = JsonSerializer.Deserialize<string[]>(profile.Addresses);
            if (addrs is { Length: > 0 })
            {
                addresses = string.Join("; ", addrs);
            }
        }

        return new BrandContext(
            BrandName: fields.Contains("brandName") ? profile.BrandName : null,
            Slogan: fields.Contains("slogan") ? profile.Slogan : null,
            BrandColors: brandColors,
            BusinessDomain: fields.Contains("businessDomain") ? profile.BusinessDomain : null,
            ShopType: fields.Contains("shopType") ? profile.ShopType : null,
            TargetAudience: fields.Contains("targetAudience") ? profile.TargetAudience : null,
            Competitors: fields.Contains("competitors") ? profile.Competitors : null,
            PhoneNumber: fields.Contains("phoneNumber") ? profile.PhoneNumber : null,
            Email: fields.Contains("email") ? profile.Email : null,
            Addresses: addresses,
            InstagramHandle: fields.Contains("instagramHandle") ? profile.InstagramHandle : null,
            FacebookHandle: fields.Contains("facebookHandle") ? profile.FacebookHandle : null,
            TikTokHandle: fields.Contains("tikTokHandle") ? profile.TikTokHandle : null);
    }

    private static async Task<IResult> HandleGeneration(
        Func<Task<ImageGenerationResult>> generate,
        ILogger logger)
    {
        try
        {
            ImageGenerationResult result = await generate();
            string base64 = Convert.ToBase64String(result.ImageData);
            return Results.Ok(new { imageBase64 = base64, mimeType = result.MimeType });
        }
        catch (InvalidOperationException ex)
            when (ex.Message.Contains("not configured", StringComparison.OrdinalIgnoreCase))
        {
            logger.LogError("{Message}", ex.Message);
            return Results.Problem("Image generation is not configured.", statusCode: 503);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Image generation failed.");
            return Results.Problem("Image generation failed.", statusCode: 502);
        }
    }
}

// ── API-layer DTOs ────────────────────────────────────────────────────────────
internal sealed record CatalogProductApiItem(string Name, decimal Price, string? ImageBase64);

internal sealed record CatalogImageApiRequest(
    List<CatalogProductApiItem>? Products,
    string Layout,
    string ColorTheme,
    string Format,
    bool ShowPrices,
    List<string>? BrandContextFields)
{
    public CatalogImageRequest ToServiceRequest(BrandContext? brandContext) =>
        new(
            this.Products!.Select(p => new CatalogProductItem(p.Name, p.Price, p.ImageBase64)).ToList(),
            this.Layout,
            this.ColorTheme,
            this.Format,
            this.ShowPrices,
            brandContext);
}

internal sealed record WallpaperApiRequest(string Prompt, string Format, bool IncludeLogo, List<string>? BrandContextFields)
{
    public WallpaperImageRequest ToServiceRequest(BrandContext? brandContext, string? brandLogo) =>
        new(
            Format: this.Format,
            UserPrompt: this.Prompt,
            InlineImages: string.IsNullOrWhiteSpace(brandLogo) ? null : [brandLogo],
            BrandContext: brandContext);
}

internal sealed record PlacementZone(
    double X,
    double Y,
    double Width,
    double Height);

internal sealed record CatalogOnWallpaperApiRequest(
    List<CatalogProductApiItem>? Products,
    string WallpaperBase64,
    string Layout,
    string Format,
    bool ShowPrices,
    TextStyleOptions? TextStyle = null,
    PlacementZone? PlacementZone = null);

internal sealed record AnnouncementImageApiRequest(
    string PostType,
    string Content,
    string Tone,
    string Format,
    List<string>? BrandContextFields)
{
    public AnnouncementImageRequest ToServiceRequest(BrandContext? brandContext) =>
        new(this.PostType, this.Content, this.Tone, this.Format, brandContext);
}
