namespace MerchStoryImageGeneration.Services;

// Shared helper for turning the inline images carried in a generation request
// (raw base64 or data URLs) into raw bytes + mime type, so every IImageProvider
// decodes them the same way.
internal static class InlineImageDecoder
{
    // Handles both raw base64 and data URLs (data:image/jpeg;base64,...)
    public static (byte[] Data, string MimeType) Decode(string raw)
    {
        const string prefix = "data:";
        if (raw.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            int semicolon = raw.IndexOf(';', StringComparison.Ordinal);
            int comma = raw.IndexOf(',', StringComparison.Ordinal);
            string mime = semicolon > 0 && comma > semicolon
                ? raw[prefix.Length..semicolon]
                : "image/jpeg";
            byte[] data = Convert.FromBase64String(raw[(comma + 1)..]);
            return (data, mime);
        }

        return (Convert.FromBase64String(raw), "image/jpeg");
    }
}
