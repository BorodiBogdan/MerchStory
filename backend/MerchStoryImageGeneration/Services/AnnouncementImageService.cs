using MerchStoryImageGeneration.Models;

namespace MerchStoryImageGeneration.Services;

internal sealed class AnnouncementImageService : ImageGenerationServiceBase, IAnnouncementImageService
{
    private const string SystemContext =
        "You are a professional social media graphic designer for small retail businesses. " +
        "Produce clean, modern, visually striking graphics that are easy to read at a glance. " +
        "Never add watermarks, placeholders, or generic stock imagery.";

    public AnnouncementImageService(IImageProvider provider)
        : base(provider)
    {
    }

    public Task<ImageGenerationResult> GenerateAnnouncementImageAsync(
        AnnouncementImageRequest request,
        CancellationToken cancellationToken = default)
        => this.GenerateAsync(BuildPrompt(request), null, cancellationToken);

    private static string BuildPrompt(AnnouncementImageRequest r) =>
        $"{SystemContext}\n\n" +
        $"Create a {r.Tone.ToLowerInvariant()} {r.PostType.ToLowerInvariant()} social media graphic " +
        $"in {r.Format} format. Content: \"{r.Content}\". " +
        "Style: clean, modern, suitable for a small retail shop. " +
        "Make it visually striking and easy to read at a glance.";
}
