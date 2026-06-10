using Microsoft.Extensions.Logging;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.Connectors.OpenAI;

namespace MerchStoryImageGeneration.Services.Recommendations.Chat;

// Shared base for any backend speaking the OpenAI Chat Completions wire format
// (LM Studio, DeepSeek, Ollama, vLLM, ...). Holds two Semantic Kernel
// instances so Strategist and Writer can target different models, plus the
// per-role execution settings that used to live in LlmRecommendationProvider.
public abstract class OpenAiCompatibleChatService : IRecommendationChatService
{
    private const double StrategistTemperature = 0.4; // planning likes lower temperature
    private const double WriterTemperature = 0.8;     // writing benefits from variation

    private readonly Kernel strategistKernel;
    private readonly Kernel writerKernel;
    private readonly OpenAIPromptExecutionSettings strategistSettings;
    private readonly OpenAIPromptExecutionSettings writerSettings;
    private readonly ILogger logger;

    // maxTokens caps are nullable on purpose: they exist to stop small local
    // models from rambling past their useful output (LM Studio passes 1200/600);
    // hosted models stop on their own, so null = don't send the cap at all.
    protected OpenAiCompatibleChatService(
        string backendName,
        string baseUrl,
        string apiKey,
        string strategistModel,
        string writerModel,
        bool useJsonMode,
        int timeoutSec,
        int? strategistMaxTokens,
        int? writerMaxTokens,
        ILogger logger)
    {
        this.strategistKernel = BuildKernel(strategistModel, baseUrl, apiKey, timeoutSec);
        this.writerKernel = BuildKernel(writerModel, baseUrl, apiKey, timeoutSec);

        // Many local open-weight models (Gemma 3, Llama 3.1, etc.) — and the
        // LM Studio runtime for them — reject OpenAI's `response_format: json_object`
        // flag with a 400. Toggle off via config when running smaller models; the
        // prompt itself still demands JSON-only output and the provider's parser
        // strips code fences as a safety net.
        this.strategistSettings = new OpenAIPromptExecutionSettings
        {
            ResponseFormat = useJsonMode ? "json_object" : null,
            MaxTokens = strategistMaxTokens,
            Temperature = StrategistTemperature,
        };

        this.writerSettings = new OpenAIPromptExecutionSettings
        {
            ResponseFormat = useJsonMode ? "json_object" : null,
            MaxTokens = writerMaxTokens,
            Temperature = WriterTemperature,
        };

        this.logger = logger;
        this.Description = strategistModel == writerModel
            ? $"{backendName}:{strategistModel}"
            : $"{backendName}:{strategistModel}/{writerModel}";
    }

    public string Description { get; }

    public async Task<string> CompleteAsync(string prompt, ChatRole role, CancellationToken ct)
    {
        (Kernel kernel, OpenAIPromptExecutionSettings settings) = role == ChatRole.Strategist
            ? (this.strategistKernel, this.strategistSettings)
            : (this.writerKernel, this.writerSettings);

        try
        {
            FunctionResult result = await kernel.InvokePromptAsync(
                prompt,
                new KernelArguments(settings),
                cancellationToken: ct);
            return result.GetValue<string>() ?? string.Empty;
        }
        catch (Microsoft.SemanticKernel.HttpOperationException ex)
        {
            // SK swallows the response body in HttpOperationException.ToString().
            // Reach into ResponseContent so the user can see *why* the LLM said 400.
            string body = ex.ResponseContent ?? "(no body captured)";
            this.logger.LogError(
                ex,
                "[LLM] HTTP {Status} from {Backend} chat endpoint. Response body: {Body}",
                ex.StatusCode,
                this.Description,
                Truncate(body, 800));
            throw;
        }
    }

    private static Kernel BuildKernel(string model, string baseUrl, string apiKey, int timeoutSec)
    {
        HttpClient http = new() { Timeout = TimeSpan.FromSeconds(timeoutSec) };
        return Kernel.CreateBuilder()
            .AddOpenAIChatCompletion(
                modelId: model,
                endpoint: new Uri(baseUrl),
                apiKey: apiKey,
                httpClient: http)
            .Build();
    }

    private static string Truncate(string s, int max)
        => s.Length <= max ? s : s[..max] + "…";
}
