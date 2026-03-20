namespace semantic_kernel_backend.Auth;

public record RegisterRequest(string Email, string Password);

public record LoginRequest(string Email, string Password);

public record AuthResponse(string Token, string Email, string UserName);
