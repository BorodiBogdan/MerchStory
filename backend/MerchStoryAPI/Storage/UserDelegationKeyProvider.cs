using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace MerchStoryAPI.Storage;

// Caches the User Delegation Key used to sign User Delegation SAS tokens when
// the BlobServiceClient is backed by a TokenCredential (Managed Identity).
//
// Azure caps user-delegation-key lifetime at 7 days; we ask for 6 to leave
// headroom and trigger a refresh once we cross the 5-day mark. A SemaphoreSlim
// single-flights the refresh so a thundering-herd of requests doesn't all fire
// GetUserDelegationKeyAsync at once.
//
// Only registered in DI when Azure:BlobServiceUri is set; in connection-string
// mode (Azurite + legacy) the account key signs SAS directly and this provider
// is never resolved.
public sealed class UserDelegationKeyProvider : IDisposable
{
    private static readonly TimeSpan KeyLifetime = TimeSpan.FromDays(6);
    private static readonly TimeSpan RefreshThreshold = TimeSpan.FromDays(5);

    private readonly BlobServiceClient client;
    private readonly ILogger<UserDelegationKeyProvider> logger;
    private readonly SemaphoreSlim gate = new(1, 1);
    private UserDelegationKey? cached;
    private DateTimeOffset cachedAt;

    public UserDelegationKeyProvider(BlobServiceClient client, ILogger<UserDelegationKeyProvider> logger)
    {
        this.client = client;
        this.logger = logger;
    }

    public UserDelegationKey GetKey()
    {
        UserDelegationKey? snapshot = this.cached;
        if (snapshot is not null && DateTimeOffset.UtcNow - this.cachedAt < RefreshThreshold)
        {
            return snapshot;
        }

        return this.RefreshAsync().GetAwaiter().GetResult();
    }

    public async Task<UserDelegationKey> RefreshAsync(CancellationToken ct = default)
    {
        await this.gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            // Re-check inside the gate so a single-flight refresh wins.
            if (this.cached is not null && DateTimeOffset.UtcNow - this.cachedAt < RefreshThreshold)
            {
                return this.cached;
            }

            DateTimeOffset start = DateTimeOffset.UtcNow.AddMinutes(-5);
            DateTimeOffset expiry = start.Add(KeyLifetime);
            Azure.Response<UserDelegationKey> response =
                await this.client.GetUserDelegationKeyAsync(start, expiry, ct).ConfigureAwait(false);

            this.cached = response.Value;
            this.cachedAt = DateTimeOffset.UtcNow;
            this.logger.LogInformation(
                "Refreshed user delegation key, valid until {Expiry}",
                expiry);
            return this.cached;
        }
        finally
        {
            this.gate.Release();
        }
    }

    public void Dispose() => this.gate.Dispose();
}
