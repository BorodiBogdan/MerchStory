using System.Security.Claims;
using MerchStoryAPI.Auth;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.Shop;

public static class ShopRoutes
{
    private static readonly string[] ValidDomains = ["Fashion", "Tech", "Food", "Beauty", "Market", "Other"];
    private static readonly string[] ValidAtmospheres = ["Urban", "Nature", "MinimalInterior", "ProfessionalStudio"];
    private static readonly string[] ValidShopTypes = ["Luxury", "DiscountOutlet", "ArtisanalHandmade"];

    public static void MapShopEndpoints(this WebApplication app)
    {
        RouteGroupBuilder group = app.MapGroup("/shop").RequireAuthorization();

        group.MapGet("/profile", async (
            ClaimsPrincipal principal,
            AppDbContext db) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            ShopProfile? profile = await db.ShopProfiles.SingleOrDefaultAsync(s => s.UserId == userId);
            if (profile is null)
            {
                return Results.NotFound();
            }

            return Results.Ok(MapToResponse(profile));
        });

        group.MapPost("/profile", async (
            ShopProfileRequest request,
            ClaimsPrincipal principal,
            AppDbContext db,
            ILogger<Program> logger) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            if (!ValidDomains.Contains(request.BusinessDomain))
            {
                return Results.BadRequest("Invalid BusinessDomain.");
            }

            if (request.Atmosphere is not null && !ValidAtmospheres.Contains(request.Atmosphere))
            {
                return Results.BadRequest("Invalid Atmosphere.");
            }

            if (!ValidShopTypes.Contains(request.ShopType))
            {
                return Results.BadRequest("Invalid ShopType.");
            }

            if (request.PrimaryColor is not null && !IsValidHex(request.PrimaryColor))
            {
                return Results.BadRequest("PrimaryColor must be a valid hex color (#RRGGBB).");
            }

            if (request.SecondaryColor is not null && !IsValidHex(request.SecondaryColor))
            {
                return Results.BadRequest("SecondaryColor must be a valid hex color (#RRGGBB).");
            }

            if (request.AccentColor is not null && !IsValidHex(request.AccentColor))
            {
                return Results.BadRequest("AccentColor must be a valid hex color (#RRGGBB).");
            }

            ShopProfile? existing = await db.ShopProfiles.SingleOrDefaultAsync(s => s.UserId == userId);
            DateTime now = DateTime.UtcNow;

            if (existing is null)
            {
                ShopProfile profile = new()
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    BrandName = request.BrandName.Trim(),
                    LogoBase64 = request.LogoBase64,
                    PrimaryColor = request.PrimaryColor,
                    SecondaryColor = request.SecondaryColor,
                    AccentColor = request.AccentColor,
                    Slogan = request.Slogan?.Trim(),
                    BusinessDomain = request.BusinessDomain,
                    TargetAudience = request.TargetAudience.Trim(),
                    Atmosphere = request.Atmosphere,
                    ShopType = request.ShopType,
                    Competitors = request.Competitors?.Trim(),
                    CreatedAt = now,
                    UpdatedAt = now,
                };

                db.ShopProfiles.Add(profile);
                await db.SaveChangesAsync();
                logger.LogInformation("ShopProfile created for user {UserId}", userId);
                return Results.Created("/shop/profile", MapToResponse(profile));
            }

            existing.BrandName = request.BrandName.Trim();
            existing.LogoBase64 = request.LogoBase64;
            existing.PrimaryColor = request.PrimaryColor;
            existing.SecondaryColor = request.SecondaryColor;
            existing.AccentColor = request.AccentColor;
            existing.Slogan = request.Slogan?.Trim();
            existing.BusinessDomain = request.BusinessDomain;
            existing.TargetAudience = request.TargetAudience.Trim();
            existing.Atmosphere = request.Atmosphere;
            existing.ShopType = request.ShopType;
            existing.Competitors = request.Competitors?.Trim();
            existing.UpdatedAt = now;

            await db.SaveChangesAsync();
            logger.LogInformation("ShopProfile updated for user {UserId}", userId);
            return Results.Ok(MapToResponse(existing));
        });

        group.MapPost("/logo", async (
            HttpRequest httpRequest,
            ClaimsPrincipal principal,
            AppDbContext db,
            ILogger<Program> logger) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            if (!httpRequest.HasFormContentType)
            {
                return Results.BadRequest("Multipart form required.");
            }

            IFormCollection form = await httpRequest.ReadFormAsync();
            IFormFile? file = form.Files.GetFile("logo");
            if (file is null || file.Length == 0)
            {
                return Results.BadRequest("No file provided.");
            }

            using MemoryStream ms = new();
            await file.CopyToAsync(ms);
            string base64 = Convert.ToBase64String(ms.ToArray());
            string mimeType = file.ContentType is { Length: > 0 } ct ? ct : "image/jpeg";
            string dataUri = $"data:{mimeType};base64,{base64}";

            ShopProfile? profile = await db.ShopProfiles.SingleOrDefaultAsync(s => s.UserId == userId);
            if (profile is not null)
            {
                profile.LogoBase64 = dataUri;
                profile.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }

            logger.LogInformation("Logo uploaded for user {UserId}", userId);
            return Results.Ok(new { logoBase64 = dataUri });
        });
    }

    private static string? GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

    private static bool IsValidHex(string color) =>
        color.Length == 7 && color[0] == '#' &&
        color[1..].All(c => char.IsAsciiHexDigit(c));

    private static ShopProfileResponse MapToResponse(ShopProfile p) =>
        new(
            p.Id,
            p.BrandName,
            p.LogoBase64,
            p.PrimaryColor,
            p.SecondaryColor,
            p.AccentColor,
            p.Slogan,
            p.BusinessDomain,
            p.TargetAudience,
            p.Atmosphere,
            p.ShopType,
            p.Competitors,
            p.CreatedAt,
            p.UpdatedAt);
}
