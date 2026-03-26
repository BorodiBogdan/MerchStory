using System.Text.Json;
using System.Text.Json.Serialization;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using Microsoft.EntityFrameworkCore;

namespace MerchStoryAPI.Social;

public class FacebookSocialPostSyncService : ISocialPostSyncService
{
    private const string GraphBase = "https://graph.facebook.com/v21.0";

    private readonly AppDbContext db;
    private readonly IHttpClientFactory httpFactory;
    private readonly ILogger<FacebookSocialPostSyncService> logger;

    public FacebookSocialPostSyncService(
        AppDbContext db,
        IHttpClientFactory httpFactory,
        ILogger<FacebookSocialPostSyncService> logger)
    {
        this.db = db;
        this.httpFactory = httpFactory;
        this.logger = logger;
    }

    public async Task<int> SyncAsync(
        string userId,
        string platform,
        string externalAccountId,
        string accessToken,
        CancellationToken ct = default)
    {
        using var http = this.httpFactory.CreateClient();

        // Fetch uploaded photos
        var mediaUrl = $"{GraphBase}/me/photos?fields=id,source,name,likes.summary(true)&type=uploaded&access_token={accessToken}";
        var mediaResponse = await http.GetAsync(mediaUrl, ct);

        if (!mediaResponse.IsSuccessStatusCode)
        {
            var err = await mediaResponse.Content.ReadAsStringAsync(ct);
            this.logger.LogWarning("Facebook photos fetch failed for user {UserId}: {Error}", userId, err);
            return 0;
        }

        var mediaJson = await mediaResponse.Content.ReadAsStringAsync(ct);
        var mediaRaw = JsonSerializer.Deserialize<FbSyncMediaListRaw>(mediaJson);

        if (mediaRaw?.Data is null || mediaRaw.Data.Count == 0)
        {
            // Update sync timestamp even if no photos
            await this.UpdateSyncTimestamp(userId, ct);
            return 0;
        }

        var now = DateTime.UtcNow;
        var upserted = 0;

        foreach (var photo in mediaRaw.Data)
        {
            var (commentsCount, commentsJson) = await this.FetchPhotoComments(http, photo.Id, accessToken, ct);

            var existing = await this.db.SocialPosts.FirstOrDefaultAsync(
                p => p.UserId == userId
                  && p.Platform == platform
                  && p.ExternalAccountId == externalAccountId
                  && p.PlatformPostId == photo.Id,
                ct);

            if (existing is not null)
            {
                existing.SourceUrl = photo.Source;
                existing.Caption = photo.Name;
                existing.LikesCount = photo.Likes?.Summary?.TotalCount ?? 0;
                existing.CommentsCount = commentsCount;
                existing.CommentsJson = commentsJson;
                existing.SyncedAt = now;
            }
            else
            {
                this.db.SocialPosts.Add(new SocialPost
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    Platform = platform,
                    ExternalAccountId = externalAccountId,
                    PlatformPostId = photo.Id,
                    SourceUrl = photo.Source,
                    Caption = photo.Name,
                    LikesCount = photo.Likes?.Summary?.TotalCount ?? 0,
                    CommentsCount = commentsCount,
                    CommentsJson = commentsJson,
                    SyncedAt = now,
                    CreatedAt = now,
                });
            }

            upserted++;
        }

        await this.UpdateSyncTimestamp(userId, ct);
        await this.db.SaveChangesAsync(ct);

        this.logger.LogInformation("Synced {Count} Facebook posts for user {UserId}", upserted, userId);
        return upserted;
    }

    private async Task UpdateSyncTimestamp(string userId, CancellationToken ct)
    {
        var user = await this.db.Users.FindAsync([userId], ct);
        if (user is not null)
        {
            user.FacebookLastSyncedAt = DateTime.UtcNow;
        }
    }

    /// <summary>
    /// Fetches comment count and serialized comments for a given Facebook photo.
    /// Scans /me/posts to find the post that shared this photo, then fetches its comments.
    /// </summary>
    private async Task<(int Count, string Json)> FetchPhotoComments(
        HttpClient http,
        string photoId,
        string accessToken,
        CancellationToken ct)
    {
        var postsUrl = $"{GraphBase}/me/posts?fields=id,object_id&limit=100&access_token={accessToken}";

        while (postsUrl is not null)
        {
            HttpResponseMessage postsResponse;
            try
            {
                postsResponse = await http.GetAsync(postsUrl, ct);
            }
            catch (Exception ex)
            {
                this.logger.LogWarning(ex, "Failed to fetch posts while looking for photo {PhotoId}", photoId);
                break;
            }

            if (!postsResponse.IsSuccessStatusCode)
            {
                break;
            }

            var postsJson = await postsResponse.Content.ReadAsStringAsync(ct);
            var postsData = JsonSerializer.Deserialize<FbSyncPostsListResponse>(postsJson);

            var match = postsData?.Data?.FirstOrDefault(p => p.ObjectId == photoId);
            if (match is not null)
            {
                var commentsResponse = await http.GetAsync(
                    $"{GraphBase}/{Uri.EscapeDataString(match.Id)}?fields=comments.filter(stream).summary(true){{message,from{{name}}}}&access_token={accessToken}",
                    ct);

                if (!commentsResponse.IsSuccessStatusCode)
                {
                    break;
                }

                var commentsJson = await commentsResponse.Content.ReadAsStringAsync(ct);
                var postData = JsonSerializer.Deserialize<FbSyncPostWithComments>(commentsJson);
                var commentsField = postData?.Comments;
                var count = commentsField?.Summary?.TotalCount ?? 0;

                var items = commentsField?.Data.Select(c => new FbSyncCommentOut
                {
                    Id = c.Id,
                    Message = c.Message,
                    FromName = c.From?.Name,
                }).ToList() ?? [];

                return (count, JsonSerializer.Serialize(items));
            }

            postsUrl = postsData?.Paging?.Next;
        }

        return (0, "[]");
    }
}

// ── Internal DTOs (Facebook Graph API responses) ─────────────────────────────
internal sealed class FbSyncMediaListRaw
{
    [JsonPropertyName("data")]
    public List<FbSyncMediaItemRaw> Data { get; set; } = [];
}

internal sealed class FbSyncMediaItemRaw
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("source")]
    public string? Source { get; set; }

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("likes")]
    public FbSyncLikesField? Likes { get; set; }
}

internal sealed class FbSyncLikesField
{
    [JsonPropertyName("summary")]
    public FbSyncLikesSummary? Summary { get; set; }
}

internal sealed class FbSyncLikesSummary
{
    [JsonPropertyName("total_count")]
    public int TotalCount { get; set; }
}

internal sealed class FbSyncPostsListResponse
{
    [JsonPropertyName("data")]
    public List<FbSyncPostItem> Data { get; set; } = [];

    [JsonPropertyName("paging")]
    public FbSyncPaging? Paging { get; set; }
}

internal sealed class FbSyncPostItem
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("object_id")]
    public string? ObjectId { get; set; }
}

internal sealed class FbSyncPaging
{
    [JsonPropertyName("next")]
    public string? Next { get; set; }
}

internal sealed class FbSyncPostWithComments
{
    [JsonPropertyName("comments")]
    public FbSyncCommentsField? Comments { get; set; }
}

internal sealed class FbSyncCommentsField
{
    [JsonPropertyName("data")]
    public List<FbSyncCommentData> Data { get; set; } = [];

    [JsonPropertyName("summary")]
    public FbSyncCommentsSummary? Summary { get; set; }
}

internal sealed class FbSyncCommentsSummary
{
    [JsonPropertyName("total_count")]
    public int TotalCount { get; set; }
}

internal sealed class FbSyncCommentData
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("from")]
    public FbSyncCommentFrom? From { get; set; }
}

internal sealed class FbSyncCommentFrom
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }
}

/// <summary>Output shape stored in CommentsJson column.</summary>
internal sealed class FbSyncCommentOut
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("fromName")]
    public string? FromName { get; set; }
}
