using System.Net;
using System.Security.Claims;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryAPI.Shop;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.Auth;

public static class AuthRoutes
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/auth");

        group.MapPost("/register", async (
            RegisterRequest request,
            HttpContext http,
            UserManager<AppUser> userManager,
            JwtService jwtService,
            IHttpClientFactory httpClientFactory,
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

            await EnsureLanguagePreferenceAsync(user, http, httpClientFactory, logger);
            await userManager.UpdateAsync(user);

            var accessToken = jwtService.GenerateToken(user);
            var refreshToken = jwtService.GenerateRefreshToken(user.Id, request.ClientType ?? "mobile");

            db.RefreshTokens.Add(refreshToken);
            await db.SaveChangesAsync();

            return Results.Ok(new AuthResponse(
                accessToken,
                refreshToken.Token,
                user.Email!,
                user.UserName!,
                false,
                user.IsAdmin,
                user.PreferredLanguage.ToString(),
                user.CreditBalance));
        });

        group.MapPost("/login", async (
            LoginRequest request,
            HttpContext http,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager,
            JwtService jwtService,
            IHttpClientFactory httpClientFactory,
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

            if (await EnsureLanguagePreferenceAsync(user, http, httpClientFactory, logger))
            {
                await userManager.UpdateAsync(user);
            }

            var accessToken = jwtService.GenerateToken(user);
            var refreshToken = jwtService.GenerateRefreshToken(user.Id, request.ClientType ?? "mobile");

            db.RefreshTokens.Add(refreshToken);
            await db.SaveChangesAsync();

            bool hasProfile = await db.ShopProfiles.AnyAsync(s => s.UserId == user.Id);
            return Results.Ok(new AuthResponse(
                accessToken,
                refreshToken.Token,
                user.Email!,
                user.UserName!,
                hasProfile,
                user.IsAdmin,
                user.PreferredLanguage.ToString(),
                user.CreditBalance));
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

            bool hasProfile = await db.ShopProfiles.AnyAsync(s => s.UserId == stored.UserId);
            return Results.Ok(new AuthResponse(
                newAccessToken,
                newRefreshToken.Token,
                stored.User.Email!,
                stored.User.UserName!,
                hasProfile,
                stored.User.IsAdmin,
                stored.User.PreferredLanguage.ToString(),
                stored.User.CreditBalance));
        });

        group.MapPut("/language", async (
            UpdateLanguageRequest request,
            ClaimsPrincipal principal,
            UserManager<AppUser> userManager) =>
        {
            string? userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            if (!ShopRoutes.TryParseLanguage(request.Language, out AppLanguage language)
                || string.IsNullOrWhiteSpace(request.Language))
            {
                return Results.BadRequest("Invalid language. Allowed values: EN, RO.");
            }

            AppUser? user = await userManager.FindByIdAsync(userId);
            if (user is null)
            {
                return Results.NotFound();
            }

            user.PreferredLanguage = language;
            user.HasSetLanguagePreference = true;
            await userManager.UpdateAsync(user);

            return Results.Ok(new { language = user.PreferredLanguage.ToString() });
        }).RequireAuthorization();
    }

    private static async Task<bool> EnsureLanguagePreferenceAsync(
        AppUser user,
        HttpContext http,
        IHttpClientFactory httpClientFactory,
        ILogger logger)
    {
        if (user.HasSetLanguagePreference)
        {
            return false;
        }

        IPAddress? ip = http.Connection.RemoteIpAddress;
        AppLanguage detected = AppLanguage.EN;

        if (ip is not null && !IPAddress.IsLoopback(ip) && !ip.Equals(IPAddress.Any))
        {
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                HttpClient client = httpClientFactory.CreateClient();
                string country = await client.GetStringAsync($"https://ipapi.co/{ip}/country/", cts.Token);
                if (string.Equals(country.Trim(), "RO", StringComparison.OrdinalIgnoreCase))
                {
                    detected = AppLanguage.RO;
                }
            }
            catch (Exception ex)
            {
                logger.LogDebug(ex, "IP-based language detection failed; defaulting to EN.");
            }
        }

        user.PreferredLanguage = detected;
        user.HasSetLanguagePreference = true;
        return true;
    }
}
