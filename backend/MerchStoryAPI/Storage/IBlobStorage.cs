namespace MerchStoryAPI.Storage;

// Capability-named storage abstraction so call sites don't depend on Azure SDK
// types directly. The Azure-backed implementation is registered for production;
// tests substitute an in-memory fake that satisfies the same contract.
public interface IBlobStorage
{
    Task<BlobRef> UploadAsync(
        string assetType,
        string ownerId,
        Stream content,
        string contentType,
        string? extension = null,
        CancellationToken ct = default);

    Task<Stream> OpenReadAsync(string key, CancellationToken ct = default);

    Task<byte[]> DownloadAsync(string key, CancellationToken ct = default);

    Task DeleteAsync(string key, CancellationToken ct = default);

    // Returns a short-lived URL the client can use to fetch the blob directly.
    // For Azure this is a service-key SAS; for the in-memory fake it's a fake URI.
    Uri GetReadUrl(string key, TimeSpan validFor);
}

public sealed record BlobRef(string Key, string ContentType, long Size);
