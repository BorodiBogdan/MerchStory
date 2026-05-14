using System.Security.Claims;
using System.Text.Json;
using MerchStoryAPI.Auth;
using MerchStoryAPI.Data;
using MerchStoryAPI.Geocoding;
using MerchStoryAPI.Models;
using MerchStoryAPI.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.Shop;

public static class ShopRoutes
{
    private static readonly string[] ValidDomains = ["Market", "Food", "Retail", "Fashion", "Other"];
    private static readonly string[] ValidShopTypes = ["Luxury", "MidRange", "Budget"];
    private static readonly TimeSpan LogoSasTtl = TimeSpan.FromMinutes(15);

    public static void MapShopEndpoints(this WebApplication app)
    {
        RouteGroupBuilder group = app.MapGroup("/shop").RequireAuthorization();

        group.MapGet("/profile", async (
            ClaimsPrincipal principal,
            AppDbContext db,
            IBlobStorage blobs) =>
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

            return Results.Ok(MapToResponse(profile, blobs));
        });

        group.MapPost("/profile", async (
            ShopProfileRequest request,
            ClaimsPrincipal principal,
            AppDbContext db,
            IGeocodingService geocoding,
            IBlobStorage blobs,
            ILogger<Program> logger,
            CancellationToken ct) =>
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

            if (!TryParseCurrency(request.Currency, out Currency currency))
            {
                return Results.BadRequest("Invalid Currency. Allowed values: USD, EUR, RON.");
            }

            if (!TryParseLanguage(request.GenerationLanguage, out AppLanguage generationLanguage))
            {
                return Results.BadRequest("Invalid GenerationLanguage. Allowed values: EN, RO.");
            }

            string[] validAddresses = request.Addresses.Where(a => !string.IsNullOrWhiteSpace(a)).ToArray();
            if (validAddresses.Length == 0)
            {
                return Results.BadRequest("At least one address is required.");
            }

            string countryCode;
            if (string.IsNullOrWhiteSpace(request.CountryCode))
            {
                countryCode = "RO";
            }
            else
            {
                string trimmed = request.CountryCode.Trim().ToUpperInvariant();
                if (trimmed.Length != 2 || !trimmed.All(char.IsAsciiLetter))
                {
                    return Results.BadRequest("Invalid CountryCode (must be ISO 3166-1 alpha-2, e.g. RO).");
                }

                countryCode = trimmed;
            }

            string? city = string.IsNullOrWhiteSpace(request.City) ? null : request.City.Trim();

            ShopProfile? existing = await db.ShopProfiles.SingleOrDefaultAsync(s => s.UserId == userId, ct);

            // Re-geocode only when the (city, countryCode) pair changes — keeps Nominatim usage low
            // and respects their fair-use policy.
            double? latitude = existing?.Latitude;
            double? longitude = existing?.Longitude;
            bool locationChanged = existing is null
                || !string.Equals(existing.City, city, StringComparison.Ordinal)
                || !string.Equals(existing.CountryCode, countryCode, StringComparison.Ordinal);
            if (locationChanged)
            {
                if (city is null)
                {
                    latitude = null;
                    longitude = null;
                }
                else
                {
                    GeocodeResult? geo = await geocoding.GeocodeAsync(city, countryCode, ct);
                    latitude = geo?.Latitude;
                    longitude = geo?.Longitude;
                }
            }

            DateTime now = DateTime.UtcNow;

            // The shop-setup form may inline a base64 logo into this JSON request
            // (legacy path) or the user may have already uploaded via /shop/logo
            // (in which case LogoBase64 here is null and we don't touch the existing key).
            (string? newLogoKey, string? newLogoContentType) = await UploadInlineLogoAsync(
                blobs,
                userId,
                request.LogoBase64,
                ct);

            if (existing is null)
            {
                ShopProfile profile = new()
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    BrandName = request.BrandName.Trim(),
                    LogoBlobKey = newLogoKey,
                    LogoContentType = newLogoContentType,
                    BrandColorsJson = JsonSerializer.Serialize(request.BrandColors),
                    Slogan = request.Slogan?.Trim(),
                    BusinessDomain = request.BusinessDomain,
                    OtherDomain = request.OtherDomain?.Trim(),
                    TargetAudience = request.TargetAudience?.Trim(),
                    ShopType = request.ShopType,
                    Competitors = request.Competitors?.Trim(),
                    City = city,
                    CountryCode = countryCode,
                    Latitude = latitude,
                    Longitude = longitude,
                    PhoneNumber = request.PhoneNumber.Trim(),
                    Email = request.Email.Trim(),
                    Addresses = JsonSerializer.Serialize(validAddresses),
                    InstagramHandle = request.InstagramHandle?.Trim(),
                    FacebookHandle = request.FacebookHandle?.Trim(),
                    TikTokHandle = request.TikTokHandle?.Trim(),
                    Currency = currency,
                    GenerationLanguage = generationLanguage,
                    CreatedAt = now,
                    UpdatedAt = now,
                };

                db.ShopProfiles.Add(profile);
                await db.SaveChangesAsync(ct);
                return Results.Created("/shop/profile", MapToResponse(profile, blobs));
            }

            existing.BrandName = request.BrandName.Trim();
            if (newLogoKey is not null)
            {
                if (!string.IsNullOrEmpty(existing.LogoBlobKey))
                {
                    await blobs.DeleteAsync(existing.LogoBlobKey, ct);
                }

                existing.LogoBlobKey = newLogoKey;
                existing.LogoContentType = newLogoContentType;
            }

            existing.BrandColorsJson = JsonSerializer.Serialize(request.BrandColors);
            existing.Slogan = request.Slogan?.Trim();
            existing.BusinessDomain = request.BusinessDomain;
            existing.OtherDomain = request.OtherDomain?.Trim();
            existing.TargetAudience = request.TargetAudience?.Trim();
            existing.ShopType = request.ShopType;
            existing.Competitors = request.Competitors?.Trim();
            existing.City = city;
            existing.CountryCode = countryCode;
            existing.Latitude = latitude;
            existing.Longitude = longitude;
            existing.PhoneNumber = request.PhoneNumber.Trim();
            existing.Email = request.Email.Trim();
            existing.Addresses = JsonSerializer.Serialize(validAddresses);
            existing.InstagramHandle = request.InstagramHandle?.Trim();
            existing.FacebookHandle = request.FacebookHandle?.Trim();
            existing.TikTokHandle = request.TikTokHandle?.Trim();
            existing.Currency = currency;
            existing.GenerationLanguage = generationLanguage;
            existing.UpdatedAt = now;

            await db.SaveChangesAsync(ct);
            return Results.Ok(MapToResponse(existing, blobs));
        });

        group.MapPost("/logo", async (
            HttpRequest httpRequest,
            ClaimsPrincipal principal,
            AppDbContext db,
            IBlobStorage blobs,
            ILogger<Program> logger,
            CancellationToken ct) =>
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

            IFormCollection form = await httpRequest.ReadFormAsync(ct);
            IFormFile? file = form.Files.GetFile("logo");
            if (file is null || file.Length == 0)
            {
                return Results.BadRequest("No file provided.");
            }

            string mimeType = file.ContentType is { Length: > 0 } cType ? cType : "image/jpeg";
            string ext = ExtensionForContentType(mimeType);

            await using Stream stream = file.OpenReadStream();
            BlobRef uploaded = await blobs.UploadAsync("logos", userId, stream, mimeType, ext, ct);

            ShopProfile? profile = await db.ShopProfiles.SingleOrDefaultAsync(s => s.UserId == userId, ct);
            string? oldKey = profile?.LogoBlobKey;
            if (profile is not null)
            {
                profile.LogoBlobKey = uploaded.Key;
                profile.LogoContentType = uploaded.ContentType;
                profile.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
            }

            if (!string.IsNullOrEmpty(oldKey))
            {
                await blobs.DeleteAsync(oldKey, ct);
            }

            string url = blobs.GetReadUrl(uploaded.Key, LogoSasTtl).ToString();
            return Results.Ok(new { logoUrl = url });
        });
    }

    internal static bool TryParseCurrency(string? value, out Currency currency)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            currency = Currency.USD;
            return true;
        }

        return Enum.TryParse(value.Trim(), ignoreCase: true, out currency)
            && Enum.IsDefined(currency);
    }

    internal static bool TryParseLanguage(string? value, out AppLanguage language)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            language = AppLanguage.EN;
            return true;
        }

        return Enum.TryParse(value.Trim(), ignoreCase: true, out language)
            && Enum.IsDefined(language);
    }

    internal static ShopProfileResponse MapToResponse(ShopProfile p, IBlobStorage blobs)
    {
        string[] addresses = string.IsNullOrEmpty(p.Addresses)
            ? []
            : JsonSerializer.Deserialize<string[]>(p.Addresses) ?? [];

        BrandColorDto[] brandColors = string.IsNullOrEmpty(p.BrandColorsJson)
            ? []
            : JsonSerializer.Deserialize<BrandColorDto[]>(p.BrandColorsJson) ?? [];

        string? logoUrl = string.IsNullOrEmpty(p.LogoBlobKey)
            ? null
            : blobs.GetReadUrl(p.LogoBlobKey, LogoSasTtl).ToString();

        return new(
            p.Id,
            p.BrandName,
            logoUrl,
            brandColors,
            p.Slogan,
            p.BusinessDomain,
            p.OtherDomain,
            p.TargetAudience,
            p.ShopType,
            p.Competitors,
            p.City,
            p.CountryCode,
            p.Latitude,
            p.Longitude,
            p.PhoneNumber,
            p.Email,
            addresses,
            p.InstagramHandle,
            p.FacebookHandle,
            p.TikTokHandle,
            p.Currency.ToString(),
            p.GenerationLanguage.ToString(),
            p.CreatedAt,
            p.UpdatedAt);
    }

    // Inline JSON-body logo (used by the shop-setup form). Strips the optional
    // "data:image/...;base64," prefix, uploads the bytes to blob, returns the
    // (key, contentType) pair so the caller can persist them on the model.
    private static async Task<(string? Key, string? ContentType)> UploadInlineLogoAsync(
        IBlobStorage blobs,
        string userId,
        string? logoBase64,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(logoBase64))
        {
            return (null, null);
        }

        string contentType = "image/png";
        string payload = logoBase64;
        const string prefix = "data:";
        if (payload.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            int comma = payload.IndexOf(',', StringComparison.Ordinal);
            if (comma <= prefix.Length)
            {
                return (null, null);
            }

            string header = payload[prefix.Length..comma];
            int semi = header.IndexOf(';', StringComparison.Ordinal);
            if (semi > 0)
            {
                contentType = header[..semi];
            }

            payload = payload[(comma + 1)..];
        }

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(payload);
        }
        catch (FormatException)
        {
            return (null, null);
        }

        if (bytes.Length == 0)
        {
            return (null, null);
        }

        using MemoryStream ms = new(bytes);
        BlobRef uploaded = await blobs.UploadAsync(
            "logos",
            userId,
            ms,
            contentType,
            ExtensionForContentType(contentType),
            ct);
        return (uploaded.Key, uploaded.ContentType);
    }

    private static string ExtensionForContentType(string contentType) =>
        contentType.ToLowerInvariant() switch
        {
            "image/png" => ".png",
            "image/jpeg" or "image/jpg" => ".jpg",
            "image/webp" => ".webp",
            "image/gif" => ".gif",
            _ => ".png",
        };

    private static string? GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

    private static bool IsValidHex(string color) =>
        color.Length == 7 && color[0] == '#' &&
        color[1..].All(c => char.IsAsciiHexDigit(c));
}
