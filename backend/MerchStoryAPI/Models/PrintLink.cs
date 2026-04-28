using System.ComponentModel.DataAnnotations;

namespace MerchStoryAPI.Models;

public class PrintLink
{
    public Guid Id { get; set; }

    public string OwnerUserId { get; set; } = string.Empty;

    public AppUser OwnerUser { get; set; } = null!;

    [MaxLength(16)]
    public string Slug { get; set; } = string.Empty;

    [MaxLength(2048)]
    public string TargetUrl { get; set; } = string.Empty;

    public int HitCount { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
