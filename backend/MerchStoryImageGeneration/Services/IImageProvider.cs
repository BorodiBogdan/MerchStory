using MerchStoryImageGeneration.Models;

namespace MerchStoryImageGeneration.Services;

public interface IImageProvider
{
    Task<ImageGenerationResult> GenerateAsync(
        string prompt,
        IReadOnlyList<string?>? inlineImages = null,
        CancellationToken cancellationToken = default);
}
