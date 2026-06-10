using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MerchStoryImageGeneration.Services.Recommendations.Chat;

// DeepSeek's hosted API speaks the OpenAI Chat Completions format, so this is
// just the shared base pointed at api.deepseek.com with a real API key.
// DeepSeek supports response_format=json_object (and our prompts already
// contain the word "JSON", which their JSON mode requires).
//
// No maxTokens caps are passed: the local-model rambling problem doesn't apply
// to hosted DeepSeek, so it uses its server-side default.
//
// Config (Recommendations:Llm:DeepSeek:*):
//   ApiKey  — required; keep it in user-secrets / Key Vault, never in source.
//   Model   — default "deepseek-chat" (V3). "deepseek-reasoner" (R1) also works
//             but is slower and the reasoning preamble is wasted on JSON tasks.
//   BaseUrl — default "https://api.deepseek.com/v1".
public sealed class DeepSeekChatService : OpenAiCompatibleChatService
{
    public DeepSeekChatService(IConfiguration configuration, ILogger<DeepSeekChatService> logger)
        : base(
            backendName: "deepseek",
            baseUrl: configuration["Recommendations:Llm:DeepSeek:BaseUrl"] ?? "https://api.deepseek.com/v1",
            apiKey: RequireApiKey(configuration),
            strategistModel: ResolveModel(configuration),
            writerModel: ResolveModel(configuration),
            useJsonMode: configuration.GetValue("Recommendations:Llm:DeepSeek:UseJsonMode", true),
            timeoutSec: configuration.GetValue("Recommendations:Llm:RequestTimeoutSeconds", 90),
            strategistMaxTokens: null,
            writerMaxTokens: null,
            logger: logger)
    {
    }

    private static string ResolveModel(IConfiguration configuration)
        => configuration["Recommendations:Llm:DeepSeek:Model"] ?? "deepseek-chat";

    private static string RequireApiKey(IConfiguration configuration)
    {
        string? key = configuration["Recommendations:Llm:DeepSeek:ApiKey"];
        if (string.IsNullOrWhiteSpace(key))
        {
            throw new InvalidOperationException(
                "Recommendations:Llm:Backend is 'DeepSeek' but Recommendations:Llm:DeepSeek:ApiKey is not configured. " +
                "Set it via user-secrets or Key Vault.");
        }

        return key;
    }
}
