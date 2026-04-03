using MerchStoryImageGeneration.Models;

namespace MerchStoryImageGeneration.Services;

internal sealed class WallpaperImageService : ImageGenerationServiceBase, IWallpaperImageService
{
    private const string SystemPreamble =
        "You are a professional background designer for retail marketing. " +
        "Generate a clean, full-bleed background image suitable for placing product photos on top. " +
        "Do not include any products, people, text, logos, or watermarks. " +
        "Output a visually striking, uncluttered background.";

    public WallpaperImageService(IImageProvider provider)
        : base(provider)
    {
    }

    public Task<ImageGenerationResult> GenerateWallpaperAsync(
        WallpaperImageRequest request,
        CancellationToken cancellationToken = default)
        => this.GenerateAsync($"{SystemPreamble}\n\n{request.Prompt}", cancellationToken: cancellationToken);
}
