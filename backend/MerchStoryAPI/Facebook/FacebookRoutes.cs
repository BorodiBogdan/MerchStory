using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.Facebook;

public static class FacebookRoutes
{
    private const string GraphBase = "https://graph.facebook.com/v21.0";

    public static void MapFacebookEndpoints(this WebApplication app)
    {
        // ── Connect URL ───────────────────────────────────────────────────────
        app.MapGet("/facebook/connect-url", (
            ClaimsPrincipal principal,
            IConfiguration config) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                      ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var appId = config["Facebook:AppId"];
            var redirectUri = config["Facebook:RedirectUri"];

            if (string.IsNullOrEmpty(appId) || string.IsNullOrEmpty(redirectUri))
            {
                return Results.Problem("Facebook is not configured.", statusCode: 503);
            }

            var state = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(userId));
            var url = $"https://www.facebook.com/v21.0/dialog/oauth" +
                      $"?client_id={Uri.EscapeDataString(appId)}" +
                      $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
                      $"&scope=public_profile,email" +
                      $"&response_type=code" +
                      $"&state={Uri.EscapeDataString(state)}";

            return Results.Ok(new { url });
        })
        .RequireAuthorization();

        // ── OAuth Callback ────────────────────────────────────────────────────
        app.MapGet("/auth/facebook/callback", async (
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
            var successUrl = $"{frontendUrl}/social-callback?status=linked&provider=facebook";
            var errorUrl = $"{frontendUrl}/social-callback?status=error&provider=facebook";

            if (!string.IsNullOrEmpty(error))
            {
                logger.LogWarning("Facebook OAuth error: {Error}", error);
                return Results.Redirect(errorUrl);
            }

            if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
            {
                return Results.Redirect(errorUrl);
            }

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

            var appId = config["Facebook:AppId"];
            var appSecret = config["Facebook:AppSecret"];
            var redirectUri = config["Facebook:RedirectUri"];

            using var http = httpFactory.CreateClient();

            // Exchange code for access token
            var tokenUrl = $"{GraphBase}/oauth/access_token" +
                $"?client_id={Uri.EscapeDataString(appId!)}" +
                $"&client_secret={Uri.EscapeDataString(appSecret!)}" +
                $"&redirect_uri={Uri.EscapeDataString(redirectUri!)}" +
                $"&code={Uri.EscapeDataString(code)}";

            var tokenResponse = await http.GetAsync(tokenUrl);
            if (!tokenResponse.IsSuccessStatusCode)
            {
                var err = await tokenResponse.Content.ReadAsStringAsync();
                logger.LogWarning("Facebook token exchange failed: {Error}", err);
                return Results.Redirect(errorUrl);
            }

            var tokenJson = await tokenResponse.Content.ReadAsStringAsync();
            var tokenData = JsonSerializer.Deserialize<FacebookTokenResponse>(tokenJson);
            if (tokenData is null || string.IsNullOrEmpty(tokenData.AccessToken))
            {
                return Results.Redirect(errorUrl);
            }

            // Get Facebook user ID
            var profileResponse = await http.GetAsync($"{GraphBase}/me?fields=id&access_token={tokenData.AccessToken}");
            if (profileResponse.IsSuccessStatusCode)
            {
                var profileJson = await profileResponse.Content.ReadAsStringAsync();
                var profile = JsonSerializer.Deserialize<FacebookProfile>(profileJson);
                user.FacebookUserId = profile?.Id;
            }

            user.FacebookAccessToken = tokenData.AccessToken;
            await userManager.UpdateAsync(user);

            logger.LogInformation("Facebook connected for user {UserId}", userId);
            return Results.Redirect(successUrl);
        });

        // ── Facebook Photos ───────────────────────────────────────────────────
        app.MapGet("/facebook/media", async (
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
            if (user is null || string.IsNullOrEmpty(user.FacebookAccessToken))
            {
                return Results.Problem("No Facebook account connected.", statusCode: 400);
            }

            using var http = httpFactory.CreateClient();
            var url = $"{GraphBase}/me/photos?fields=id,source,name&type=uploaded&access_token={user.FacebookAccessToken}";
            var response = await http.GetAsync(url);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Facebook media fetch failed for user {UserId}", userId);
                return Results.Problem("Failed to fetch Facebook photos.", statusCode: 502);
            }

            var json = await response.Content.ReadAsStringAsync();
            var list = JsonSerializer.Deserialize<FacebookMediaList>(json);
            return Results.Ok(list?.Data ?? []);
        })
        .RequireAuthorization();

        // ── Instagram Business via Facebook ───────────────────────────────────
        app.MapGet("/facebook/instagram-media", async (
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
            if (user is null || string.IsNullOrEmpty(user.FacebookAccessToken))
            {
                return Results.Problem("No Facebook account connected.", statusCode: 400);
            }

            using var http = httpFactory.CreateClient();
            var token = user.FacebookAccessToken;

            var pagesResponse = await http.GetAsync($"{GraphBase}/me/accounts?access_token={token}");
            if (!pagesResponse.IsSuccessStatusCode)
            {
                return Results.Problem("Could not fetch Facebook Pages.", statusCode: 502);
            }

            var pagesJson = await pagesResponse.Content.ReadAsStringAsync();
            var pages = JsonSerializer.Deserialize<FacebookPageList>(pagesJson);
            if (pages is null || pages.Data.Count == 0)
            {
                return Results.Problem("No Facebook Pages found.", statusCode: 404);
            }

            string? igAccountId = null;
            foreach (var page in pages.Data)
            {
                var igCheckResponse = await http.GetAsync($"{GraphBase}/{page.Id}?fields=instagram_business_account&access_token={page.AccessToken}");
                if (!igCheckResponse.IsSuccessStatusCode)
                {
                    continue;
                }

                var igCheck = JsonSerializer.Deserialize<FacebookPageWithIg>(await igCheckResponse.Content.ReadAsStringAsync());
                if (!string.IsNullOrEmpty(igCheck?.InstagramBusinessAccount?.Id))
                {
                    igAccountId = igCheck.InstagramBusinessAccount.Id;
                    break;
                }
            }

            if (igAccountId is null)
            {
                return Results.Problem("No Instagram Business account linked to your Facebook Pages.", statusCode: 404);
            }

            var mediaResponse = await http.GetAsync($"{GraphBase}/{igAccountId}/media?fields=id,caption,media_type,media_url,thumbnail_url&access_token={token}");
            if (!mediaResponse.IsSuccessStatusCode)
            {
                logger.LogWarning("IG Business media fetch failed for user {UserId}", userId);
                return Results.Problem("Failed to fetch Instagram Business media.", statusCode: 502);
            }

            var mediaList = JsonSerializer.Deserialize<IgBusinessMediaList>(await mediaResponse.Content.ReadAsStringAsync());
            return Results.Ok(mediaList?.Data ?? []);
        })
        .RequireAuthorization();
    }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
public sealed class FacebookMediaItem
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("source")]
    public string? Source { get; set; }

    [JsonPropertyName("name")]
    public string? Name { get; set; }
}

public sealed class IgBusinessMediaItem
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

internal sealed class FacebookTokenResponse
{
    [JsonPropertyName("access_token")]
    public string AccessToken { get; set; } = string.Empty;
}

internal sealed class FacebookProfile
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string? Email { get; set; }
}

internal sealed class FacebookMediaList
{
    [JsonPropertyName("data")]
    public List<FacebookMediaItem> Data { get; set; } = [];
}

internal sealed class FacebookPageList
{
    [JsonPropertyName("data")]
    public List<FacebookPage> Data { get; set; } = [];
}

internal sealed class FacebookPage
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("access_token")]
    public string AccessToken { get; set; } = string.Empty;
}

internal sealed class FacebookPageWithIg
{
    [JsonPropertyName("instagram_business_account")]
    public IgBusinessAccountRef? InstagramBusinessAccount { get; set; }
}

internal sealed class IgBusinessAccountRef
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;
}

internal sealed class IgBusinessMediaList
{
    [JsonPropertyName("data")]
    public List<IgBusinessMediaItem> Data { get; set; } = [];
}
