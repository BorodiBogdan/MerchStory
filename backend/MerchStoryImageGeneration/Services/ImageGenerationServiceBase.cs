using MerchStoryImageGeneration.Models;

namespace MerchStoryImageGeneration.Services;

public abstract class ImageGenerationServiceBase
{
    private readonly IImageProvider provider;

    protected ImageGenerationServiceBase(IImageProvider provider)
    {
        this.provider = provider;
    }

    protected Task<ImageGenerationResult> GenerateAsync(
        string prompt,
        IReadOnlyList<string?>? inlineImages = null,
        CancellationToken cancellationToken = default)
        => this.provider.GenerateAsync(prompt, inlineImages, cancellationToken);
}
