using System.IO.Compression;
using MerchStoryAPI.Categories;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryAPI.Storage;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Pgvector;
using Pgvector.EntityFrameworkCore;

namespace MerchStoryAPI.ReferenceImages;

public static class ReferenceImageRoutes
{
    private static readonly TimeSpan ReferenceSasTtl = TimeSpan.FromMinutes(15);

    public static void MapReferenceImageEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/reference-images");

        // Admin endpoint — add a new reference image with its CLIP embedding
        group.MapPost("/", async (
            AddReferenceImageRequest request,
            AppDbContext db,
            IClipEmbeddingService clipService,
            IBlobStorage blobs,
            ILogger<Program> logger,
            CancellationToken ct) =>
        {
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
            catch (ClipServiceUnavailableException ex)
            {
                logger.LogWarning(ex, "Image search service unavailable while adding reference image '{Name}'.", request.Name);
                return Results.Problem(
                    title: "Service unavailable",
                    detail: "Image search service is currently unavailable. Please try again later.",
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to embed reference image '{Name}'", request.Name);
                return Results.Problem("Failed to generate image embedding.", statusCode: 500);
            }

            Guid? categoryId = await CategoryResolver.ResolveOrCreateAsync(db, request.CategoryPath);

            string contentType = SniffImageContentType(imageBytes);
            string ext = ExtensionForContentType(contentType);
            using MemoryStream uploadStream = new(imageBytes);
            BlobRef uploaded = await blobs.UploadAsync(
                "references",
                categoryId?.ToString("N") ?? "uncategorized",
                uploadStream,
                contentType,
                ext,
                ct);

            var referenceImage = new ReferenceImage
            {
                Id = Guid.NewGuid(),
                Name = request.Name.Trim(),
                CategoryId = categoryId,
                ImageBlobKey = uploaded.Key,
                Embedding = embedding,
                CreatedAt = DateTime.UtcNow,
            };

            db.ReferenceImages.Add(referenceImage);
            await db.SaveChangesAsync(ct);

            string? categoryPath = await LoadCategoryPathAsync(db, categoryId);

            return Results.Created(
                $"/reference-images/{referenceImage.Id}",
                new { referenceImage.Id, referenceImage.Name, CategoryPath = categoryPath, referenceImage.CreatedAt });
        }).RequireAuthorization("AdminOnly");

        // Admin endpoint — bulk import a zip of images organized by category folders.
        // Folder hierarchy maps directly to the Category tree; each image filename (sans extension,
        // with surrounding parentheses stripped) becomes the ReferenceImage.Name.
        group.MapPost("/import-zip", async (
            HttpRequest httpRequest,
            AppDbContext db,
            IClipEmbeddingService clipService,
            IBlobStorage blobs,
            ILogger<Program> logger,
            CancellationToken ct) =>
        {
            if (!httpRequest.HasFormContentType)
            {
                return Results.BadRequest("Expected multipart/form-data with a 'file' field.");
            }

            IFormCollection form = await httpRequest.ReadFormAsync();
            IFormFile? file = form.Files["file"] ?? form.Files.FirstOrDefault();
            if (file is null || file.Length == 0)
            {
                return Results.BadRequest("No file uploaded.");
            }

            const int batchSize = 50;
            int imported = 0;
            int skipped = 0;
            int failed = 0;
            int pending = 0;
            var errors = new List<string>();
            var categoryCache = new Dictionary<string, Guid?>();

            // Preload existing (Name, CategoryId) pairs so dedup is an in-memory HashSet check
            // instead of one DB round-trip per zip entry.
            var existing = await db.ReferenceImages
                .Select(r => new { r.Name, r.CategoryId })
                .ToListAsync();
            var seen = new HashSet<(string Name, Guid? CategoryId)>(
                existing.Select(r => (r.Name, r.CategoryId)));

            await using Stream zipStream = file.OpenReadStream();
            using var archive = new ZipArchive(zipStream, ZipArchiveMode.Read);

            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                if (string.IsNullOrEmpty(entry.Name))
                {
                    continue; // directory entry
                }

                string normalized = entry.FullName.Replace('\\', '/');
                string ext = Path.GetExtension(normalized).ToLowerInvariant();
                if (ext is not (".png" or ".jpg" or ".jpeg" or ".webp"))
                {
                    continue;
                }

                string fileName = Path.GetFileName(normalized);
                string stem = Path.GetFileNameWithoutExtension(fileName);
                string name = stem.StartsWith('(') && stem.EndsWith(')')
                    ? stem[1..^1].Trim()
                    : stem.Trim();

                string[] folderParts = normalized
                    .Split('/', StringSplitOptions.RemoveEmptyEntries)
                    .SkipLast(1)
                    .ToArray();
                string categoryPath = string.Join('/', folderParts);

                try
                {
                    Guid? categoryId;
                    if (!categoryCache.TryGetValue(categoryPath, out categoryId))
                    {
                        categoryId = await CategoryResolver.ResolveOrCreateAsync(db, categoryPath);
                        categoryCache[categoryPath] = categoryId;
                    }

                    if (!seen.Add((name, categoryId)))
                    {
                        skipped++;
                        continue;
                    }

                    using var ms = new MemoryStream();
                    await using (Stream entryStream = entry.Open())
                    {
                        await entryStream.CopyToAsync(ms, ct);
                    }

                    byte[] bytes = ms.ToArray();

                    Vector embedding = clipService.Embed(bytes);

                    string entryContentType = ext switch
                    {
                        ".png" => "image/png",
                        ".webp" => "image/webp",
                        _ => "image/jpeg",
                    };

                    using MemoryStream uploadMs = new(bytes);
                    BlobRef uploaded = await blobs.UploadAsync(
                        "references",
                        categoryId?.ToString("N") ?? "uncategorized",
                        uploadMs,
                        entryContentType,
                        ext,
                        ct);

                    db.ReferenceImages.Add(new ReferenceImage
                    {
                        Id = Guid.NewGuid(),
                        Name = name,
                        CategoryId = categoryId,
                        ImageBlobKey = uploaded.Key,
                        Embedding = embedding,
                        CreatedAt = DateTime.UtcNow,
                    });
                    pending++;

                    if (pending >= batchSize)
                    {
                        (int saved, int batchFailed) = await FlushBatchAsync(db, pending, logger, errors);
                        imported += saved;
                        failed += batchFailed;
                        pending = 0;
                    }
                }
                catch (ClipServiceUnavailableException)
                {
                    return Results.Problem(
                        title: "Service unavailable",
                        detail: "Image search service is currently unavailable. Try again later.",
                        statusCode: StatusCodes.Status503ServiceUnavailable);
                }
                catch (Exception ex)
                {
                    failed++;
                    seen.Remove((name, categoryId: categoryCache.GetValueOrDefault(categoryPath)));
                    errors.Add($"{normalized}: {ex.Message}");
                    logger.LogWarning(ex, "Failed to import zip entry '{Entry}'", normalized);
                }
            }

            if (pending > 0)
            {
                (int saved, int batchFailed) = await FlushBatchAsync(db, pending, logger, errors);
                imported += saved;
                failed += batchFailed;
            }

            return Results.Ok(new ImportZipResponse(imported, skipped, failed, errors));
        })
        .RequireAuthorization("AdminOnly")
        .DisableAntiforgery()
        .WithMetadata(new RequestSizeLimitAttribute(500_000_000))
        .WithMetadata(new RequestFormLimitsAttribute { MultipartBodyLengthLimit = 500_000_000 });

        // Authenticated endpoint — list the full category tree (used by the upload picker)
        group.MapGet("/categories", async (AppDbContext db) =>
        {
            var all = await db.Categories
                .OrderBy(c => c.Name)
                .Select(c => new { c.Id, c.Name, c.ParentCategoryId })
                .ToListAsync();

            var byParent = all
                .GroupBy(c => c.ParentCategoryId)
                .ToDictionary(g => g.Key ?? Guid.Empty, g => g.ToList());

            CategoryNode Build(Guid id, string name)
            {
                List<CategoryNode> children = byParent.TryGetValue(id, out var kids)
                    ? kids.Select(k => Build(k.Id, k.Name)).ToList()
                    : new List<CategoryNode>();
                return new CategoryNode(name, children);
            }

            List<CategoryNode> roots = byParent.TryGetValue(Guid.Empty, out var rootList)
                ? rootList.Select(r => Build(r.Id, r.Name)).ToList()
                : new List<CategoryNode>();

            return Results.Ok(roots);
        }).RequireAuthorization();

        // User endpoint — search for visually similar reference images
        group.MapPost("/search", async (
            SearchRequest request,
            AppDbContext db,
            IClipEmbeddingService clipService,
            IBlobStorage blobs,
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
            catch (ClipServiceUnavailableException ex)
            {
                logger.LogWarning(ex, "Image search service unavailable while processing query.");
                return Results.Problem(
                    title: "Service unavailable",
                    detail: "Image search service is currently unavailable. Please try again later.",
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to embed search query image.");
                return Results.Problem("Failed to process query image.", statusCode: 500);
            }

            var results = await QuerySimilarAsync(db, blobs, queryEmbedding, topK);
            return Results.Ok(results);
        }).RequireAuthorization();

        // User endpoint — search the curated library by free text (CLIP text encoder),
        // an alternative to the photo search above that maps into the same embedding space.
        group.MapPost("/search-text", async (
            TextSearchRequest request,
            AppDbContext db,
            IClipEmbeddingService clipService,
            IBlobStorage blobs,
            ILogger<Program> logger) =>
        {
            if (string.IsNullOrWhiteSpace(request.Query))
            {
                return Results.BadRequest("Query is required.");
            }

            int topK = Math.Clamp(request.TopK ?? 10, 1, 50);

            Vector queryEmbedding;
            try
            {
                queryEmbedding = clipService.EmbedText(request.Query.Trim());
            }
            catch (ClipServiceUnavailableException ex)
            {
                logger.LogWarning(ex, "Text search service unavailable while processing query.");
                return Results.Problem(
                    title: "Service unavailable",
                    detail: "Text search service is currently unavailable. Please try again later.",
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to embed search query text.");
                return Results.Problem("Failed to process query text.", statusCode: 500);
            }

            var results = await QuerySimilarAsync(db, blobs, queryEmbedding, topK);
            return Results.Ok(results);
        }).RequireAuthorization();
    }

    // Shared pgvector cosine search used by both the photo and text search endpoints.
    private static async Task<List<SearchResult>> QuerySimilarAsync(
        AppDbContext db,
        IBlobStorage blobs,
        Vector queryEmbedding,
        int topK)
    {
        var matches = await db.ReferenceImages
            .Include(r => r.Category)
                .ThenInclude(c => c!.ParentCategory)
                    .ThenInclude(c => c!.ParentCategory)
            .OrderBy(r => r.Embedding.CosineDistance(queryEmbedding))
            .Take(topK)
            .Select(r => new
            {
                r.Id,
                r.Name,
                r.Category,
                r.ImageBlobKey,
                Similarity = 1.0 - (double)r.Embedding.CosineDistance(queryEmbedding),
            })
            .ToListAsync();

        return matches
            .Select(m => new SearchResult(
                m.Id,
                m.Name,
                CategoryResolver.BuildPath(m.Category),
                string.IsNullOrEmpty(m.ImageBlobKey) ? null : blobs.GetReadUrl(m.ImageBlobKey, ReferenceSasTtl).ToString(),
                m.Similarity))
            .ToList();
    }

    private static async Task<(int Saved, int Failed)> FlushBatchAsync(
        AppDbContext db,
        int pending,
        ILogger logger,
        List<string> errors)
    {
        try
        {
            await db.SaveChangesAsync();
            return (pending, 0);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Batch SaveChanges failed during zip import ({Count} entries).", pending);
            errors.Add($"Batch save failed: {ex.Message}");

            // Detach pending inserts so a retry on the next batch won't re-send them.
            foreach (var entry in db.ChangeTracker.Entries<ReferenceImage>()
                         .Where(e => e.State == EntityState.Added)
                         .ToList())
            {
                entry.State = EntityState.Detached;
            }

            return (0, pending);
        }
    }

    private static async Task<string?> LoadCategoryPathAsync(AppDbContext db, Guid? categoryId)
    {
        if (categoryId is null)
        {
            return null;
        }

        var leaf = await db.Categories
            .Include(c => c.ParentCategory)
                .ThenInclude(c => c!.ParentCategory)
                    .ThenInclude(c => c!.ParentCategory)
            .FirstOrDefaultAsync(c => c.Id == categoryId);

        return leaf is null ? null : CategoryResolver.BuildPath(leaf);
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

    private static string SniffImageContentType(byte[] bytes)
    {
        if (bytes.Length >= 8
            && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47)
        {
            return "image/png";
        }

        if (bytes.Length >= 3
            && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
        {
            return "image/jpeg";
        }

        if (bytes.Length >= 12
            && bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46
            && bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50)
        {
            return "image/webp";
        }

        return "image/jpeg";
    }

    private static string ExtensionForContentType(string contentType) =>
        contentType.ToLowerInvariant() switch
        {
            "image/png" => ".png",
            "image/jpeg" or "image/jpg" => ".jpg",
            "image/webp" => ".webp",
            _ => ".png",
        };
}

internal sealed record AddReferenceImageRequest(string Name, string? CategoryPath, string ImageBase64);

internal sealed record SearchRequest(string ImageBase64, int? TopK);

internal sealed record TextSearchRequest(string Query, int? TopK);

internal sealed record SearchResult(Guid Id, string Name, string CategoryPath, string? ImageUrl, double Similarity);

internal sealed record CategoryNode(string Name, List<CategoryNode> Children);

internal sealed record ImportZipResponse(int Imported, int Skipped, int Failed, List<string> Errors);
