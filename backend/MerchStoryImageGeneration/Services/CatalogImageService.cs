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
        => this.GenerateAsync(BuildPrompt(request), cancellationToken);

    private static string BuildPrompt(CatalogImageRequest r)
    {
        var names = string.Join(", ", r.Products.Select(p =>
            r.ShowPrices ? $"{p.Name} (${p.Price:F2})" : p.Name));

        return
            $"{SystemContext}\n\n" +
            $"Create a professional product catalog ad image in {r.Format} format. " +
            $"Layout style: {r.Layout}. Color theme: {r.ColorTheme}. Products: {names}. " +
            (r.ShowPrices ? "Display prices prominently." : "Do not show prices.") +
            " Make it look like a high-quality retail advertisement.";
    }
}
