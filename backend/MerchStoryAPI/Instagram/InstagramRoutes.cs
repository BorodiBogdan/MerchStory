using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.Instagram;

public static class InstagramRoutes
{
    public static void MapInstagramEndpoints(this WebApplication app)
    {
        // ── Connect URL ───────────────────────────────────────────────────────
        // Returns the Instagram OAuth URL the frontend should open in a browser.
        // The current user's ID is passed as the OAuth `state` parameter so the
        // callback can identify who to link the token to.
        app.MapGet("/instagram/connect-url", (
            ClaimsPrincipal principal,
            IConfiguration config) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                      ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var appId = config["Instagram:AppId"];
            var redirectUri = config["Instagram:RedirectUri"];

            if (string.IsNullOrEmpty(appId) || string.IsNullOrEmpty(redirectUri))
            {
                return Results.Problem("Instagram is not configured.", statusCode: 503);
            }

            var state = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(userId));

            // Instagram Basic Display was sunset Dec 2024.
            // New Instagram API uses www.instagram.com/oauth/authorize with instagram_business_basic scope.
            var url = $"https://www.instagram.com/oauth/authorize" +
                      $"?client_id={Uri.EscapeDataString(appId)}" +
                      $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
                      $"&scope=instagram_business_basic" +
                      $"&response_type=code" +
                      $"&state={Uri.EscapeDataString(state)}";

            return Results.Ok(new { url });
        })
        .RequireAuthorization();

        // ── OAuth Callback ────────────────────────────────────────────────────
        // Instagram redirects here after the user authorises the app.
        // Exchanges the code for a token, stores it on the user, then redirects
        // the browser back to the app via its custom URI scheme.
        app.MapGet("/auth/instagram/callback", async (
            string? code,
            string? state,
            string? error,
            IConfiguration config,
            IHttpClientFactory httpFactory,
            UserManager<AppUser> userManager,
            AppDbContext db,
            ILogger<Program> logger) =>
        {
            var frontendUrl = config["Frontend:WebUrl"] ?? "frontend://";
            var successUrl = $"{frontendUrl}/social-callback?status=linked&provider=instagram";
            var errorUrl = $"{frontendUrl}/social-callback?status=error&provider=instagram";

            if (!string.IsNullOrEmpty(error))
            {
                logger.LogWarning("Instagram OAuth error: {Error}", error);
                return Results.Redirect(errorUrl);
            }

            if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
            {
                return Results.Redirect(errorUrl);
            }

            // Decode userId from state
            string userId;
            try
            {
                userId = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(state));
            }
            catch
            {
                return Results.Redirect(errorUrl);
            }

            var user = await db.Users.FindAsync(userId);
            if (user is null)
            {
                return Results.Redirect(errorUrl);
            }

            var appId = config["Instagram:AppId"];
            var appSecret = config["Instagram:AppSecret"];
            var redirectUri = config["Instagram:RedirectUri"];

            using var http = httpFactory.CreateClient();

            // Exchange code for access token
            var tokenParams = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = appId!,
                ["client_secret"] = appSecret!,
                ["grant_type"] = "authorization_code",
                ["redirect_uri"] = redirectUri!,
                ["code"] = code,
            });

            var tokenResponse = await http.PostAsync("https://api.instagram.com/oauth/access_token", tokenParams);
            if (!tokenResponse.IsSuccessStatusCode)
            {
                var err = await tokenResponse.Content.ReadAsStringAsync();
                logger.LogWarning("Instagram token exchange failed: {Error}", err);
                return Results.Redirect("errorUrl");
            }

            var tokenJson = await tokenResponse.Content.ReadAsStringAsync();
            var tokenData = JsonSerializer.Deserialize<InstagramTokenResponse>(tokenJson);
            if (tokenData is null || string.IsNullOrEmpty(tokenData.AccessToken))
            {
                return Results.Redirect("errorUrl");
            }

            // Store token on user
            user.InstagramUserId = tokenData.UserId.ToString();
            user.InstagramAccessToken = tokenData.AccessToken;
            await userManager.UpdateAsync(user);

            logger.LogInformation("Instagram connected for user {UserId}", userId);
            return Results.Redirect(successUrl);
        });

        // ── Media ─────────────────────────────────────────────────────────────
        app.MapGet("/instagram/media", async (
            ClaimsPrincipal principal,
            IHttpClientFactory httpFactory,
            AppDbContext db,
            ILogger<Program> logger) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                      ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var user = await db.Users.FindAsync(userId);
            if (user is null || string.IsNullOrEmpty(user.InstagramAccessToken))
            {
                return Results.Problem("No Instagram account connected.", statusCode: 400);
            }

            using var http = httpFactory.CreateClient();
            var url = $"https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,thumbnail_url&access_token={user.InstagramAccessToken}";
            var response = await http.GetAsync(url);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Instagram media fetch failed for user {UserId}", userId);
                return Results.Problem("Failed to fetch Instagram media.", statusCode: 502);
            }

            var json = await response.Content.ReadAsStringAsync();
            var mediaList = JsonSerializer.Deserialize<InstagramMediaList>(json);
            return Results.Ok(mediaList?.Data ?? []);
        })
        .RequireAuthorization();
    }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
public sealed class InstagramMediaItem
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("caption")]
    public string? Caption { get; set; }

    [JsonPropertyName("media_type")]
    public string MediaType { get; set; } = string.Empty;

    [JsonPropertyName("media_url")]
    public string? MediaUrl { get; set; }

    [JsonPropertyName("thumbnail_url")]
    public string? ThumbnailUrl { get; set; }
}

internal sealed class InstagramTokenResponse
{
    [JsonPropertyName("access_token")]
    public string AccessToken { get; set; } = string.Empty;

    [JsonPropertyName("user_id")]
    public long UserId { get; set; }
}

internal sealed class InstagramMediaList
{
    [JsonPropertyName("data")]
    public List<InstagramMediaItem> Data { get; set; } = [];
}
