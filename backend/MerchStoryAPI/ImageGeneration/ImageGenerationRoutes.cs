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

            string[] distinctCurrencies = request.Products
                .Select(p => (p.Currency ?? "USD").Trim().ToUpperInvariant())
                .Distinct()
                .ToArray();

            if (distinctCurrencies.Length > 1)
            {
                return Results.BadRequest(new
                {
                    error = "All products in a catalog must use the same currency.",
                    currencies = distinctCurrencies,
                });
            }

            string resolvedCurrency = distinctCurrencies.Length == 1 ? distinctCurrencies[0] : "USD";

            string? userId = GetUserId(principal);
            string? logoBase64 = await FetchLogoIfRequestedAsync(db, userId, request.BrandContextFields);
            List<string>? textFields = StripLogoField(request.BrandContextFields);
            BrandContext? brandContext = await BuildBrandContextAsync(db, userId, textFields);

            string resolvedLanguage = await ResolveLanguageAsync(db, userId, request.Language);

            return await HandleGeneration(
                () => catalogService.GenerateCatalogImageAsync(request.ToServiceRequest(brandContext, logoBase64, resolvedCurrency, resolvedLanguage)),
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

            string wallpaperLanguage = await ResolveLanguageAsync(db, userId, request.Language);

            return await HandleGeneration(
                () => wallpaperService.GenerateWallpaperAsync(request.ToServiceRequest(brandContext, brandLogo, wallpaperLanguage)),
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

            string[] currencies = request.Products
                .Select(p => (p.Currency ?? "USD").Trim().ToUpperInvariant())
                .Distinct()
                .ToArray();

            if (currencies.Length > 1)
            {
                return Results.BadRequest(new
                {
                    error = "All products in a catalog must use the same currency.",
                    currencies,
                });
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
            bool isJobPost = string.Equals(request.PostType, "Job Post", StringComparison.OrdinalIgnoreCase);

            if (isJobPost)
            {
                if (string.IsNullOrWhiteSpace(request.JobTitle))
                {
                    return Results.BadRequest(new { error = "Job title is required for job posts." });
                }

                if (string.IsNullOrWhiteSpace(request.JobSchedule))
                {
                    return Results.BadRequest(new { error = "Work schedule is required for job posts." });
                }

                if (!string.IsNullOrWhiteSpace(request.JobImageStyle)
                    && !string.Equals(request.JobImageStyle, "with-person", StringComparison.OrdinalIgnoreCase)
                    && !string.Equals(request.JobImageStyle, "text-only", StringComparison.OrdinalIgnoreCase))
                {
                    return Results.BadRequest(new { error = "Job image style must be 'with-person' or 'text-only'." });
                }
            }
            else if (string.IsNullOrWhiteSpace(request.Content))
            {
                return Results.BadRequest(new { error = "Content must not be empty." });
            }

            string? userId = GetUserId(principal);
            string? logoBase64 = await FetchLogoIfRequestedAsync(db, userId, request.BrandContextFields);
            List<string>? textFields = StripLogoField(request.BrandContextFields);
            BrandContext? brandContext = await BuildBrandContextAsync(db, userId, textFields);
            string announcementLanguage = await ResolveLanguageAsync(db, userId, request.Language);

            return await HandleGeneration(
                () => announcementService.GenerateAnnouncementImageAsync(request.ToServiceRequest(brandContext, logoBase64, announcementLanguage)),
                logger);
        })
        .WithName("GenerateAnnouncementImage")
        .RequireAuthorization();
    }

    private static async Task<string> ResolveLanguageAsync(AppDbContext db, string? userId, string? requestedLanguage)
    {
        if (!string.IsNullOrWhiteSpace(requestedLanguage))
        {
            return requestedLanguage!.Trim().ToUpperInvariant();
        }

        if (userId is null)
        {
            return "EN";
        }

        AppLanguage lang = await db.ShopProfiles
            .Where(s => s.UserId == userId)
            .Select(s => s.GenerationLanguage)
            .FirstOrDefaultAsync();

        return lang.ToString();
    }

    private static string? GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

    private static List<string>? StripLogoField(List<string>? fields) =>
        fields is null
            ? null
            : fields
                .Where(f => !f.Equals("logoBase64", StringComparison.OrdinalIgnoreCase))
                .ToList() is { Count: > 0 } result
                    ? result
                    : null;

    private static async Task<string?> FetchLogoIfRequestedAsync(
        AppDbContext db,
        string? userId,
        List<string>? fields)
    {
        if (userId is null || fields is null)
        {
            return null;
        }

        if (!fields.Any(f => f.Equals("logoBase64", StringComparison.OrdinalIgnoreCase)))
        {
            return null;
        }

        return await db.ShopProfiles
            .Where(s => s.UserId == userId)
            .Select(s => s.LogoBase64)
            .FirstOrDefaultAsync();
    }

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
internal sealed record CatalogProductApiItem(string Name, decimal Price, string? ImageBase64, string Currency = "USD");

internal sealed record CatalogImageApiRequest(
    List<CatalogProductApiItem>? Products,
    string Layout,
    string ColorTheme,
    string Format,
    bool ShowPrices,
    List<string>? BrandContextFields,
    string? Currency = null,
    string? Language = null)
{
    public CatalogImageRequest ToServiceRequest(BrandContext? brandContext, string? logoBase64, string currency, string language) =>
        new(
            this.Products!.Select(p => new CatalogProductItem(p.Name, p.Price, p.ImageBase64)).ToList(),
            this.Layout,
            this.ColorTheme,
            this.Format,
            this.ShowPrices,
            brandContext,
            logoBase64,
            currency,
            language);
}

internal sealed record WallpaperApiRequest(string Prompt, string Format, bool IncludeLogo, List<string>? BrandContextFields, string? Language = null)
{
    public WallpaperImageRequest ToServiceRequest(BrandContext? brandContext, string? brandLogo, string language) =>
        new(
            Format: this.Format,
            UserPrompt: this.Prompt,
            InlineImages: string.IsNullOrWhiteSpace(brandLogo) ? null : [brandLogo],
            BrandContext: brandContext,
            Language: language);
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
    bool ShowPrices,
    bool ShowProductNames = true,
    TextStyleOptions? TextStyle = null,
    PlacementZone? PlacementZone = null);

internal sealed record AnnouncementImageApiRequest(
    string PostType,
    string Content,
    string Tone,
    string Format,
    List<string>? BrandContextFields,
    List<string>? ProductImages = null,
    string? JobTitle = null,
    string? JobSchedule = null,
    string? JobSalary = null,
    string? JobImageStyle = null,
    List<string>? JobRequirements = null,
    string? Language = null)
{
    public AnnouncementImageRequest ToServiceRequest(BrandContext? brandContext, string? logoBase64, string language) =>
        new(
            this.PostType,
            this.Content ?? string.Empty,
            this.Tone,
            this.Format,
            brandContext,
            this.ProductImages,
            logoBase64,
            this.JobTitle,
            this.JobSchedule,
            this.JobSalary,
            this.JobImageStyle,
            this.JobRequirements,
            language);
}
