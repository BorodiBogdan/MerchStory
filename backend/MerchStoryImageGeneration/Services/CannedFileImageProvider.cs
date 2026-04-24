using MerchStoryImageGeneration.Models;

namespace MerchStoryImageGeneration.Services;

/// <summary>
/// Debug-only image provider that returns a fixed PNG from disk instead of
/// calling Gemini. Useful for iterating on post-processing without paying for
/// API calls or introducing non-determinism.
/// </summary>
public sealed class CannedFileImageProvider : IImageProvider
{
    private readonly string filePath;
    private readonly string mimeType;

    public CannedFileImageProvider(string filePath, string mimeType = "image/png")
    {
        this.filePath = filePath;
        this.mimeType = mimeType;
    }

    public Task<ImageGenerationResult> GenerateAsync(
        string prompt,
        IReadOnlyList<string?>? inlineImages = null,
        CancellationToken cancellationToken = default)
    {
        if (!File.Exists(this.filePath))
        {
            throw new FileNotFoundException(
                $"Canned debug image not found at '{this.filePath}'. " +
                "Save a PNG there or set ImageProvider:UseCannedImage to false.",
                this.filePath);
        }

        byte[] bytes = File.ReadAllBytes(this.filePath);
        return Task.FromResult(new ImageGenerationResult(bytes, this.mimeType));
    }
}
