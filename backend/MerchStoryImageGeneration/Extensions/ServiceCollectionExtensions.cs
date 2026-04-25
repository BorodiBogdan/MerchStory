using MerchStoryImageGeneration.Services;
using MerchStoryImageGeneration.Services.Recommendations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace MerchStoryImageGeneration.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddMerchStoryImageGeneration(
        this IServiceCollection services,
        IConfiguration? configuration = null)
    {
        // Provider — swap this registration to switch the underlying model globally.
        // Debug mode: when ImageProvider:UseCannedImage is true, return a fixed PNG from
        // disk instead of calling Gemini — lets you iterate on the compositor without
        // paying for API calls.
        bool useCanned = string.Equals(
            configuration?["ImageProvider:UseCannedImage"],
            "true",
            StringComparison.OrdinalIgnoreCase);
        if (useCanned)
        {
            string path = configuration?["ImageProvider:CannedImagePath"]
                ?? "DebugAssets/gemini-canned.png";
            services.AddScoped<IImageProvider>(_ => new CannedFileImageProvider(path));
        }
        else
        {
            services.AddScoped<IImageProvider, GeminiImageProvider>();
        }

        // Content-type services
        services.AddScoped<ICatalogImageService, CatalogImageService>();
        services.AddScoped<IAnnouncementImageService, AnnouncementImageService>();
        services.AddScoped<IWallpaperImageService, WallpaperImageService>();

        return services;
    }

    public static IServiceCollection AddMerchStoryRecommendations(
        this IServiceCollection services,
        IConfiguration? configuration = null)
    {
        // Phase 1: only Mock is implemented. Phase 3 adds "LmStudio".
        // Default to Mock so dev/test environments don't depend on a running LLM.
        string providerType = configuration?["Recommendations:ProviderType"] ?? "Mock";

        if (string.Equals(providerType, "Mock", StringComparison.OrdinalIgnoreCase))
        {
            services.AddScoped<IRecommendationProvider, MockRecommendationProvider>();
        }
        else
        {
            throw new InvalidOperationException(
                $"Unknown Recommendations:ProviderType '{providerType}'. Phase 1 supports 'Mock' only.");
        }

        return services;
    }
}
