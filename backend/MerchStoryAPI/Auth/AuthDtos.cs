namespace MerchStoryAPI.Auth;

public record RegisterRequest(string Email, string Password, string? ClientType = null);

public record LoginRequest(string Email, string Password, string? ClientType = null);

public record AuthResponse(string Token, string RefreshToken, string Email, string UserName);

public record RefreshRequest(string RefreshToken);
