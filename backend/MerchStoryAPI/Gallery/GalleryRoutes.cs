using System.Security.Claims;
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

            db.GeneratedImages.Add(new GeneratedImage
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                ImageBase64 = req.ImageBase64,
                MimeType = req.MimeType,
                CreatedAt = DateTime.UtcNow,
                GenerationType = req.GenerationType,
                Name = name,
            });
            await db.SaveChangesAsync();

            return Results.Created();
        });

        group.MapGet("/", async (
            ClaimsPrincipal principal,
            AppDbContext db,
            string? type,
            DateTime? from,
            DateTime? to,
            string? search) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            IQueryable<GeneratedImage> q = db.GeneratedImages.Where(g => g.UserId == userId);

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

            List<GalleryItemResponse> items = await q
                .OrderByDescending(g => g.CreatedAt)
                .Select(g => new GalleryItemResponse(
                    g.Id,
                    g.ImageBase64,
                    g.MimeType,
                    g.CreatedAt,
                    g.Name,
                    g.GenerationType))
                .ToListAsync();

            return Results.Ok(items);
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

internal sealed record GalleryItemResponse(
    Guid Id,
    string ImageBase64,
    string MimeType,
    DateTime CreatedAt,
    string Name,
    string? GenerationType);

internal sealed record SaveImageRequest(
    string ImageBase64,
    string MimeType,
    string GenerationType,
    string Name);
