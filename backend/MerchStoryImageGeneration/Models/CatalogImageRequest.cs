namespace MerchStoryImageGeneration.Models;

public sealed record CatalogProductItem(string Name, decimal Price, string? ImageBase64);

public sealed record CatalogImageRequest(
    IReadOnlyList<CatalogProductItem> Products,
    string Layout,      // "Grid" | "Showcase" | "Minimal" | "Story"
    string ColorTheme,  // "Brand Colors" | "Vibrant" | "Monochrome" | "Dark"
    string Format,      // "Square 1:1" | "Portrait 4:5" | "Story 9:16"
    bool ShowPrices,
    BrandContext? BrandContext = null);
