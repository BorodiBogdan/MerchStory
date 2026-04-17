namespace MerchStoryAPI.Auth;

public record RegisterRequest(string Email, string Password, string? ClientType = null);

public record LoginRequest(string Email, string Password, string? ClientType = null);

public record AuthResponse(string Token, string RefreshToken, string Email, string UserName, bool IsShopSetupComplete, bool IsAdmin);

public record RefreshRequest(string RefreshToken);

public record BrandColorDto(string Hex, int Percentage);

public record ShopProfileRequest(
    string BrandName,
    string? LogoBase64,
    IReadOnlyList<BrandColorDto> BrandColors,
    string? Slogan,
    string BusinessDomain,
    string? OtherDomain,
    string? TargetAudience,
    string? ShopType,
    string? Competitors,
    string PhoneNumber,
    string Email,
    string[] Addresses,
    string? InstagramHandle,
    string? FacebookHandle,
    string? TikTokHandle);

public record ShopProfileResponse(
    Guid Id,
    string BrandName,
    string? LogoBase64,
    IReadOnlyList<BrandColorDto> BrandColors,
    string? Slogan,
    string BusinessDomain,
    string? OtherDomain,
    string? TargetAudience,
    string? ShopType,
    string? Competitors,
    string PhoneNumber,
    string Email,
    string[] Addresses,
    string? InstagramHandle,
    string? FacebookHandle,
    string? TikTokHandle,
    DateTime CreatedAt,
    DateTime UpdatedAt);
