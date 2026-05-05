using System.Collections.Concurrent;
using MerchStoryAPI.Storage;

namespace MerchStory.Tests.Fakes;

// Test substitute for AzureBlobStorage. Stores bytes in a process-local
// dictionary; SAS URLs are synthesized as "inmem://{key}" so assertions
// can grep for the key without a real HTTP fetch.
public sealed class InMemoryBlobStorage : IBlobStorage
{
    private readonly ConcurrentDictionary<string, (byte[] Bytes, string ContentType)> blobs = new();

    public IReadOnlyDictionary<string, (byte[] Bytes, string ContentType)> Blobs => this.blobs;

    public Task<BlobRef> UploadAsync(
        string assetType,
        string ownerId,
        Stream content,
        string contentType,
        string? extension = null,
        CancellationToken ct = default)
    {
        using MemoryStream ms = new();
        content.CopyTo(ms);
        byte[] bytes = ms.ToArray();
        string ext = string.IsNullOrEmpty(extension) ? ".bin" : (extension.StartsWith('.') ? extension : $".{extension}");
        string key = $"{assetType}/{ownerId}/{Guid.NewGuid():N}{ext}";
        this.blobs[key] = (bytes, contentType);
        return Task.FromResult(new BlobRef(key, contentType, bytes.LongLength));
    }

    public Task<Stream> OpenReadAsync(string key, CancellationToken ct = default)
    {
        if (!this.blobs.TryGetValue(key, out var entry))
        {
            throw new FileNotFoundException($"Blob '{key}' not found.");
        }

        return Task.FromResult<Stream>(new MemoryStream(entry.Bytes, writable: false));
    }

    public Task<byte[]> DownloadAsync(string key, CancellationToken ct = default)
    {
        if (!this.blobs.TryGetValue(key, out var entry))
        {
            throw new FileNotFoundException($"Blob '{key}' not found.");
        }

        return Task.FromResult(entry.Bytes);
    }

    public Task DeleteAsync(string key, CancellationToken ct = default)
    {
        this.blobs.TryRemove(key, out _);
        return Task.CompletedTask;
    }

    public Uri GetReadUrl(string key, TimeSpan validFor) => new($"inmem://{key}");

    // Test helper — direct upload bypassing the assetType/ownerId path scheme,
    // useful for seeding rows with a deterministic key.
    public void Seed(string key, byte[] bytes, string contentType)
    {
        this.blobs[key] = (bytes, contentType);
    }
}
