using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MerchStoryImageGeneration.Services.Recommendations.Chat;

// OpenAI's hosted Chat Completions API. Speaks the same wire format as the
// shared base, so this is just the base pointed at api.openai.com with a real
// API key. OpenAI supports response_format=json_object, and our prompts already
// contain the word "JSON", so JSON mode is on by default.
//
// No maxTokens caps are passed: the local-model rambling problem doesn't apply
// to hosted ChatGPT, so it uses its server-side default.
//
// Config (Recommendations:Llm:ChatGpt:*):
//   ApiKey  — required; falls back to OpenAI:ApiKey. Keep it in user-secrets /
//             Key Vault, never in source.
//   Model   — default "gpt-4o-mini" (cheap, plenty for short JSON idea cards).
//   BaseUrl — default "https://api.openai.com/v1".
public sealed class ChatGptChatService : OpenAiCompatibleChatService
{
    public ChatGptChatService(IConfiguration configuration, ILogger<ChatGptChatService> logger)
        : base(
            backendName: "chatgpt",
            baseUrl: configuration["Recommendations:Llm:ChatGpt:BaseUrl"] ?? "https://api.openai.com/v1",
            apiKey: RequireApiKey(configuration),
            strategistModel: ResolveModel(configuration),
            writerModel: ResolveModel(configuration),
            useJsonMode: configuration.GetValue("Recommendations:Llm:ChatGpt:UseJsonMode", true),
            timeoutSec: configuration.GetValue("Recommendations:Llm:RequestTimeoutSeconds", 90),
            strategistMaxTokens: null,
            writerMaxTokens: null,
            logger: logger)
    {
    }

    private static string ResolveModel(IConfiguration configuration)
        => configuration["Recommendations:Llm:ChatGpt:Model"] ?? "gpt-4o-mini";

    private static string RequireApiKey(IConfiguration configuration)
    {
        // Empty-string check (not just ??) because appsettings.json ships the
        // key as "" — the real value lives in user-secrets / Key Vault. Falls
        // back to a shared OpenAI:ApiKey if the scoped key isn't set.
        string? key = configuration["Recommendations:Llm:ChatGpt:ApiKey"];
        if (string.IsNullOrWhiteSpace(key))
        {
            key = configuration["OpenAI:ApiKey"];
        }

        if (string.IsNullOrWhiteSpace(key))
        {
            throw new InvalidOperationException(
                "Recommendations:Llm:Backend is 'ChatGPT' but neither Recommendations:Llm:ChatGpt:ApiKey " +
                "nor OpenAI:ApiKey is configured. Set one via user-secrets or Key Vault.");
        }

        return key;
    }
}
