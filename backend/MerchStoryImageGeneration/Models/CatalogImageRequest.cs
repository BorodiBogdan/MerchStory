namespace MerchStoryImageGeneration.Models;

public sealed record CatalogProductItem(string Name, decimal Price, string? ImageBase64);

public sealed record CatalogImageRequest(
    IReadOnlyList<CatalogProductItem> Products,
    string Layout,      // "Grid" | "Showcase" | "Minimal" | "Story"
    string ColorTheme,  // "Brand Colors" | "Vibrant" | "Monochrome" | "Dark"
    string Format,      // "Poster" (A4, 1:√2) | "Square 1:1" | "Portrait 4:5" | "Story 9:16"
    bool ShowPrices,
    BrandContext? BrandContext = null,
    string? LogoBase64 = null,  // brand logo inline image
    string Currency = "USD",    // "USD" | "EUR" | "RON"
    string Language = "EN",     // "EN" | "RO"
    bool PreserveProductImages = false,
    IReadOnlyList<ProductMarkerAssignment>? MarkerAssignments = null,
    string BackgroundStyle = "SocialPost",  // "Realistic" | "SocialPost"
    bool ShowProductNames = false);

public sealed record ProductMarkerAssignment(string ProductName, string MarkerHex);
