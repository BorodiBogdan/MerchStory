using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MerchStoryImageGeneration.Services.Recommendations.Chat;

// Local backend (the previous default behavior, extracted verbatim from
// LlmRecommendationProvider). Reads the pre-existing Recommendations:Llm:*
// keys so existing dev setups keep working unchanged. Despite the name, any
// local OpenAI-compatible server works: LM Studio, Ollama, vLLM, llama.cpp
// server, LocalAI — just point BaseUrl at it.
//
// This is the only backend with hard maxTokens caps (1200/600): they're tuned
// for small 7B-class local models, which tend to ramble or loop without one.
// Hosted backends (DeepSeek, Claude) don't need them.
public sealed class LmStudioChatService : OpenAiCompatibleChatService
{
    public LmStudioChatService(IConfiguration configuration, ILogger<LmStudioChatService> logger)
        : base(
            backendName: "lmstudio",
            baseUrl: configuration["Recommendations:Llm:BaseUrl"] ?? "http://localhost:1234/v1",
            apiKey: "not-required",
            strategistModel: ResolveModel(configuration, "Recommendations:Llm:StrategistModel"),
            writerModel: ResolveModel(configuration, "Recommendations:Llm:WriterModel"),
            useJsonMode: configuration.GetValue("Recommendations:Llm:UseJsonMode", true),
            timeoutSec: configuration.GetValue("Recommendations:Llm:RequestTimeoutSeconds", 90),
            strategistMaxTokens: 1200,
            writerMaxTokens: 600,
            logger: logger)
    {
    }

    // Per-role override → shared ChatModel → hardcoded default.
    private static string ResolveModel(IConfiguration configuration, string roleKey)
        => configuration[roleKey]
            ?? configuration["Recommendations:Llm:ChatModel"]
            ?? "qwen2.5-7b-instruct";
}
