namespace MerchStoryAPI.Models;

public class SocialPost
{
    public Guid Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public AppUser User { get; set; } = null!;

    // "facebook", "instagram", etc.
    public string Platform { get; set; } = string.Empty;

    // The platform's native user ID (e.g. FacebookUserId, InstagramUserId)
    public string ExternalAccountId { get; set; } = string.Empty;

    // The platform's native post/photo ID
    public string PlatformPostId { get; set; } = string.Empty;

    public string? SourceUrl { get; set; }

    public string? Caption { get; set; }

    public int LikesCount { get; set; }

    public int CommentsCount { get; set; }

    // JSON array: [{id, message, fromName}]
    public string CommentsJson { get; set; } = "[]";

    public DateTime SyncedAt { get; set; }

    public DateTime CreatedAt { get; set; }
}
