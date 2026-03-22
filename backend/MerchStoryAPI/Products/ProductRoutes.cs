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
            AppDbContext db) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            List<ProductResponse> products = await db.Products
                .Where(p => p.UserId == userId)
                .OrderByDescending(p => p.CreatedAt)
                .Select(p => new ProductResponse(p.Id, p.Name, p.Price, p.ImageBase64, p.CreatedAt, p.UpdatedAt))
                .ToListAsync();

            return Results.Ok(products);
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
                CreatedAt = now,
                UpdatedAt = now,
            };

            db.Products.Add(product);
            await db.SaveChangesAsync();

            return Results.Created(
                $"/products/{product.Id}",
                new ProductResponse(product.Id, product.Name, product.Price, product.ImageBase64, product.CreatedAt, product.UpdatedAt));
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
            product.UpdatedAt = DateTime.UtcNow;

            await db.SaveChangesAsync();

            return Results.Ok(new ProductResponse(product.Id, product.Name, product.Price, product.ImageBase64, product.CreatedAt, product.UpdatedAt));
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
    }

    private static string? GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
}

internal sealed record ProductRequest(string Name, decimal Price, string? ImageBase64);

internal sealed record ProductResponse(Guid Id, string Name, decimal Price, string? ImageBase64, DateTime CreatedAt, DateTime UpdatedAt);
