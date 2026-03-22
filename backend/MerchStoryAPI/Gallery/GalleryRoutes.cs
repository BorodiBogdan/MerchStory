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

        group.MapGet("/", async (
            ClaimsPrincipal principal,
            AppDbContext db) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            List<GalleryItemResponse> items = await db.GeneratedImages
                .Where(g => g.UserId == userId)
                .OrderByDescending(g => g.CreatedAt)
                .Select(g => new GalleryItemResponse(g.Id, g.ImageBase64, g.MimeType, g.CreatedAt))
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

internal sealed record GalleryItemResponse(Guid Id, string ImageBase64, string MimeType, DateTime CreatedAt);
