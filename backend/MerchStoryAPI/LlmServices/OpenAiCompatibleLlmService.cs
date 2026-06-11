using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;

namespace MerchStoryAPI.LlmServices;

// Semantic Kernel implementation of ILLMService for any backend speaking the
// OpenAI Chat Completions wire format (LM Studio vision models, hosted OpenAI,
// Gemini's OpenAI-compatible endpoint, ...). Mirrors the recommendation
// pipeline's split: SK drives OpenAI-compatible backends, ClaudeLlmService
// keeps the native Anthropic Messages API. Selected via LlmJudge:Backend —
// these keys are only read when the backend is NOT Claude.
//
// Config (LlmJudge:Local:*):
//   BaseUrl — OpenAI-compatible endpoint, default LM Studio.
//   Model   — required, and must be vision-capable (e.g. a Gemma 3 build):
//             the composite judge sends the rendered catalog as an inline image.
//   ApiKey  — defaults to a dummy value; local servers ignore it but still
//             want the Authorization header present.
public sealed class OpenAiCompatibleLlmService : ILLMService
{
    private readonly Kernel kernel;
    private readonly OpenAIPromptExecutionSettings settings;
    private readonly ILogger<OpenAiCompatibleLlmService> logger;
    private readonly string description;

    public OpenAiCompatibleLlmService(IConfiguration configuration, ILogger<OpenAiCompatibleLlmService> logger)
    {
        string baseUrl = (configuration["LlmJudge:Local:BaseUrl"] ?? "http://localhost:1234/v1").TrimEnd('/');
        string? model = configuration["LlmJudge:Local:Model"];
        if (string.IsNullOrWhiteSpace(model))
        {
            throw new InvalidOperationException(
                "LlmJudge:Backend is set to an OpenAI-compatible backend but LlmJudge:Local:Model is not configured. " +
                "Set it to the vision-capable model id loaded in your server (e.g. the LM Studio Gemma 3 id).");
        }

        string apiKey = configuration["LlmJudge:Local:ApiKey"] is { Length: > 0 } key ? key : "not-required";
        int timeoutSec = configuration.GetValue("LlmJudge:Local:RequestTimeoutSeconds", 90);

        HttpClient http = new() { Timeout = TimeSpan.FromSeconds(timeoutSec) };
        this.kernel = Kernel.CreateBuilder()
            .AddOpenAIChatCompletion(
                modelId: model,
                endpoint: new Uri(baseUrl),
                apiKey: apiKey,
                httpClient: http)
            .Build();

        // Same shape as the Claude judge: one-word YES/NO verdict, so a tiny
        // output cap; temperature 0 because judging should be deterministic.
        this.settings = new OpenAIPromptExecutionSettings
        {
            MaxTokens = 16,
            Temperature = 0,
        };

        this.logger = logger;
        this.description = $"{baseUrl} ({model})";
    }

    public async Task<string> GenerateAsync(
        string prompt,
        IReadOnlyList<string?>? inlineImages = null,
        CancellationToken cancellationToken = default)
    {
        // Mirror ClaudeLlmService: stable instruction as the system message,
        // images plus a fixed pointer-to-system text as the user message.
        ChatHistory history = new(prompt);

        ChatMessageContentItemCollection userItems = new();
        if (inlineImages is not null)
        {
            foreach (string? raw in inlineImages)
            {
                if (string.IsNullOrWhiteSpace(raw))
                {
                    continue;
                }

                (byte[] data, string mediaType) = DecodeInlineImage(raw);
                userItems.Add(new ImageContent(data, mediaType));
            }
        }

        userItems.Add(new TextContent("Judge the image per the system instructions."));
        history.AddUserMessage(userItems);

        IChatCompletionService chat = this.kernel.GetRequiredService<IChatCompletionService>();
        try
        {
            ChatMessageContent result = await chat.GetChatMessageContentAsync(
                history,
                this.settings,
                this.kernel,
                cancellationToken);
            return result.Content ?? string.Empty;
        }
        catch (HttpOperationException ex)
        {
            // SK swallows the response body in ToString(); surface it so a 400
            // from the backend is debuggable.
            this.logger.LogError(
                ex,
                "LLM judge call failed with HTTP {Status} from {Backend}. Response body: {Body}",
                ex.StatusCode,
                this.description,
                ex.ResponseContent ?? "(no body captured)");
            throw;
        }
    }

    // Accept both raw base64 (defaulting to image/png — what our compositor
    // produces) and pre-formed data: URLs, same as the Claude judge.
    private static (byte[] Data, string MediaType) DecodeInlineImage(string raw)
    {
        const string prefix = "data:";
        if (raw.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            int semicolon = raw.IndexOf(';', StringComparison.Ordinal);
            int comma = raw.IndexOf(',', StringComparison.Ordinal);
            string mediaType = semicolon > 0 && comma > semicolon
                ? raw[prefix.Length..semicolon]
                : "image/png";
            return (Convert.FromBase64String(raw[(comma + 1)..]), mediaType);
        }

        return (Convert.FromBase64String(raw), "image/png");
    }
}
