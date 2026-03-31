using MerchStoryImageGeneration.Services;
using Microsoft.Extensions.DependencyInjection;

namespace MerchStoryImageGeneration.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddMerchStoryImageGeneration(this IServiceCollection services)
    {
        // Provider — swap this registration to switch the underlying model globally
        services.AddScoped<IImageProvider, GeminiImageProvider>();

        // Content-type services
        services.AddScoped<ICatalogImageService, CatalogImageService>();
        services.AddScoped<IAnnouncementImageService, AnnouncementImageService>();

        return services;
    }
}
