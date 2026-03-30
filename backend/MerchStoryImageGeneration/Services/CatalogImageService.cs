using MerchStoryImageGeneration.Models;

namespace MerchStoryImageGeneration.Services;

internal sealed class CatalogImageService : ImageGenerationServiceBase, ICatalogImageService
{
    private const string SystemContext =
        "You are a professional retail graphic designer specializing in product catalog ads. " +
        "Always produce clean, commercial-quality imagery with clear product focus. " +
        "Never add watermarks, placeholders, or lorem ipsum text.";

    public CatalogImageService(IImageProvider provider)
        : base(provider)
    {
    }

    public Task<ImageGenerationResult> GenerateCatalogImageAsync(
        CatalogImageRequest request,
        CancellationToken cancellationToken = default)
    {
        var images = request.Products
            .Select(p => p.ImageBase64)
            .Where(img => !string.IsNullOrWhiteSpace(img))
            .ToList();

        return this.GenerateAsync(
            BuildPrompt(request),
            images.Count > 0 ? images : null,
            cancellationToken);
    }

    private static string BuildPrompt(CatalogImageRequest r)
    {
        var names = string.Join(", ", r.Products.Select(p =>
            r.ShowPrices ? $"{p.Name} (${p.Price:F2})" : p.Name));

        string imageNote = r.Products.Any(p => !string.IsNullOrWhiteSpace(p.ImageBase64))
            ? "Use the provided product photos as the basis for the visuals. "
            : string.Empty;

        return
            $"{SystemContext}\n\n" +
            $"Create a professional product catalog ad image in {r.Format} format. " +
            $"Layout style: {r.Layout}. Color theme: {r.ColorTheme}. Products: {names}. " +
            imageNote +
            (r.ShowPrices ? "Display prices prominently." : "Do not show prices.") +
            " Make it look like a high-quality retail advertisement.";
    }
}
