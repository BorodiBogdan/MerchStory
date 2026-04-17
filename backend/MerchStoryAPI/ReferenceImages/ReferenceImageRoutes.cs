using System.Security.Claims;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using Microsoft.EntityFrameworkCore;
using Pgvector;
using Pgvector.EntityFrameworkCore;

namespace MerchStoryAPI.ReferenceImages;

public static class ReferenceImageRoutes
{
    public static void MapReferenceImageEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/reference-images");

        // Admin endpoint — add a new reference image with its CLIP embedding
        group.MapPost("/", async (
            AddReferenceImageRequest request,
            ClaimsPrincipal user,
            AppDbContext db,
            IClipEmbeddingService clipService,
            ILogger<Program> logger) =>
        {
            if (!string.Equals(user.FindFirstValue("is_admin"), "true", StringComparison.OrdinalIgnoreCase))
            {
                return Results.Forbid();
            }

            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest("Name is required.");
            }

            if (string.IsNullOrWhiteSpace(request.ImageBase64))
            {
                return Results.BadRequest("ImageBase64 is required.");
            }

            byte[] imageBytes = DecodeBase64(request.ImageBase64);
            Vector embedding;
            try
            {
                embedding = clipService.Embed(imageBytes);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to embed reference image '{Name}'", request.Name);
                return Results.Problem("Failed to generate image embedding.", statusCode: 500);
            }

            var referenceImage = new ReferenceImage
            {
                Id = Guid.NewGuid(),
                Name = request.Name.Trim(),
                Category = request.Category?.Trim(),
                ImageBase64 = request.ImageBase64,
                Embedding = embedding,
                CreatedAt = DateTime.UtcNow,
            };

            db.ReferenceImages.Add(referenceImage);
            await db.SaveChangesAsync();

            return Results.Created(
                $"/reference-images/{referenceImage.Id}",
                new { referenceImage.Id, referenceImage.Name, referenceImage.Category, referenceImage.CreatedAt });
        }).RequireAuthorization();

        // User endpoint — search for visually similar reference images
        group.MapPost("/search", async (
            SearchRequest request,
            AppDbContext db,
            IClipEmbeddingService clipService,
            ILogger<Program> logger) =>
        {
            if (string.IsNullOrWhiteSpace(request.ImageBase64))
            {
                return Results.BadRequest("ImageBase64 is required.");
            }

            int topK = Math.Clamp(request.TopK ?? 10, 1, 50);

            byte[] imageBytes = DecodeBase64(request.ImageBase64);
            Vector queryEmbedding;
            try
            {
                queryEmbedding = clipService.Embed(imageBytes);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to embed search query image.");
                return Results.Problem("Failed to process query image.", statusCode: 500);
            }

            List<SearchResult> results = await db.ReferenceImages
                .OrderBy(r => r.Embedding.CosineDistance(queryEmbedding))
                .Take(topK)
                .Select(r => new SearchResult(
                    r.Id,
                    r.Name,
                    r.Category,
                    r.ImageBase64,
                    1.0 - (double)r.Embedding.CosineDistance(queryEmbedding)))
                .ToListAsync();

            return Results.Ok(results);
        }).RequireAuthorization();
    }

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
}

internal sealed record AddReferenceImageRequest(string Name, string? Category, string ImageBase64);

internal sealed record SearchRequest(string ImageBase64, int? TopK);

internal sealed record SearchResult(Guid Id, string Name, string? Category, string ImageBase64, double Similarity);
