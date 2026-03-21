using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace MerchStoryAPI.Auth;

public static class AuthRoutes
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/auth");

        group.MapPost("/register", async (
            RegisterRequest request,
            UserManager<AppUser> userManager,
            JwtService jwtService,
            AppDbContext db,
            ILogger<Program> logger) =>
        {
            var user = new AppUser
            {
                UserName = request.Email,
                Email = request.Email,
            };

            var result = await userManager.CreateAsync(user, request.Password);

            if (!result.Succeeded)
            {
                logger.LogWarning(
                    "Registration failed for {Email}: {Errors}",
                    request.Email,
                    string.Join(", ", result.Errors.Select(e => e.Description)));
                return Results.BadRequest(result.Errors.Select(e => e.Description));
            }

            logger.LogInformation("User registered: {Email}", request.Email);
            var accessToken = jwtService.GenerateToken(user);
            var refreshToken = jwtService.GenerateRefreshToken(user.Id, request.ClientType ?? "mobile");

            db.RefreshTokens.Add(refreshToken);
            await db.SaveChangesAsync();

            return Results.Ok(new AuthResponse(accessToken, refreshToken.Token, user.Email!, user.UserName!));
        });

        group.MapPost("/login", async (
            LoginRequest request,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager,
            JwtService jwtService,
            AppDbContext db,
            ILogger<Program> logger) =>
        {
            var user = await userManager.FindByEmailAsync(request.Email);
            if (user is null)
            {
                logger.LogWarning("Login attempt for unknown email: {Email}", request.Email);
                return Results.Unauthorized();
            }

            var result = await signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: false);
            if (!result.Succeeded)
            {
                logger.LogWarning("Failed login for {Email}", request.Email);
                return Results.Unauthorized();
            }

            logger.LogInformation("User logged in: {Email}", request.Email);
            var accessToken = jwtService.GenerateToken(user);
            var refreshToken = jwtService.GenerateRefreshToken(user.Id, request.ClientType ?? "mobile");

            db.RefreshTokens.Add(refreshToken);
            await db.SaveChangesAsync();

            return Results.Ok(new AuthResponse(accessToken, refreshToken.Token, user.Email!, user.UserName!));
        });

        group.MapPost("/refresh", async (
            RefreshRequest request,
            JwtService jwtService,
            AppDbContext db,
            ILogger<Program> logger) =>
        {
            var stored = await db.RefreshTokens
                .Include(rt => rt.User)
                .SingleOrDefaultAsync(rt => rt.Token == request.RefreshToken);

            if (stored is null || stored.IsRevoked || stored.ExpiresAt <= DateTime.UtcNow)
            {
                logger.LogWarning("Refresh attempt with invalid/expired/revoked token.");
                return Results.Unauthorized();
            }

            stored.IsRevoked = true;

            var newAccessToken = jwtService.GenerateToken(stored.User);
            var newRefreshToken = jwtService.GenerateRefreshToken(stored.UserId, "mobile");

            db.RefreshTokens.Add(newRefreshToken);
            await db.SaveChangesAsync();

            logger.LogInformation("Token rotated for user {UserId}", stored.UserId);

            return Results.Ok(new AuthResponse(
                newAccessToken,
                newRefreshToken.Token,
                stored.User.Email!,
                stored.User.UserName!));
        });
    }
}
