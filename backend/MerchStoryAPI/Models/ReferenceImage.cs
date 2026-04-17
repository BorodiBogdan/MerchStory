using Pgvector;

namespace MerchStoryAPI.Models;

public class ReferenceImage
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Category { get; set; }

    public string ImageBase64 { get; set; } = string.Empty;

    public Vector Embedding { get; set; } = null!;

    public DateTime CreatedAt { get; set; }
}
