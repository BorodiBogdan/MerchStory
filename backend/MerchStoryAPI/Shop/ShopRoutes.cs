using System.Security.Claims;
using System.Text.Json;
using MerchStoryAPI.Auth;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.Shop;

public static class ShopRoutes
{
    private static readonly string[] ValidDomains = ["Market", "Food", "Retail", "Fashion", "Other"];
    private static readonly string[] ValidShopTypes = ["Luxury", "MidRange", "Budget"];

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

            if (request.BusinessDomain == "Other" && string.IsNullOrWhiteSpace(request.OtherDomain))
            {
                return Results.BadRequest("OtherDomain is required when BusinessDomain is 'Other'.");
            }

            if (request.ShopType is not null && request.ShopType.Length > 0 && !ValidShopTypes.Contains(request.ShopType))
            {
                return Results.BadRequest("Invalid ShopType.");
            }

            if (request.BrandColors is null || request.BrandColors.Count == 0)
            {
                return Results.BadRequest("At least one brand color is required.");
            }

            if (request.BrandColors.Count > 5)
            {
                return Results.BadRequest("A maximum of 5 brand colors is allowed.");
            }

            foreach (BrandColorDto bc in request.BrandColors)
            {
                if (!IsValidHex(bc.Hex))
                {
                    return Results.BadRequest($"Brand color '{bc.Hex}' is not a valid hex color (#RRGGBB).");
                }

                if (bc.Percentage < 0 || bc.Percentage > 100)
                {
                    return Results.BadRequest("Each brand color percentage must be between 0 and 100.");
                }
            }

            int totalPct = request.BrandColors.Sum(bc => bc.Percentage);
            if (totalPct != 100)
            {
                return Results.BadRequest($"Brand color percentages must sum to 100 (got {totalPct}).");
            }

            if (!request.Email.Contains('@'))
            {
                return Results.BadRequest("Email must be a valid email address.");
            }

            string[] validAddresses = request.Addresses.Where(a => !string.IsNullOrWhiteSpace(a)).ToArray();
            if (validAddresses.Length == 0)
            {
                return Results.BadRequest("At least one address is required.");
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
                    BrandColorsJson = JsonSerializer.Serialize(request.BrandColors),
                    Slogan = request.Slogan?.Trim(),
                    BusinessDomain = request.BusinessDomain,
                    OtherDomain = request.OtherDomain?.Trim(),
                    TargetAudience = request.TargetAudience?.Trim(),
                    ShopType = request.ShopType,
                    Competitors = request.Competitors?.Trim(),
                    PhoneNumber = request.PhoneNumber.Trim(),
                    Email = request.Email.Trim(),
                    Addresses = JsonSerializer.Serialize(validAddresses),
                    InstagramHandle = request.InstagramHandle?.Trim(),
                    FacebookHandle = request.FacebookHandle?.Trim(),
                    TikTokHandle = request.TikTokHandle?.Trim(),
                    CreatedAt = now,
                    UpdatedAt = now,
                };

                db.ShopProfiles.Add(profile);
                await db.SaveChangesAsync();
                return Results.Created("/shop/profile", MapToResponse(profile));
            }

            existing.BrandName = request.BrandName.Trim();
            existing.LogoBase64 = request.LogoBase64;
            existing.BrandColorsJson = JsonSerializer.Serialize(request.BrandColors);
            existing.Slogan = request.Slogan?.Trim();
            existing.BusinessDomain = request.BusinessDomain;
            existing.OtherDomain = request.OtherDomain?.Trim();
            existing.TargetAudience = request.TargetAudience?.Trim();
            existing.ShopType = request.ShopType;
            existing.Competitors = request.Competitors?.Trim();
            existing.PhoneNumber = request.PhoneNumber.Trim();
            existing.Email = request.Email.Trim();
            existing.Addresses = JsonSerializer.Serialize(validAddresses);
            existing.InstagramHandle = request.InstagramHandle?.Trim();
            existing.FacebookHandle = request.FacebookHandle?.Trim();
            existing.TikTokHandle = request.TikTokHandle?.Trim();
            existing.UpdatedAt = now;

            await db.SaveChangesAsync();
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

            return Results.Ok(new { logoBase64 = dataUri });
        });
    }

    private static string? GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

    private static bool IsValidHex(string color) =>
        color.Length == 7 && color[0] == '#' &&
        color[1..].All(c => char.IsAsciiHexDigit(c));

    private static ShopProfileResponse MapToResponse(ShopProfile p)
    {
        string[] addresses = string.IsNullOrEmpty(p.Addresses)
            ? []
            : JsonSerializer.Deserialize<string[]>(p.Addresses) ?? [];

        BrandColorDto[] brandColors = string.IsNullOrEmpty(p.BrandColorsJson)
            ? []
            : JsonSerializer.Deserialize<BrandColorDto[]>(p.BrandColorsJson) ?? [];

        return new(
            p.Id,
            p.BrandName,
            p.LogoBase64,
            brandColors,
            p.Slogan,
            p.BusinessDomain,
            p.OtherDomain,
            p.TargetAudience,
            p.ShopType,
            p.Competitors,
            p.PhoneNumber,
            p.Email,
            addresses,
            p.InstagramHandle,
            p.FacebookHandle,
            p.TikTokHandle,
            p.CreatedAt,
            p.UpdatedAt);
    }
}
