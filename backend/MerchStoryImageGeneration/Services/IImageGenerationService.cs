namespace MerchStoryImageGeneration.Services;

public interface IImageGenerationService
{
    Task<ImageGenerationResult> GenerateImageAsync(string prompt, CancellationToken cancellationToken = default);
}

public sealed record ImageGenerationResult(byte[] ImageData, string MimeType);
