using System.ComponentModel.DataAnnotations;

namespace MerchStoryAPI.Models;

public class CreditTransaction
{
    public int Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public AppUser User { get; set; } = null!;

    public int Amount { get; set; }

    public int BalanceAfter { get; set; }

    [MaxLength(200)]
    public string? Description { get; set; }

    public Guid? RelatedGeneratedImageId { get; set; }

    public GeneratedImage? RelatedGeneratedImage { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
