using MerchStoryImageGeneration.Models;

namespace MerchStoryImageGeneration.Services;

public interface IWallpaperImageService
{
    Task<ImageGenerationResult> GenerateWallpaperAsync(
        WallpaperImageRequest request,
        CancellationToken cancellationToken = default);
}
