namespace MerchStoryAPI.Auth;

public record RegisterRequest(string Email, string Password, string? ClientType = null);

public record LoginRequest(string Email, string Password, string? ClientType = null);

public record AuthResponse(string Token, string RefreshToken, string Email, string UserName, bool IsShopSetupComplete);

public record RefreshRequest(string RefreshToken);

public record ShopProfileRequest(
    string BrandName,
    string? LogoBase64,
    string? PrimaryColor,
    string? SecondaryColor,
    string? AccentColor,
    string? Slogan,
    string BusinessDomain,
    string TargetAudience,
    string? Atmosphere,
    string ShopType,
    string? Competitors);

public record ShopProfileResponse(
    Guid Id,
    string BrandName,
    string? LogoBase64,
    string? PrimaryColor,
    string? SecondaryColor,
    string? AccentColor,
    string? Slogan,
    string BusinessDomain,
    string TargetAudience,
    string? Atmosphere,
    string ShopType,
    string? Competitors,
    DateTime CreatedAt,
    DateTime UpdatedAt);
