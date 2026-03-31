namespace MerchStoryImageGeneration.Models;

/// <summary>
/// Brand context derived from the user's shop profile.
/// Only non-null fields will be included in the generation prompt.
/// </summary>
public sealed record BrandContext(
    string? BrandName,
    string? Slogan,
    string? BrandColors,
    string? BusinessDomain,
    string? ShopType,
    string? TargetAudience,
    string? Competitors,
    string? PhoneNumber,
    string? Email,
    string? Addresses,
    string? InstagramHandle,
    string? FacebookHandle,
    string? TikTokHandle);
