namespace MerchStoryAPI.Social;

public interface ISocialPostSyncService
{
    /// <summary>
    /// Fetches posts for the given platform account and upserts them into the SocialPosts table.
    /// </summary>
    /// <param name="userId">MerchStory user ID.</param>
    /// <param name="platform">Platform string, e.g. "facebook".</param>
    /// <param name="externalAccountId">The platform's native user/account ID.</param>
    /// <param name="accessToken">A valid access token for the platform account.</param>
    /// <param name="ct"></param>
    /// <returns>Number of posts upserted.</returns>
    Task<int> SyncAsync(
        string userId,
        string platform,
        string externalAccountId,
        string accessToken,
        CancellationToken ct = default);
}
