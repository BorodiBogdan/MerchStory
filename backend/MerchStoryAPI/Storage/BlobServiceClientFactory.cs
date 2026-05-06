using Azure.Identity;
using Azure.Storage.Blobs;

namespace MerchStoryAPI.Storage;

// Centralizes BlobServiceClient construction so credential logic lives in one place.
//
// The default path is Managed Identity in BOTH local dev and prod:
//   - Local dev → Azure:BlobServiceUri = https://merchstorystoragedev.blob.core.windows.net
//     The dev's `az login` identity is picked up by DefaultAzureCredential. No keys
//     in source. Devs need "Storage Blob Data Contributor" + "Storage Blob Delegator"
//     on the dev account (granted via AAD group).
//   - Prod      → Azure:BlobServiceUri = https://merchstorystorage.blob.core.windows.net
//     The Container App's system-assigned identity authenticates. No connection
//     strings live on the Container App resource.
// Either way, SAS URLs are minted as User Delegation SAS via UserDelegationKeyProvider.
//
// Connection-string mode is supported as an OPT-IN fallback only:
//   - Azurite for offline/airgapped work (Azure:BlobConnectionString=UseDevelopmentStorage=true)
//   - Pre-Phase-B rollback if MI cutover needs to be reverted in cloud
// When Azure:BlobConnectionString is set, it wins and account-key SAS becomes active.
public static class BlobServiceClientFactory
{
    public static BlobServiceClient Create(IConfiguration config)
    {
        string? connStr = config["Azure:BlobConnectionString"];
        if (!string.IsNullOrEmpty(connStr))
        {
            return new BlobServiceClient(connStr);
        }

        string? uri = config["Azure:BlobServiceUri"];
        if (string.IsNullOrEmpty(uri))
        {
            throw new InvalidOperationException(
                "Azure blob storage is not configured. Set either Azure:BlobConnectionString " +
                "(for Azurite or legacy account-key access) or Azure:BlobServiceUri (for " +
                "Managed Identity / DefaultAzureCredential access).");
        }

        return new BlobServiceClient(new Uri(uri), new DefaultAzureCredential());
    }
}
