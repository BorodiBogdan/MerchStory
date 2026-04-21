using System.Security.Claims;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.Products;

public static class ProductRoutes
{
    public static void MapProductEndpoints(this WebApplication app)
    {
        RouteGroupBuilder group = app.MapGroup("/products").RequireAuthorization();

        group.MapGet("/", async (
            ClaimsPrincipal principal,
            AppDbContext db,
            string? search,
            string? category,
            string? categories,
            decimal? minPrice,
            decimal? maxPrice) =>
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

            List<ProductResponse> products = await query
                .OrderByDescending(p => p.CreatedAt)
                .Select(p => new ProductResponse(p.Id, p.Name, p.Price, p.ImageBase64, p.Category, p.CreatedAt, p.UpdatedAt))
                .ToListAsync();

            return Results.Ok(products);
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
            AppDbContext db) =>
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

            DateTime now = DateTime.UtcNow;
            Product product = new()
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Name = request.Name.Trim(),
                Price = request.Price,
                ImageBase64 = request.ImageBase64,
                Category = NormalizeCategory(request.Category),
                CreatedAt = now,
                UpdatedAt = now,
            };

            db.Products.Add(product);
            await db.SaveChangesAsync();

            return Results.Created(
                $"/products/{product.Id}",
                new ProductResponse(product.Id, product.Name, product.Price, product.ImageBase64, product.Category, product.CreatedAt, product.UpdatedAt));
        });

        group.MapPut("/{id:guid}", async (
            Guid id,
            ProductRequest request,
            ClaimsPrincipal principal,
            AppDbContext db) =>
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
                .SingleOrDefaultAsync(p => p.Id == id && p.UserId == userId);

            if (product is null)
            {
                return Results.NotFound();
            }

            product.Name = request.Name.Trim();
            product.Price = request.Price;
            product.ImageBase64 = request.ImageBase64;
            product.Category = NormalizeCategory(request.Category);
            product.UpdatedAt = DateTime.UtcNow;

            await db.SaveChangesAsync();

            return Results.Ok(new ProductResponse(product.Id, product.Name, product.Price, product.ImageBase64, product.Category, product.CreatedAt, product.UpdatedAt));
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

            Product? product = await db.Products
                .SingleOrDefaultAsync(p => p.Id == id && p.UserId == userId);

            if (product is null)
            {
                return Results.NotFound();
            }

            db.Products.Remove(product);
            await db.SaveChangesAsync();

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
}

internal sealed record ProductRequest(string Name, decimal Price, string? ImageBase64, string? Category);

internal sealed record ProductResponse(Guid Id, string Name, decimal Price, string? ImageBase64, string? Category, DateTime CreatedAt, DateTime UpdatedAt);

internal sealed record RemoveBackgroundRequest(string ImageBase64);

internal sealed record RemoveBackgroundResponse(string ImageBase64, string MimeType);
