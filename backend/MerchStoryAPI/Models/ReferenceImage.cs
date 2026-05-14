using Pgvector;

namespace MerchStoryAPI.Models;

public class ReferenceImage
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public Guid? CategoryId { get; set; }

    public Category? Category { get; set; }

    public string? ImageBase64 { get; set; }

    public string? ImageBlobKey { get; set; }

    public Vector Embedding { get; set; } = null!;

    public DateTime CreatedAt { get; set; }
}
