using System.Security.Claims;
using MerchStoryAPI.Common;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.Gallery;

public static class GalleryRoutes
{
    public static void MapGalleryEndpoints(this WebApplication app)
    {
        RouteGroupBuilder group = app.MapGroup("/gallery").RequireAuthorization();

        group.MapPost("/save", async (
            SaveImageRequest req,
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

            if (string.IsNullOrWhiteSpace(req.GenerationType) ||
                !GenerationTypes.All.Contains(req.GenerationType))
            {
                return Results.BadRequest(new { detail = "Unknown generation type." });
            }

            bool nameTaken = await db.GeneratedImages
                .AnyAsync(g => g.UserId == userId && g.Name.ToLower() == name.ToLower());
            if (nameTaken)
            {
                return Results.Conflict(new { detail = "You already have an image with that name." });
            }

            GeneratedImage created = new()
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                ImageBase64 = req.ImageBase64,
                MimeType = req.MimeType,
                CreatedAt = DateTime.UtcNow,
                GenerationType = req.GenerationType,
                Name = name,
            };
            db.GeneratedImages.Add(created);
            await db.SaveChangesAsync();

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
            AppDbContext db) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var image = await db.GeneratedImages
                .Where(g => g.Id == id && g.UserId == userId)
                .Select(g => new { g.ImageBase64, g.MimeType })
                .SingleOrDefaultAsync();

            if (image is null)
            {
                return Results.NotFound();
            }

            return Results.Ok(new GalleryImageBytes(image.ImageBase64, image.MimeType));
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
            AppDbContext db) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            GeneratedImage? image = await db.GeneratedImages
                .SingleOrDefaultAsync(g => g.Id == id && g.UserId == userId);

            if (image is null)
            {
                return Results.NotFound();
            }

            db.GeneratedImages.Remove(image);
            await db.SaveChangesAsync();

            return Results.NoContent();
        });
    }

    private static string? GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
}

internal sealed record GalleryItemMetadata(
    Guid Id,
    string MimeType,
    DateTime CreatedAt,
    string Name,
    string? GenerationType,
    string AssetType,
    string? PaperSize);

internal sealed record GalleryImageBytes(string ImageBase64, string MimeType);

internal sealed record SaveImageRequest(
    string ImageBase64,
    string MimeType,
    string GenerationType,
    string Name);

internal sealed record UpdateGalleryItemRequest(string Name);
