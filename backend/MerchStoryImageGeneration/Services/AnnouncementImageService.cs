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
        BrandContextBlock(r.BrandContext) +
        $"Create a {r.Tone.ToLowerInvariant()} {r.PostType.ToLowerInvariant()} social media graphic " +
        $"in {r.Format} format. Content: \"{r.Content}\". " +
        "Style: clean, modern, suitable for a small retail shop. " +
        "Make it visually striking and easy to read at a glance.";

    private static string BrandContextBlock(MerchStoryImageGeneration.Models.BrandContext? ctx)
    {
        if (ctx is null)
        {
            return string.Empty;
        }

        var lines = new List<string>();
        if (!string.IsNullOrWhiteSpace(ctx.BrandName))
        {
            lines.Add($"- Brand: {ctx.BrandName}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.Slogan))
        {
            lines.Add($"- Slogan: {ctx.Slogan}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.BrandColors))
        {
            lines.Add($"- Brand colors: {ctx.BrandColors}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.BusinessDomain))
        {
            lines.Add($"- Business domain: {ctx.BusinessDomain}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.ShopType))
        {
            lines.Add($"- Shop type: {ctx.ShopType}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.TargetAudience))
        {
            lines.Add($"- Target audience: {ctx.TargetAudience}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.Competitors))
        {
            lines.Add($"- Competitors: {ctx.Competitors}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.PhoneNumber))
        {
            lines.Add($"- Phone: {ctx.PhoneNumber}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.Email))
        {
            lines.Add($"- Email: {ctx.Email}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.Addresses))
        {
            lines.Add($"- Address: {ctx.Addresses}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.InstagramHandle))
        {
            lines.Add($"- Instagram: {ctx.InstagramHandle}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.FacebookHandle))
        {
            lines.Add($"- Facebook: {ctx.FacebookHandle}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.TikTokHandle))
        {
            lines.Add($"- TikTok: {ctx.TikTokHandle}");
        }

        if (lines.Count == 0)
        {
            return string.Empty;
        }

        return "Brand context:\n" + string.Join("\n", lines) + "\n\n";
    }
}
