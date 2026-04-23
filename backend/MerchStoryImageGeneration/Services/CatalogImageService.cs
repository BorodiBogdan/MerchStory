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
        var images = new List<string?>();
        if (!string.IsNullOrWhiteSpace(request.LogoBase64))
        {
            images.Add(request.LogoBase64);
        }

        images.AddRange(request.Products
            .Select(p => p.ImageBase64)
            .Where(img => !string.IsNullOrWhiteSpace(img)));

        string prompt = request.PreserveProductImages
            ? BuildOutlinePrompt(request)
            : BuildPrompt(request);

        return this.GenerateAsync(
            prompt,
            images.Count > 0 ? images : null,
            cancellationToken);
    }

    private static string BuildPrompt(CatalogImageRequest r)
    {
        string symbol = CurrencyFormatter.SymbolFor(r.Currency);
        var names = string.Join(", ", r.Products.Select(p =>
            r.ShowPrices ? $"{p.Name} ({CurrencyFormatter.Format(p.Price, r.Currency)})" : p.Name));

        string logoNote = !string.IsNullOrWhiteSpace(r.LogoBase64)
            ? "Brand logo: a logo image has been provided as the first inline image. " +
              "Place it in a natural brand position (e.g. top corner or header area). " +
              "ABSOLUTE RULE: reproduce the logo pixel-perfect — do NOT recolor, restyle, " +
              "redraw, reinterpret, regenerate, crop, or alter it in any way for any reason, " +
              "including matching brand colors or the overall image style. " +
              "The logo is always used EXACTLY as provided. " +
              "If the logo already contains the brand name, do NOT add the brand name again as separate text.\n\n"
            : string.Empty;

        string imageNote = r.Products.Any(p => !string.IsNullOrWhiteSpace(p.ImageBase64))
            ? "Use the provided product photos as the basis for the visuals. "
            : string.Empty;

        return
            $"{SystemContext}\n\n" +
            LanguageInstruction.For(r.Language) +
            BrandContextBlock(r.BrandContext) +
            logoNote +
            $"Create a professional product catalog ad image in {r.Format} format. " +
            $"Layout style: {r.Layout}. Color theme: {r.ColorTheme}. Products: {names}. " +
            imageNote +
            (r.ShowPrices
                ? $"Display prices prominently using the {r.Currency} currency (symbol: {symbol})."
                : "Do not show prices.") +
            " Make it look like a high-quality retail advertisement.";
    }

    private static string BuildOutlinePrompt(CatalogImageRequest r)
    {
        string symbol = CurrencyFormatter.SymbolFor(r.Currency);
        var priceLine = r.ShowPrices
            ? $"Display prices prominently using the {r.Currency} currency (symbol: {symbol})."
            : "Do not show prices.";

        string logoNote = !string.IsNullOrWhiteSpace(r.LogoBase64)
            ? "Brand logo: a logo image has been provided as the first inline image. " +
              "Place it in a natural brand position (e.g. top corner or header area). " +
              "ABSOLUTE RULE: reproduce the logo pixel-perfect — do NOT recolor, restyle, " +
              "redraw, reinterpret, regenerate, crop, or alter it in any way for any reason, " +
              "including matching brand colors or the overall image style. " +
              "The logo is always used EXACTLY as provided. " +
              "If the logo already contains the brand name, do NOT add the brand name again as separate text.\n\n"
            : string.Empty;

        var assignments = r.MarkerAssignments ?? [];
        var productLines = new List<string>(capacity: r.Products.Count);
        for (int i = 0; i < r.Products.Count; i++)
        {
            var product = r.Products[i];
            string hex = i < assignments.Count ? assignments[i].MarkerHex : "#FF00FF";
            string priceSuffix = r.ShowPrices
                ? $" (price {CurrencyFormatter.Format(product.Price, r.Currency)})"
                : string.Empty;
            productLines.Add($"- Product \"{product.Name}\"{priceSuffix} → outline in pure color {hex}");
        }

        string productBlock = string.Join("\n", productLines);
        string reservedHexList = string.Join(", ", assignments.Select(a => a.MarkerHex));

        bool isSaturatedTheme = string.Equals(r.ColorTheme, "Vibrant", StringComparison.OrdinalIgnoreCase)
            || string.Equals(r.ColorTheme, "Pop Art", StringComparison.OrdinalIgnoreCase)
            || string.Equals(r.ColorTheme, "Pop-Art", StringComparison.OrdinalIgnoreCase);

        string saturatedThemeNote = isSaturatedTheme
            ? "The backdrop and decorative elements may use bright, saturated colors — but none of them may be any of the reserved marker colors listed above.\n\n"
            : string.Empty;

        int productImageCount = r.Products.Count(p => !string.IsNullOrWhiteSpace(p.ImageBase64));
        string productRefNote = productImageCount > 0
            ? $"You have been given {productImageCount} product reference image(s) as inline images after the logo (if any). " +
              "Use these reference images to render the products in the scene accurately — " +
              "match each product's shape, size, proportions, orientation, and general appearance. " +
              "This ensures the scene composition (shadows, reflections, lighting, surface contact, placement) " +
              "integrates naturally with the actual products.\n\n"
            : string.Empty;

        return
            $"{SystemContext}\n\n" +
            LanguageInstruction.For(r.Language) +
            BrandContextBlock(r.BrandContext) +
            logoNote +
            productRefNote +
            $"Create a professional product catalog ad image in {r.Format} format. " +
            $"Layout style: {r.Layout}. Color theme: {r.ColorTheme}. " + priceLine + "\n\n" +
            "Render the products, scene, backdrop, props, brand elements, logo, and pricing badges naturally — " +
            "with appropriate shadows, reflections, and ambient lighting around each product so the scene looks cohesive.\n\n" +
            "Draw one rectangular outline around each product, using the assigned colors below (one unique color per product):\n" +
            productBlock + "\n\n" +
            "Each outline is a crisp, solid, unbroken line exactly 4 pixels thick. " +
            "Lines must be perfectly axis-aligned (horizontal and vertical only — no rotation, skew, or rounded corners). " +
            "Each outline must fully enclose its product with a small margin (roughly 4–8 px around the product silhouette). " +
            "Outlines must NOT overlap each other and must NOT overlap any text, logo, or brand element.\n\n" +
            "CRITICAL — NOTHING OVERLAPS THE PRODUCTS: do NOT place any decoration, prop, price tag, badge, sticker, label, " +
            "leaf, flower, shadow of another object, speech bubble, callout, arrow, text, or any other graphic element " +
            "on top of a product or crossing into its outlined region. Anything that overlaps the product or its outline " +
            "will appear broken when the final product image is placed. Keep all decorations, tags, and props entirely " +
            "outside the outlined product regions — position them around, between, or behind the products instead.\n\n" +
            "RESERVED MARKER COLORS: the following colors are reserved ONLY for product outlines and must NOT appear anywhere else in the image — " +
            "not in the backdrop, scene, props, decorations, text, brand elements, product surfaces, shadows, highlights, or gradients: " +
            reservedHexList + ". " +
            "If your natural composition would use one of these colors, substitute with a visibly different hue.\n\n" +
            saturatedThemeNote +
            "Make it look like a high-quality retail advertisement.";
    }

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
