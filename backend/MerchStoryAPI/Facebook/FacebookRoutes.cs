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
                      $"&scope=public_profile,email,user_photos,user_posts" +
                      $"&response_type=code" +
                      $"&state={Uri.EscapeDataString(state)}";

            return Results.Ok(new { url });
        })
        .RequireAuthorization();

        // ── Social Connection Status ──────────────────────────────────────────
        app.MapGet("/social/status", async (
            ClaimsPrincipal principal,
            AppDbContext db) =>
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

            return Results.Ok(new
            {
                facebookConnected = !string.IsNullOrEmpty(user.FacebookAccessToken),
            });
        })
        .RequireAuthorization();

        // ── Disconnect ────────────────────────────────────────────────────────
        app.MapPost("/social/disconnect", async (
            ClaimsPrincipal principal,
            AppDbContext db,
            string provider) =>
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

            if (provider == "facebook")
            {
                user.FacebookAccessToken = null;
                user.FacebookUserId = null;
            }
            else
            {
                return Results.BadRequest("Unknown provider.");
            }

            await db.SaveChangesAsync();
            return Results.Ok();
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
            var url = $"{GraphBase}/me/photos?fields=id,source,name,likes.summary(true)&type=uploaded&access_token={user.FacebookAccessToken}";
            var response = await http.GetAsync(url);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Facebook media fetch failed for user {UserId}", userId);
                return Results.Problem("Failed to fetch Facebook photos.", statusCode: 502);
            }

            var json = await response.Content.ReadAsStringAsync();
            var raw = JsonSerializer.Deserialize<FbMediaListRaw>(json);
            var result = raw?.Data.Select(p => new FacebookMediaItem
            {
                Id = p.Id,
                Source = p.Source,
                Name = p.Name,
                LikesCount = p.Likes?.Summary?.TotalCount ?? 0,
            }).ToList() ?? [];
            return Results.Ok(result);
        })
        .RequireAuthorization();

        // ── Facebook Photo Details (likes + comments) ────────────────────────
        app.MapGet("/facebook/photo/{photoId}", async (
            string photoId,
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

            // Fetch likes for this photo
            var photoResponse = await http.GetAsync(
                $"{GraphBase}/{Uri.EscapeDataString(photoId)}?fields=likes.summary(true)&access_token={token}");
            var photoJson = await photoResponse.Content.ReadAsStringAsync();
            var photoData = JsonSerializer.Deserialize<FbPhotoDetailsResponse>(photoJson);

            // Comments live on the timeline post that shared the photo, not on the photo object.
            // Find that post by scanning /me/posts for the one whose object_id == photoId.
            // Note: Facebook Graph API v3.3+ blocks comment content for personal profiles;
            // only the summary count is available.
            List<FacebookCommentItem> comments = [];
            var commentsCount = 0;
            var postsUrl = $"{GraphBase}/me/posts?fields=id,object_id&limit=100&access_token={token}";
            while (postsUrl is not null)
            {
                var postsResponse = await http.GetAsync(postsUrl);
                var postsJson = await postsResponse.Content.ReadAsStringAsync();
                var postsData = JsonSerializer.Deserialize<FbPostsListResponse>(postsJson);

                var match = postsData?.Data?.FirstOrDefault(p => p.ObjectId == photoId);
                if (match is not null)
                {
                    // Facebook Graph API v3.3+ does not return comment content for personal profiles.
                    // We can only retrieve the count from the summary.
                    var commentsResponse = await http.GetAsync(
                        $"{GraphBase}/{Uri.EscapeDataString(match.Id)}?fields=comments.filter(stream).summary(true){{message,from{{name}}}}&access_token={token}");
                    var commentsJson = await commentsResponse.Content.ReadAsStringAsync();
                    var postWithComments = JsonSerializer.Deserialize<FbPostWithComments>(commentsJson);
                    var commentsData = postWithComments?.Comments;
                    commentsCount = commentsData?.Summary?.TotalCount ?? 0;
                    comments = commentsData?.Data.Select(c => new FacebookCommentItem
                    {
                        Id = c.Id,
                        Message = c.Message,
                        FromName = c.From?.Name,
                    }).ToList() ?? [];
                    break;
                }

                // Follow pagination cursor until we find it or run out of posts
                postsUrl = postsData?.Paging?.Next;
            }

            var result = new FacebookPhotoDetails
            {
                LikesCount = photoData?.Likes?.Summary?.TotalCount ?? 0,
                CommentsCount = commentsCount,
                Comments = comments,
            };

            return Results.Ok(result);
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

    [JsonPropertyName("likesCount")]
    public int LikesCount { get; set; }
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

public sealed class FacebookPhotoDetails
{
    [JsonPropertyName("likesCount")]
    public int LikesCount { get; set; }

    [JsonPropertyName("commentsCount")]
    public int CommentsCount { get; set; }

    [JsonPropertyName("comments")]
    public List<FacebookCommentItem> Comments { get; set; } = [];
}

public sealed class FacebookCommentItem
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("fromName")]
    public string? FromName { get; set; }
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

internal sealed class FbMediaListRaw
{
    [JsonPropertyName("data")]
    public List<FbMediaItemRaw> Data { get; set; } = [];
}

internal sealed class FbMediaItemRaw
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("source")]
    public string? Source { get; set; }

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("likes")]
    public FbLikesField? Likes { get; set; }
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

internal sealed class FbPhotoDetailsResponse
{
    [JsonPropertyName("likes")]
    public FbLikesField? Likes { get; set; }

    [JsonPropertyName("comments")]
    public FbCommentsField? Comments { get; set; }

    [JsonPropertyName("link")]
    public string? Link { get; set; }
}

internal sealed class FbPostWithComments
{
    [JsonPropertyName("comments")]
    public FbCommentsField? Comments { get; set; }
}

internal sealed class FbPostsListResponse
{
    [JsonPropertyName("data")]
    public List<FbPostItem> Data { get; set; } = [];

    [JsonPropertyName("paging")]
    public FbPaging? Paging { get; set; }
}

internal sealed class FbPostItem
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("object_id")]
    public string? ObjectId { get; set; }
}

internal sealed class FbPaging
{
    [JsonPropertyName("next")]
    public string? Next { get; set; }
}

internal sealed class FbLikesField
{
    [JsonPropertyName("summary")]
    public FbLikesSummary? Summary { get; set; }
}

internal sealed class FbLikesSummary
{
    [JsonPropertyName("total_count")]
    public int TotalCount { get; set; }
}

internal sealed class FbCommentsField
{
    [JsonPropertyName("data")]
    public List<FbCommentData> Data { get; set; } = [];

    [JsonPropertyName("summary")]
    public FbCommentsSummary? Summary { get; set; }
}

internal sealed class FbCommentsSummary
{
    [JsonPropertyName("total_count")]
    public int TotalCount { get; set; }
}

internal sealed class FbCommentData
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("from")]
    public FbCommentFrom? From { get; set; }
}

internal sealed class FbCommentFrom
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }
}
