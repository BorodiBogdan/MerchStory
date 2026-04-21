namespace MerchStoryAPI.Gallery;

public static class GenerationTypes
{
    public const string Catalog = "catalog";
    public const string CatalogOnWallpaper = "catalog-on-wallpaper";
    public const string Wallpaper = "wallpaper";
    public const string Announcement = "announcement";
    public const string JobPost = "job-post";
    public const string Promotion = "promotion";

    public static readonly HashSet<string> All = new(StringComparer.Ordinal)
    {
        Catalog,
        CatalogOnWallpaper,
        Wallpaper,
        Announcement,
        JobPost,
        Promotion,
    };
}
