namespace MerchStoryAPI.Storage;

public sealed class BlobStorageOptions
{
    public string ContainerName { get; set; } = "merchstory";

    public int SasTtlMinutes { get; set; } = 15;

    // Override TTL for keys whose path starts with one of these prefixes.
    // Used by the print pipeline so PDF rendering windows aren't bounded
    // by the standard 15-min SAS TTL.
    public Dictionary<string, int> SasTtlMinutesByPrefix { get; set; } = new()
    {
        { "prints/", 60 },
    };
}
