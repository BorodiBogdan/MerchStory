using System.ComponentModel.DataAnnotations;

namespace MerchStoryAPI.Models;

public class PrintJob
{
    public Guid Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public AppUser User { get; set; } = null!;

    public Guid SourceGeneratedImageId { get; set; }

    public GeneratedImage SourceGeneratedImage { get; set; } = null!;

    [MaxLength(20)]
    public string Status { get; set; } = "pending";

    [MaxLength(10)]
    public string PaperSize { get; set; } = "A4";

    [MaxLength(20)]
    public string Orientation { get; set; } = "portrait";

    [MaxLength(20)]
    public string QualityTier { get; set; } = "standard";

    public string? PdfBase64 { get; set; }

    public string? PdfBlobKey { get; set; }

    public Guid? PrintLinkId { get; set; }

    public PrintLink? PrintLink { get; set; }

    [MaxLength(500)]
    public string? ErrorMessage { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? CompletedAt { get; set; }
}
