using System.Security.Claims;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryImageGeneration.Models;
using MerchStoryImageGeneration.Services;
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

            return await HandleGeneration(
                () => catalogService.GenerateCatalogImageAsync(request.ToServiceRequest()),
                principal,
                db,
                logger,
                "catalog");
        })
        .WithName("GenerateCatalogImage")
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

            return await HandleGeneration(
                () => announcementService.GenerateAnnouncementImageAsync(request.ToServiceRequest()),
                principal,
                db,
                logger,
                "announcement");
        })
        .WithName("GenerateAnnouncementImage")
        .RequireAuthorization();
    }

    private static async Task<IResult> HandleGeneration(
        Func<Task<ImageGenerationResult>> generate,
        ClaimsPrincipal principal,
        AppDbContext db,
        ILogger logger,
        string generationType)
    {
        try
        {
            var result = await generate();
            string base64 = Convert.ToBase64String(result.ImageData);

            string? userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                          ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

            if (userId is not null)
            {
                db.GeneratedImages.Add(new GeneratedImage
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    ImageBase64 = base64,
                    MimeType = result.MimeType,
                    CreatedAt = DateTime.UtcNow,
                    GenerationType = generationType,
                });
                await db.SaveChangesAsync();
            }

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
    bool ShowPrices)
{
    public CatalogImageRequest ToServiceRequest() =>
        new(
            this.Products!.Select(p => new CatalogProductItem(p.Name, p.Price, p.ImageBase64)).ToList(),
            this.Layout,
            this.ColorTheme,
            this.Format,
            this.ShowPrices);
}

internal sealed record AnnouncementImageApiRequest(
    string PostType,
    string Content,
    string Tone,
    string Format)
{
    public AnnouncementImageRequest ToServiceRequest() =>
        new(this.PostType, this.Content, this.Tone, this.Format);
}
