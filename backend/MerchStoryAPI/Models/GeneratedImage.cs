using System.ComponentModel.DataAnnotations;

namespace MerchStoryAPI.Models;

public class GeneratedImage
{
    public Guid Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public AppUser User { get; set; } = null!;

    public string ImageBase64 { get; set; } = string.Empty;

    public string MimeType { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public string? GenerationType { get; set; }

    [MaxLength(80)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(16)]
    public string AssetType { get; set; } = "Photo";

    [MaxLength(10)]
    public string? PaperSize { get; set; }
}
