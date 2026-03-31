using MerchStoryImageGeneration.Models;

namespace MerchStoryImageGeneration.Services;

public interface IAnnouncementImageService
{
    Task<ImageGenerationResult> GenerateAnnouncementImageAsync(
        AnnouncementImageRequest request,
        CancellationToken cancellationToken = default);
}
