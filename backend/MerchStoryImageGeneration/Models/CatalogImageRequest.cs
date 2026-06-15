namespace MerchStoryImageGeneration.Models;

// ── Offers ────────────────────────────────────────────────────────────────────
// A "group" is a category-style discount (each item sold separately at the same
// percent). A "bundle" is a buy-all deal that may include free items. Prices in
// each item are the (possibly user-overridden) request prices.
public enum CatalogOfferKind
{
    Group,
    Bundle,
}

public enum FreeItemKind
{
    Item,
    Range,
}

public sealed record CatalogProductItem(string Name, decimal Price, string? ImageBase64);

public sealed record CatalogImageRequest(
    IReadOnlyList<CatalogProductItem> Products,
    string ColorTheme,  // "None" (let AI decide) | "Brand Colors" | "Vibrant" | "Monochrome" | "Dark"
    string Format,      // "Poster" (A4, 1:√2) | "Square 1:1" | "Portrait 4:5" | "Story 9:16"
    bool ShowPrices,
    BrandContext? BrandContext = null,
    string? LogoBase64 = null,  // brand logo inline image
    string Currency = "USD",    // "USD" | "EUR" | "RON"
    string Language = "EN",     // "EN" | "RO"
    bool PreserveProductImages = false,
    IReadOnlyList<ProductMarkerAssignment>? MarkerAssignments = null,
    string BackgroundStyle = "SocialPost",  // "Realistic" | "SocialPost"
    bool ShowProductNames = false,
    string? BrandColors = null,  // shop palette, only used when ColorTheme == "Brand Colors"
    CatalogOffer? Offer = null,  // discount / group / bundle deal (non-preserve only)
    string? ImageModel = null,   // "gemini" (default / nano banana) | "openai"
    bool ShowStockDisclaimer = false,  // render an "in limita stocului disponibil" / "while stocks last" line
    bool ShowDiscountPercentage = true);  // state the discount % (e.g. "25% off"); when false only old+new price show

public sealed record ProductMarkerAssignment(string ProductName, string MarkerHex);

public sealed record CatalogOfferFreebie(string ProductName, FreeItemKind Kind);

public sealed record CatalogOfferGroupItem(
    CatalogOfferKind Kind,
    IReadOnlyList<CatalogProductItem> Items,
    decimal Percent,
    IReadOnlyList<CatalogOfferFreebie> Freebies,

    // Bundle only, computed by the frontend: price for the PAID items (after Percent).
    // A free item is a bonus and is never folded into or subtracted from this.
    decimal? BundlePrice = null,
    decimal? BundleOriginalPrice = null);

public sealed record CatalogOffer(IReadOnlyList<CatalogOfferGroupItem> Groups);
