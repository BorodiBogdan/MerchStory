using System.Security.Claims;
using MerchStoryAPI.Common;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryAPI.Shop;
using MerchStoryAPI.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.Products;

public static class ProductRoutes
{
    private static readonly TimeSpan ProductSasTtl = TimeSpan.FromMinutes(15);

    public static void MapProductEndpoints(this WebApplication app)
    {
        RouteGroupBuilder group = app.MapGroup("/products").RequireAuthorization();

        group.MapGet("/", async (
            ClaimsPrincipal principal,
            AppDbContext db,
            IBlobStorage blobs,
            string? search,
            string? category,
            string? categories,
            decimal? minPrice,
            decimal? maxPrice,
            int? page,
            int? pageSize) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            IQueryable<Product> query = db.Products.Where(p => p.UserId == userId);

            if (!string.IsNullOrWhiteSpace(search))
            {
                string pattern = $"%{search.Trim()}%";
                query = query.Where(p => EF.Functions.ILike(p.Name, pattern));
            }

            List<string> categoryList = new();
            if (!string.IsNullOrWhiteSpace(categories))
            {
                categoryList.AddRange(
                    categories.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                              .Select(c => c.ToLowerInvariant()));
            }

            if (!string.IsNullOrWhiteSpace(category))
            {
                categoryList.Add(category.Trim().ToLowerInvariant());
            }

            if (categoryList.Count > 0)
            {
                query = query.Where(p => p.Category != null && categoryList.Contains(p.Category.ToLower()));
            }

            if (minPrice.HasValue)
            {
                query = query.Where(p => p.Price >= minPrice.Value);
            }

            if (maxPrice.HasValue)
            {
                query = query.Where(p => p.Price <= maxPrice.Value);
            }

            int resolvedPage = Math.Max(1, page ?? 1);
            int resolvedPageSize = Math.Clamp(pageSize ?? 24, 1, 100);

            int total = await query.CountAsync();

            var rows = await query
                .OrderByDescending(p => p.CreatedAt)
                .Skip((resolvedPage - 1) * resolvedPageSize)
                .Take(resolvedPageSize)
                .Select(p => new
                {
                    p.Id,
                    p.Name,
                    p.Price,
                    p.Currency,
                    p.Category,
                    p.CreatedAt,
                    p.UpdatedAt,
                    p.ImageBlobKey,
                    p.ImageContentType,
                })
                .ToListAsync();

            List<ProductMetadata> products = rows
                .Select(p => new ProductMetadata(
                    p.Id,
                    p.Name,
                    p.Price,
                    p.Currency.ToString(),
                    p.Category,
                    p.CreatedAt,
                    p.UpdatedAt,
                    p.ImageContentType ?? "image/png",
                    string.IsNullOrEmpty(p.ImageBlobKey) ? null : blobs.GetReadUrl(p.ImageBlobKey, ProductSasTtl).ToString()))
                .ToList();

            return Results.Ok(new PagedResponse<ProductMetadata>(products, total, resolvedPage, resolvedPageSize));
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

            var image = await db.Products
                .Where(p => p.Id == id && p.UserId == userId)
                .Select(p => new { p.ImageBlobKey, p.ImageContentType })
                .SingleOrDefaultAsync();

            if (image is null)
            {
                return Results.NotFound();
            }

            string? url = string.IsNullOrEmpty(image.ImageBlobKey)
                ? null
                : blobs.GetReadUrl(image.ImageBlobKey, ProductSasTtl).ToString();
            return Results.Ok(new ProductImageBytes(url, image.ImageContentType ?? "image/png"));
        });

        group.MapGet("/categories", async (
            ClaimsPrincipal principal,
            AppDbContext db) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            List<string> categories = await db.Products
                .Where(p => p.UserId == userId && p.Category != null && p.Category != string.Empty)
                .Select(p => p.Category!)
                .Distinct()
                .OrderBy(c => c)
                .ToListAsync();

            return Results.Ok(categories);
        });

        group.MapPost("/", async (
            ProductRequest request,
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

            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest("Product name is required.");
            }

            if (request.Price < 0)
            {
                return Results.BadRequest("Price must be zero or greater.");
            }

            Currency currency;
            if (!string.IsNullOrWhiteSpace(request.Currency))
            {
                if (!ShopRoutes.TryParseCurrency(request.Currency, out currency))
                {
                    return Results.BadRequest("Invalid Currency. Allowed values: USD, EUR, RON.");
                }
            }
            else
            {
                ShopProfile? shop = await db.ShopProfiles.SingleOrDefaultAsync(s => s.UserId == userId, ct);
                currency = shop?.Currency ?? Currency.USD;
            }

            (string? blobKey, string? contentType) = await UploadInlineImageAsync(blobs, userId, request.ImageBase64, ct);

            DateTime now = DateTime.UtcNow;
            Product product = new()
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Name = request.Name.Trim(),
                Price = request.Price,
                Currency = currency,
                ImageBlobKey = blobKey,
                ImageContentType = contentType,
                Category = NormalizeCategory(request.Category),
                CreatedAt = now,
                UpdatedAt = now,
            };

            db.Products.Add(product);
            await db.SaveChangesAsync(ct);

            string? url = blobKey is null ? null : blobs.GetReadUrl(blobKey, ProductSasTtl).ToString();
            return Results.Created(
                $"/products/{product.Id}",
                new ProductResponse(product.Id, product.Name, product.Price, product.Currency.ToString(), url, product.Category, product.CreatedAt, product.UpdatedAt));
        });

        group.MapPut("/{id:guid}", async (
            Guid id,
            ProductRequest request,
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

            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest("Product name is required.");
            }

            if (request.Price < 0)
            {
                return Results.BadRequest("Price must be zero or greater.");
            }

            Product? product = await db.Products
                .SingleOrDefaultAsync(p => p.Id == id && p.UserId == userId, ct);

            if (product is null)
            {
                return Results.NotFound();
            }

            if (!string.IsNullOrWhiteSpace(request.Currency))
            {
                if (!ShopRoutes.TryParseCurrency(request.Currency, out Currency updateCurrency))
                {
                    return Results.BadRequest("Invalid Currency. Allowed values: USD, EUR, RON.");
                }

                product.Currency = updateCurrency;
            }

            product.Name = request.Name.Trim();
            product.Price = request.Price;
            product.Category = NormalizeCategory(request.Category);
            product.UpdatedAt = DateTime.UtcNow;

            // The frontend sends ImageBase64 with the same data URI on every save (it
            // re-emits the existing image when nothing changed). We can't tell "same
            // image" from "new image" cheaply, so we treat any non-empty payload as a
            // replacement and upload it. Old key is deleted after the row commits.
            string? oldKey = product.ImageBlobKey;
            if (!string.IsNullOrWhiteSpace(request.ImageBase64))
            {
                (string? newKey, string? newContentType) = await UploadInlineImageAsync(blobs, userId, request.ImageBase64, ct);
                if (newKey is not null)
                {
                    product.ImageBlobKey = newKey;
                    product.ImageContentType = newContentType;
                }
            }
            else if (request.ImageBase64 is not null)
            {
                // Empty string explicitly clears the image.
                product.ImageBlobKey = null;
                product.ImageContentType = null;
            }

            await db.SaveChangesAsync(ct);

            if (!string.IsNullOrEmpty(oldKey) && oldKey != product.ImageBlobKey)
            {
                await blobs.DeleteAsync(oldKey, ct);
            }

            string? url = product.ImageBlobKey is null ? null : blobs.GetReadUrl(product.ImageBlobKey, ProductSasTtl).ToString();
            return Results.Ok(new ProductResponse(product.Id, product.Name, product.Price, product.Currency.ToString(), url, product.Category, product.CreatedAt, product.UpdatedAt));
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

            Product? product = await db.Products
                .SingleOrDefaultAsync(p => p.Id == id && p.UserId == userId, ct);

            if (product is null)
            {
                return Results.NotFound();
            }

            string? blobKey = product.ImageBlobKey;
            db.Products.Remove(product);
            await db.SaveChangesAsync(ct);

            if (!string.IsNullOrEmpty(blobKey))
            {
                await blobs.DeleteAsync(blobKey, ct);
            }

            return Results.NoContent();
        });

        group.MapPost("/remove-background", async (
            RemoveBackgroundRequest request,
            IConfiguration configuration,
            IHttpClientFactory httpClientFactory,
            ILogger<Program> logger) =>
        {
            string? apiKey = configuration["RemoveBg:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                return Results.Problem("Background removal is not configured.", statusCode: 503);
            }

            if (string.IsNullOrWhiteSpace(request.ImageBase64))
            {
                return Results.BadRequest("imageBase64 is required.");
            }

            try
            {
                HttpClient client = httpClientFactory.CreateClient();

                using var form = new MultipartFormDataContent();
                form.Add(new StringContent(request.ImageBase64), "image_file_b64");
                form.Add(new StringContent("auto"), "size");

                using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.remove.bg/v1.0/removebg");
                req.Headers.Add("X-Api-Key", apiKey);
                req.Content = form;

                HttpResponseMessage response = await client.SendAsync(req);

                if (!response.IsSuccessStatusCode)
                {
                    string errorBody = await response.Content.ReadAsStringAsync();
                    logger.LogWarning("Remove.bg returned {Status}: {Body}", response.StatusCode, errorBody);
                    return Results.Problem($"Background removal service failed ({(int)response.StatusCode}).", statusCode: 502);
                }

                byte[] pngBytes = await response.Content.ReadAsByteArrayAsync();
                string resultBase64 = Convert.ToBase64String(pngBytes);
                return Results.Ok(new RemoveBackgroundResponse(resultBase64, "image/png"));
            }
            catch (HttpRequestException ex)
            {
                logger.LogError(ex, "Failed to reach Remove.bg.");
                return Results.Problem("Could not reach background removal service.", statusCode: 502);
            }
        });
    }

    private static string? GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

    private static string? NormalizeCategory(string? category)
    {
        if (string.IsNullOrWhiteSpace(category))
        {
            return null;
        }

        string trimmed = category.Trim();
        return trimmed.Length > 100 ? trimmed[..100] : trimmed;
    }

    // Decodes the optional `data:...;base64,` prefix and uploads the bytes to blob.
    // Returns (null, null) for null/empty/invalid input so callers can fall through
    // to "no image" without special-casing exceptions.
    private static async Task<(string? Key, string? ContentType)> UploadInlineImageAsync(
        IBlobStorage blobs,
        string userId,
        string? imageBase64,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(imageBase64))
        {
            return (null, null);
        }

        string contentType = "image/png";
        string payload = imageBase64;
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

        string ext = contentType.ToLowerInvariant() switch
        {
            "image/png" => ".png",
            "image/jpeg" or "image/jpg" => ".jpg",
            "image/webp" => ".webp",
            _ => ".png",
        };

        using MemoryStream ms = new(bytes);
        BlobRef uploaded = await blobs.UploadAsync("products", userId, ms, contentType, ext, ct);
        return (uploaded.Key, uploaded.ContentType);
    }
}

internal sealed record ProductRequest(string Name, decimal Price, string? ImageBase64, string? Category, string? Currency = null);

internal sealed record ProductResponse(Guid Id, string Name, decimal Price, string Currency, string? ImageUrl, string? Category, DateTime CreatedAt, DateTime UpdatedAt);

internal sealed record ProductMetadata(Guid Id, string Name, decimal Price, string Currency, string? Category, DateTime CreatedAt, DateTime UpdatedAt, string MimeType, string? ImageUrl);

internal sealed record ProductImageBytes(string? ImageUrl, string MimeType);

internal sealed record RemoveBackgroundRequest(string ImageBase64);

internal sealed record RemoveBackgroundResponse(string ImageBase64, string MimeType);
