namespace MerchStoryAPI.Models;

public class ShopProfile
{
    public Guid Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public AppUser User { get; set; } = null!;

    // Step 1 — Visual Identity
    public string BrandName { get; set; } = string.Empty;

    public string? LogoBase64 { get; set; }

    public string? PrimaryColor { get; set; }

    public string? SecondaryColor { get; set; }

    public string? AccentColor { get; set; }

    public string? Slogan { get; set; }

    // Step 2 — Business DNA
    public string BusinessDomain { get; set; } = string.Empty;

    public string TargetAudience { get; set; } = string.Empty;

    public string? Atmosphere { get; set; }

    public string ShopType { get; set; } = string.Empty;

    public string? Competitors { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
