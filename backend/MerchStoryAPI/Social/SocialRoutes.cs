using System.Security.Claims;
using MerchStoryAPI.Data;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.Social;

public static class SocialRoutes
{
    public static void MapSocialEndpoints(this WebApplication app)
    {
        // ── Manual sync ───────────────────────────────────────────────────────
        // POST /social/sync/{platform}
        // Requires an active (non-null) access token for the platform.
        app.MapPost("/social/sync/{platform}", async (
            string platform,
            System.Security.Claims.ClaimsPrincipal principal,
            AppDbContext db,
            FacebookSocialPostSyncService facebookSync,
            ILogger<Program> logger) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                      ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var user = await db.Users.FindAsync(userId);
            if (user is null)
            {
                return Results.Unauthorized();
            }

            int synced;

            switch (platform)
            {
                case "facebook":
                    if (string.IsNullOrEmpty(user.FacebookAccessToken) ||
                        string.IsNullOrEmpty(user.FacebookUserId))
                    {
                        return Results.Problem(
                            "Facebook account is not connected. Connect first to enable sync.",
                            statusCode: 403);
                    }

                    try
                    {
                        synced = await facebookSync.SyncAsync(
                            userId, "facebook", user.FacebookUserId, user.FacebookAccessToken);
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "Facebook sync failed for user {UserId}", userId);
                        return Results.Problem("Sync failed. Please try again later.", statusCode: 502);
                    }

                    break;

                default:
                    return Results.BadRequest(new { error = $"Unknown platform: {platform}" });
            }

            return Results.Ok(new { synced });
        })
        .RequireAuthorization();
    }
}
