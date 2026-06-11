using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MerchStoryImageGeneration.Services.Recommendations.Chat;

// Builds an IRecommendationChatService for a named backend. The single switch
// over backend names used to live inline in ServiceCollectionExtensions; it's
// pulled out here so two callers share it:
//   1. DI registration — picks the global default backend, modelOverride=null.
//   2. The admin eval endpoint — picks a backend per request and can override
//      the model, so the same "Local" backend can drive Gemma base and Gemma
//      fine-tuned by passing two different LM Studio model ids.
//
// The model override is applied by layering an in-memory config source over the
// base configuration before the service is constructed: each backend reads its
// model from a known key, so we just set that key. Everything else (BaseUrl,
// ApiKey, timeouts) still comes from the base config.
public static class RecommendationChatServiceFactory
{
    public static IRecommendationChatService Create(
        string backend,
        string? modelOverride,
        IConfiguration configuration,
        ILoggerFactory loggerFactory)
    {
        IConfiguration config = ApplyModelOverride(backend, modelOverride, configuration);

        return backend.Trim().ToLowerInvariant() switch
        {
            "local" or "lmstudio" =>
                new LmStudioChatService(config, loggerFactory.CreateLogger<LmStudioChatService>()),
            "deepseek" =>
                new DeepSeekChatService(config, loggerFactory.CreateLogger<DeepSeekChatService>()),
            "claude" =>
                new ClaudeChatService(config, loggerFactory.CreateLogger<ClaudeChatService>()),
            "chatgpt" or "openai" =>
                new ChatGptChatService(config, loggerFactory.CreateLogger<ChatGptChatService>()),
            _ => throw new InvalidOperationException(
                $"Unknown recommendation chat backend '{backend}'. Supported: Local, DeepSeek, Claude, ChatGPT."),
        };
    }

    private static IConfiguration ApplyModelOverride(
        string backend,
        string? modelOverride,
        IConfiguration baseConfig)
    {
        if (string.IsNullOrWhiteSpace(modelOverride))
        {
            return baseConfig;
        }

        string? modelKey = ModelKeyFor(backend);
        if (modelKey is null)
        {
            return baseConfig;
        }

        // The local backend also honours per-role Strategist/Writer model keys,
        // which would shadow ChatModel; override those too so the single chosen
        // model wins for both roles.
        var overrides = new Dictionary<string, string?> { [modelKey] = modelOverride };
        if (modelKey == "Recommendations:Llm:ChatModel")
        {
            overrides["Recommendations:Llm:StrategistModel"] = modelOverride;
            overrides["Recommendations:Llm:WriterModel"] = modelOverride;
        }

        return new ConfigurationBuilder()
            .AddConfiguration(baseConfig)
            .AddInMemoryCollection(overrides)
            .Build();
    }

    // The config key each backend reads its model id from. Used to apply the
    // per-request model override.
    private static string? ModelKeyFor(string backend) => backend.Trim().ToLowerInvariant() switch
    {
        "local" or "lmstudio" => "Recommendations:Llm:ChatModel",
        "deepseek" => "Recommendations:Llm:DeepSeek:Model",
        "claude" => "Recommendations:Llm:Claude:Model",
        "chatgpt" or "openai" => "Recommendations:Llm:ChatGpt:Model",
        _ => null,
    };
}
