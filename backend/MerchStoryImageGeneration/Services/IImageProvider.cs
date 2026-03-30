using MerchStoryImageGeneration.Models;

namespace MerchStoryImageGeneration.Services;

public interface IImageProvider
{
    Task<ImageGenerationResult> GenerateAsync(string prompt, CancellationToken cancellationToken = default);
}
