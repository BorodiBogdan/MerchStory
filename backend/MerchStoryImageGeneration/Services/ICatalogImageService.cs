using MerchStoryImageGeneration.Models;

namespace MerchStoryImageGeneration.Services;

public interface ICatalogImageService
{
    Task<ImageGenerationResult> GenerateCatalogImageAsync(
        CatalogImageRequest request,
        CancellationToken cancellationToken = default);
}
