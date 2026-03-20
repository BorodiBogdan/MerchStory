using MerchStoryImageGeneration.Services;
using Microsoft.Extensions.DependencyInjection;

namespace MerchStoryImageGeneration.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddMerchStoryImageGeneration(this IServiceCollection services)
    {
        services.AddScoped<IImageGenerationService, GeminiImageGenerationService>();
        return services;
    }
}
