using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Sas;
using Microsoft.Extensions.Options;

namespace MerchStoryAPI.Storage;

// Backs IBlobStorage with a single Azure Blob container.
//
// Keys are stored relative to the container (e.g. "products/{userId}/{guid}.png")
// rather than as absolute URLs, so the container/account can be swapped via
// configuration alone. SAS URLs are minted on demand and follow one of two paths:
//   - Account-key SAS when CanGenerateSasUri == true (Azurite, legacy connection
//     string). The BlobClient signs locally with the account key.
//   - User Delegation SAS when CanGenerateSasUri == false (Managed Identity).
//     A cached UserDelegationKey from UserDelegationKeyProvider does the signing.
public sealed class AzureBlobStorage : IBlobStorage
{
    private readonly BlobServiceClient serviceClient;
    private readonly BlobContainerClient container;
    private readonly BlobStorageOptions options;
    private readonly ILogger<AzureBlobStorage> logger;
    private readonly Lazy<Task> initialize;
    private readonly UserDelegationKeyProvider? userDelegationKeyProvider;

    public AzureBlobStorage(
        BlobServiceClient serviceClient,
        IOptions<BlobStorageOptions> options,
        ILogger<AzureBlobStorage> logger,
        UserDelegationKeyProvider? userDelegationKeyProvider = null)
    {
        this.serviceClient = serviceClient;
        this.options = options.Value;
        this.logger = logger;
        this.container = serviceClient.GetBlobContainerClient(this.options.ContainerName);
        this.userDelegationKeyProvider = userDelegationKeyProvider;
        this.initialize = new Lazy<Task>(this.EnsureContainerAsync);
    }

    public async Task<BlobRef> UploadAsync(
        string assetType,
        string ownerId,
        Stream content,
        string contentType,
        string? extension = null,
        CancellationToken ct = default)
    {
        await this.initialize.Value.ConfigureAwait(false);

        string ext = NormalizeExtension(extension, contentType);
        string key = $"{Sanitize(assetType)}/{Sanitize(ownerId)}/{Guid.NewGuid():N}{ext}";
        BlobClient client = this.container.GetBlobClient(key);

        if (content.CanSeek)
        {
            content.Position = 0;
        }

        BlobUploadOptions uploadOpts = new()
        {
            HttpHeaders = new BlobHttpHeaders { ContentType = contentType },
        };
        await client.UploadAsync(content, uploadOpts, ct).ConfigureAwait(false);

        long size = content.CanSeek ? content.Length : -1L;
        return new BlobRef(key, contentType, size);
    }

    public async Task<Stream> OpenReadAsync(string key, CancellationToken ct = default)
    {
        BlobClient client = this.container.GetBlobClient(key);
        return await client.OpenReadAsync(cancellationToken: ct).ConfigureAwait(false);
    }

    public async Task<byte[]> DownloadAsync(string key, CancellationToken ct = default)
    {
        BlobClient client = this.container.GetBlobClient(key);
        Azure.Response<BlobDownloadResult> result = await client.DownloadContentAsync(ct).ConfigureAwait(false);
        return result.Value.Content.ToArray();
    }

    public async Task DeleteAsync(string key, CancellationToken ct = default)
    {
        BlobClient client = this.container.GetBlobClient(key);
        try
        {
            await client.DeleteIfExistsAsync(cancellationToken: ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            // Don't surface storage cleanup failures to callers — the row is already gone
            // from the DB and an orphan-sweep job will collect the blob later.
            this.logger.LogWarning(ex, "Failed to delete blob {Key}", key);
        }
    }

    public Uri GetReadUrl(string key, TimeSpan validFor)
    {
        BlobClient client = this.container.GetBlobClient(key);
        TimeSpan ttl = this.ResolveTtl(key, validFor);
        BlobSasBuilder sas = new(BlobSasPermissions.Read, DateTimeOffset.UtcNow.Add(ttl))
        {
            BlobContainerName = this.container.Name,
            BlobName = key,
            Resource = "b",
            StartsOn = DateTimeOffset.UtcNow.AddMinutes(-5), // allow for clock skew
            Protocol = SasProtocol.Https,
        };

        if (client.CanGenerateSasUri)
        {
            // Account-key path: connection-string clients sign SAS locally.
            return client.GenerateSasUri(sas);
        }

        if (this.userDelegationKeyProvider is null)
        {
            // Managed-identity client without a delegation provider — caller forgot
            // to register UserDelegationKeyProvider. Fall back to bare URL so reads
            // still work if the container has public access (they don't, in prod).
            this.logger.LogWarning(
                "BlobServiceClient cannot mint SAS and no UserDelegationKeyProvider " +
                "is registered; returning bare blob URL for {Key}.",
                key);
            return client.Uri;
        }

        // User Delegation SAS path: managed-identity client. Uses a cached delegation
        // key valid for ~6 days so we don't pay GetUserDelegationKey latency per request.
        UserDelegationKey delegationKey = this.userDelegationKeyProvider.GetKey();
        BlobUriBuilder builder = new(client.Uri)
        {
            Sas = sas.ToSasQueryParameters(delegationKey, this.serviceClient.AccountName),
        };
        return builder.ToUri();
    }

    private static string Sanitize(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return "_";
        }

        // Blob names allow most characters; strip anything that would create
        // an unintended path traversal or odd routing.
        Span<char> buffer = stackalloc char[input.Length];
        int len = 0;
        foreach (char c in input)
        {
            if (c is '/' or '\\' or '\0' or '?' or '#')
            {
                continue;
            }

            buffer[len++] = c;
        }

        return len == 0 ? "_" : new string(buffer[..len]);
    }

    private static string NormalizeExtension(string? extension, string contentType)
    {
        if (!string.IsNullOrWhiteSpace(extension))
        {
            return extension.StartsWith('.') ? extension : $".{extension}";
        }

        return contentType.ToLowerInvariant() switch
        {
            "image/png" => ".png",
            "image/jpeg" or "image/jpg" => ".jpg",
            "image/webp" => ".webp",
            "image/gif" => ".gif",
            "application/pdf" => ".pdf",
            _ => ".bin",
        };
    }

    private TimeSpan ResolveTtl(string key, TimeSpan requested)
    {
        foreach ((string prefix, int minutes) in this.options.SasTtlMinutesByPrefix)
        {
            if (key.StartsWith(prefix, StringComparison.Ordinal))
            {
                TimeSpan prefixTtl = TimeSpan.FromMinutes(minutes);
                return prefixTtl > requested ? prefixTtl : requested;
            }
        }

        return requested;
    }

    private async Task EnsureContainerAsync()
    {
        try
        {
            await this.container.CreateIfNotExistsAsync(PublicAccessType.None).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            this.logger.LogWarning(
                ex,
                "Could not ensure blob container {Container} exists; uploads may fail.",
                this.container.Name);
        }

        if (this.userDelegationKeyProvider is not null)
        {
            try
            {
                // Warm the delegation-key cache so the first user request doesn't pay
                // GetUserDelegationKey latency (~100-300ms) on top of the actual blob op.
                await this.userDelegationKeyProvider.RefreshAsync().ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                // A failed warm-up isn't fatal; the next GetReadUrl call will retry.
                this.logger.LogWarning(ex, "Failed to warm up user delegation key cache.");
            }
        }
    }
}
