namespace MerchStoryAPI.Models;

public class ShopProfile
{
    public Guid Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public AppUser User { get; set; } = null!;

    // Step 1 — Visual Identity
    public string BrandName { get; set; } = string.Empty;

    public string? LogoBase64 { get; set; }

    public string BrandColorsJson { get; set; } = "[]";

    public string? Slogan { get; set; }

    // Step 2 — Business DNA
    public string BusinessDomain { get; set; } = string.Empty;

    public string? OtherDomain { get; set; }

    public string? TargetAudience { get; set; }

    public string? ShopType { get; set; }

    public string? Competitors { get; set; }

    // Step 3 — Contact & Social
    public string PhoneNumber { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string Addresses { get; set; } = string.Empty;

    public string? InstagramHandle { get; set; }

    public string? FacebookHandle { get; set; }

    public string? TikTokHandle { get; set; }

    // Preferences
    public Currency Currency { get; set; } = Currency.USD;

    public AppLanguage GenerationLanguage { get; set; } = AppLanguage.EN;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
