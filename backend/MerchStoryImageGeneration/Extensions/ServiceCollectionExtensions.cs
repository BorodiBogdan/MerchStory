using MerchStoryImageGeneration.Services;
using MerchStoryImageGeneration.Services.Recommendations;
using MerchStoryImageGeneration.Services.Recommendations.Chat;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

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
        // Default to Mock so dev/test environments don't depend on a running LLM.
        // "Llm" runs the Strategist/Writer/Translator pipeline against the chat
        // backend picked by Recommendations:Llm:Backend (see below).
        string providerType = configuration?["Recommendations:ProviderType"] ?? "Mock";

        if (string.Equals(providerType, "Mock", StringComparison.OrdinalIgnoreCase))
        {
            services.AddScoped<IRecommendationProvider, MockRecommendationProvider>();
        }
        else if (string.Equals(providerType, "Llm", StringComparison.OrdinalIgnoreCase))
        {
            services.AddScoped<IRecommendationProvider, LlmRecommendationProvider>();

            // Chat backend — which model family answers the Strategist/Writer
            // prompts. Singleton: each service owns its HttpClient/kernels.
            //   Local    → LM Studio / Ollama / vLLM via Recommendations:Llm:* (default)
            //   DeepSeek → hosted DeepSeek API via Recommendations:Llm:DeepSeek:*
            //   Claude   → Anthropic Messages API via Recommendations:Llm:Claude:*
            //   ChatGPT  → OpenAI Chat Completions via Recommendations:Llm:ChatGpt:*
            // The backend switch lives in RecommendationChatServiceFactory so the
            // admin eval endpoint can build per-request backends the same way.
            string backend = configuration?["Recommendations:Llm:Backend"] ?? "Local";
            services.AddSingleton<IRecommendationChatService>(sp =>
                RecommendationChatServiceFactory.Create(
                    backend,
                    modelOverride: null,
                    sp.GetRequiredService<IConfiguration>(),
                    sp.GetRequiredService<ILoggerFactory>()));
        }
        else
        {
            throw new InvalidOperationException(
                $"Unknown Recommendations:ProviderType '{providerType}'. Supported: Mock, Llm.");
        }

        // Embedding service is always registered (Phase 5+ uses it for RAG even
        // when ProviderType=Mock — the Mock provider just doesn't query it).
        services.AddSingleton<IEmbeddingService, LlmEmbeddingService>();

        return services;
    }
}
