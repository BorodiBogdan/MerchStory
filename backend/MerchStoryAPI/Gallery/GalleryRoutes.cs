using System.Security.Claims;
using MerchStoryAPI.Common;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryAPI.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.Gallery;

public static class GalleryRoutes
{
    private static readonly TimeSpan GallerySasTtl = TimeSpan.FromMinutes(15);

    public static void MapGalleryEndpoints(this WebApplication app)
    {
        RouteGroupBuilder group = app.MapGroup("/gallery").RequireAuthorization();

        group.MapPost("/save", async (
            SaveImageRequest req,
            ClaimsPrincipal principal,
            AppDbContext db,
            IBlobStorage blobs,
            CancellationToken ct) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            string name = (req.Name ?? string.Empty).Trim();
            if (name.Length == 0)
            {
                return Results.BadRequest(new { detail = "Name is required." });
            }

            if (name.Length > 80)
            {
                return Results.BadRequest(new { detail = "Name must be 80 characters or fewer." });
            }

            if (string.IsNullOrWhiteSpace(req.GenerationType) ||
                !GenerationTypes.All.Contains(req.GenerationType))
            {
                return Results.BadRequest(new { detail = "Unknown generation type." });
            }

            bool nameTaken = await db.GeneratedImages
                .AnyAsync(g => g.UserId == userId && g.Name.ToLower() == name.ToLower(), ct);
            if (nameTaken)
            {
                return Results.Conflict(new { detail = "You already have an image with that name." });
            }

            byte[] bytes;
            try
            {
                bytes = DecodeBase64(req.ImageBase64);
            }
            catch (FormatException)
            {
                return Results.BadRequest(new { detail = "Invalid base64 image payload." });
            }

            string ext = ExtensionForContentType(req.MimeType);
            using MemoryStream ms = new(bytes);
            BlobRef uploaded = await blobs.UploadAsync("gallery", userId, ms, req.MimeType, ext, ct);

            GeneratedImage created = new()
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                ImageBlobKey = uploaded.Key,
                MimeType = req.MimeType,
                CreatedAt = DateTime.UtcNow,
                GenerationType = req.GenerationType,
                Name = name,
            };
            db.GeneratedImages.Add(created);
            await db.SaveChangesAsync(ct);

            return Results.Created(
                $"/gallery/{created.Id}",
                new GalleryItemMetadata(
                    created.Id,
                    created.MimeType,
                    created.CreatedAt,
                    created.Name,
                    created.GenerationType,
                    created.AssetType,
                    created.PaperSize));
        });

        group.MapGet("/", async (
            ClaimsPrincipal principal,
            AppDbContext db,
            string? type,
            string? assetType,
            DateTime? from,
            DateTime? to,
            string? search,
            int? page,
            int? pageSize) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            IQueryable<GeneratedImage> q = db.GeneratedImages.Where(g => g.UserId == userId);

            string resolvedAssetType = string.IsNullOrWhiteSpace(assetType) ? "Photo" : assetType.Trim();
            if (resolvedAssetType == "Photo")
            {
                // Treat legacy rows with empty/null AssetType as photos.
                q = q.Where(g => g.AssetType != "Pdf" && g.AssetType != "Video");
            }
            else if (resolvedAssetType is "Video" or "Pdf")
            {
                q = q.Where(g => g.AssetType == resolvedAssetType);
            }

            if (!string.IsNullOrWhiteSpace(type))
            {
                string[] typeList = type
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Where(t => GenerationTypes.All.Contains(t))
                    .ToArray();
                if (typeList.Length > 0)
                {
                    q = q.Where(g => g.GenerationType != null && typeList.Contains(g.GenerationType));
                }
            }

            if (from is not null)
            {
                DateTime fromUtc = DateTime.SpecifyKind(from.Value.Date, DateTimeKind.Utc);
                q = q.Where(g => g.CreatedAt >= fromUtc);
            }

            if (to is not null)
            {
                DateTime toUtc = DateTime.SpecifyKind(to.Value.Date.AddDays(1), DateTimeKind.Utc);
                q = q.Where(g => g.CreatedAt < toUtc);
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                string pattern = $"%{search.Trim()}%";
                q = q.Where(g => EF.Functions.ILike(g.Name, pattern));
            }

            int resolvedPage = Math.Max(1, page ?? 1);
            int resolvedPageSize = Math.Clamp(pageSize ?? 24, 1, 100);

            int total = await q.CountAsync();

            // List returns metadata only — image bytes are served by /gallery/{id}/image
            List<GalleryItemMetadata> items = await q
                .OrderByDescending(g => g.CreatedAt)
                .Skip((resolvedPage - 1) * resolvedPageSize)
                .Take(resolvedPageSize)
                .Select(g => new GalleryItemMetadata(
                    g.Id,
                    g.MimeType,
                    g.CreatedAt,
                    g.Name,
                    g.GenerationType,
                    g.AssetType,
                    g.PaperSize))
                .ToListAsync();

            return Results.Ok(new PagedResponse<GalleryItemMetadata>(items, total, resolvedPage, resolvedPageSize));
        });

        group.MapGet("/{id:guid}/image", async (
            Guid id,
            ClaimsPrincipal principal,
            AppDbContext db,
            IBlobStorage blobs) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var image = await db.GeneratedImages
                .Where(g => g.Id == id && g.UserId == userId)
                .Select(g => new { g.ImageBlobKey, g.MimeType })
                .SingleOrDefaultAsync();

            if (image is null)
            {
                return Results.NotFound();
            }

            string? url = string.IsNullOrEmpty(image.ImageBlobKey)
                ? null
                : blobs.GetReadUrl(image.ImageBlobKey, GallerySasTtl).ToString();
            return Results.Ok(new GalleryImageBytes(url, image.MimeType));
        });

        // Returns the raw image as base64, fetched server-side from blob storage.
        // Display paths use the SAS URL from /image, but callers that need the
        // bytes in-process (e.g. inlining a saved wallpaper into a catalog request)
        // can't fetch the SAS URL from a browser without CORS on the storage
        // account. This proxies the bytes through our own authenticated API.
        group.MapGet("/{id:guid}/image/raw", async (
            Guid id,
            ClaimsPrincipal principal,
            AppDbContext db,
            IBlobStorage blobs,
            CancellationToken ct) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var image = await db.GeneratedImages
                .Where(g => g.Id == id && g.UserId == userId)
                .Select(g => new { g.ImageBlobKey, g.MimeType })
                .SingleOrDefaultAsync(ct);

            if (image is null)
            {
                return Results.NotFound();
            }

            if (string.IsNullOrEmpty(image.ImageBlobKey))
            {
                return Results.NotFound();
            }

            byte[] bytes = await blobs.DownloadAsync(image.ImageBlobKey, ct);
            return Results.Ok(new GalleryImageRaw(Convert.ToBase64String(bytes), image.MimeType));
        });

        group.MapPatch("/{id:guid}", async (
            Guid id,
            UpdateGalleryItemRequest req,
            ClaimsPrincipal principal,
            AppDbContext db) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            string name = (req.Name ?? string.Empty).Trim();
            if (name.Length == 0)
            {
                return Results.BadRequest(new { detail = "Name is required." });
            }

            if (name.Length > 80)
            {
                return Results.BadRequest(new { detail = "Name must be 80 characters or fewer." });
            }

            GeneratedImage? image = await db.GeneratedImages
                .SingleOrDefaultAsync(g => g.Id == id && g.UserId == userId);
            if (image is null)
            {
                return Results.NotFound();
            }

            if (!string.Equals(image.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                bool nameTaken = await db.GeneratedImages
                    .AnyAsync(g => g.UserId == userId && g.Id != id && g.Name.ToLower() == name.ToLower());
                if (nameTaken)
                {
                    return Results.Conflict(new { detail = "You already have an image with that name." });
                }
            }

            image.Name = name;
            await db.SaveChangesAsync();

            return Results.Ok(new GalleryItemMetadata(
                image.Id,
                image.MimeType,
                image.CreatedAt,
                image.Name,
                image.GenerationType,
                image.AssetType,
                image.PaperSize));
        });

        group.MapDelete("/{id:guid}", async (
            Guid id,
            ClaimsPrincipal principal,
            AppDbContext db,
            IBlobStorage blobs,
            CancellationToken ct) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            GeneratedImage? image = await db.GeneratedImages
                .SingleOrDefaultAsync(g => g.Id == id && g.UserId == userId, ct);

            if (image is null)
            {
                return Results.NotFound();
            }

            string? blobKey = image.ImageBlobKey;
            db.GeneratedImages.Remove(image);
            await db.SaveChangesAsync(ct);

            if (!string.IsNullOrEmpty(blobKey))
            {
                await blobs.DeleteAsync(blobKey, ct);
            }

            return Results.NoContent();
        });
    }

    private static string? GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

    private static byte[] DecodeBase64(string raw)
    {
        const string prefix = "data:";
        if (raw.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            int comma = raw.IndexOf(',', StringComparison.Ordinal);
            return Convert.FromBase64String(raw[(comma + 1)..]);
        }

        return Convert.FromBase64String(raw);
    }

    private static string ExtensionForContentType(string contentType) =>
        contentType.ToLowerInvariant() switch
        {
            "image/png" => ".png",
            "image/jpeg" or "image/jpg" => ".jpg",
            "image/webp" => ".webp",
            "image/gif" => ".gif",
            "application/pdf" => ".pdf",
            _ => ".bin",
        };
}

internal sealed record GalleryItemMetadata(
    Guid Id,
    string MimeType,
    DateTime CreatedAt,
    string Name,
    string? GenerationType,
    string AssetType,
    string? PaperSize);

internal sealed record GalleryImageBytes(string? ImageUrl, string MimeType);

internal sealed record GalleryImageRaw(string ImageBase64, string MimeType);

internal sealed record SaveImageRequest(
    string ImageBase64,
    string MimeType,
    string GenerationType,
    string Name);

internal sealed record UpdateGalleryItemRequest(string Name);
