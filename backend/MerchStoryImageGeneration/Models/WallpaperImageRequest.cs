namespace MerchStoryImageGeneration.Models;

public sealed record WallpaperImageRequest(
    string Format,
    string UserPrompt,
    IReadOnlyList<string>? InlineImages,
    BrandContext? BrandContext = null,
    string Language = "EN");
