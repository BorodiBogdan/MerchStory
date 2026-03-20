using MerchStoryAPI.Models;
using Microsoft.AspNetCore.Identity;

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
            var token = jwtService.GenerateToken(user);
            return Results.Ok(new AuthResponse(token, user.Email!, user.UserName!));
        });

        group.MapPost("/login", async (
            LoginRequest request,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager,
            JwtService jwtService,
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
            var token = jwtService.GenerateToken(user);
            return Results.Ok(new AuthResponse(token, user.Email!, user.UserName!));
        });
    }
}
