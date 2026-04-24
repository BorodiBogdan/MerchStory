using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using Microsoft.EntityFrameworkCore;

namespace MerchStoryAPI.Categories;

public static class CategoryResolver
{
    public static async Task<Guid?> ResolveOrCreateAsync(AppDbContext db, string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        string[] segments = path
            .Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        if (segments.Length == 0)
        {
            return null;
        }

        Guid? parentId = null;
        Category? current = null;

        foreach (string segment in segments)
        {
            current = await db.Categories
                .FirstOrDefaultAsync(c => c.ParentCategoryId == parentId && c.Name == segment);

            if (current is null)
            {
                current = new Category
                {
                    Id = Guid.NewGuid(),
                    Name = segment,
                    ParentCategoryId = parentId,
                    CreatedAt = DateTime.UtcNow,
                };
                db.Categories.Add(current);
                await db.SaveChangesAsync();
            }

            parentId = current.Id;
        }

        return current?.Id;
    }

    public static string BuildPath(Category? leaf)
    {
        if (leaf is null)
        {
            return string.Empty;
        }

        var parts = new List<string>();
        Category? node = leaf;
        while (node is not null)
        {
            parts.Add(node.Name);
            node = node.ParentCategory;
        }

        parts.Reverse();
        return string.Join('/', parts);
    }
}
