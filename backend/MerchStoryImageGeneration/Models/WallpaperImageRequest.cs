namespace MerchStoryImageGeneration.Models;

public sealed record WallpaperImageRequest(
    string Format,  // "Poster" (A4, 1:√2) | "9:16" | "1:1" | "4:5" | "16:9"
    string UserPrompt,
    IReadOnlyList<string>? InlineImages,
    BrandContext? BrandContext = null,
    string Language = "EN",
    string? ImageModel = null);
