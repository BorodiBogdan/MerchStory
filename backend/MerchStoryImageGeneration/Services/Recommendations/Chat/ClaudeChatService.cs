using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MerchStoryImageGeneration.Services.Recommendations.Chat;

// Anthropic Messages API backend. Raw HTTP, same style as the API project's
// ClaudeLlmService (which we can't reuse directly: it lives in MerchStoryAPI,
// is shaped for image judging, and caps output at 16 tokens).
//
// Model notes (Anthropic API, mid-2026):
//   - Default model is claude-haiku-4-5 (same as ClaudeLlmService) — fast and
//     cheap, plenty for short JSON idea cards. Model IDs have NO date suffix.
//   - We send no sampling params (temperature/top_p/top_k): Opus 4.7+ rejects
//     them with a 400, so omitting keeps every Claude model swappable here.
//     The Strategist/Writer temperature split doesn't apply to this backend.
//   - The `thinking` param is deliberately omitted: these are constrained
//     JSON-output calls with tight max_tokens budgets, and thinking tokens
//     would count against them and risk truncating the JSON.
//
// Config (Recommendations:Llm:Claude:*):
//   ApiKey  — falls back to Anthropic:ApiKey (already provisioned for
//             ClaudeLlmService via user-secrets / Key Vault).
//   Model   — default "claude-opus-4-8".
//   BaseUrl — default "https://api.anthropic.com".
public sealed class ClaudeChatService : IRecommendationChatService
{
    private const string DefaultBaseUrl = "https://api.anthropic.com";
    private const string DefaultModel = "claude-haiku-4-5";
    private const string AnthropicVersion = "2023-06-01";

    private const int StrategistMaxTokens = 1200;
    private const int WriterMaxTokens = 600;

    private readonly HttpClient httpClient;
    private readonly IConfiguration configuration;
    private readonly ILogger<ClaudeChatService> logger;
    private readonly string baseUrl;
    private readonly string model;

    public ClaudeChatService(IConfiguration configuration, ILogger<ClaudeChatService> logger)
    {
        this.configuration = configuration;
        this.logger = logger;
        this.baseUrl = (configuration["Recommendations:Llm:Claude:BaseUrl"] ?? DefaultBaseUrl).TrimEnd('/');
        this.model = configuration["Recommendations:Llm:Claude:Model"] ?? DefaultModel;

        int timeoutSec = configuration.GetValue("Recommendations:Llm:RequestTimeoutSeconds", 90);
        this.httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(timeoutSec) };
    }

    public string Description => $"claude:{this.model}";

    public async Task<string> CompleteAsync(string prompt, ChatRole role, CancellationToken ct)
    {
        // Empty-string check (not just ??) because appsettings.json ships the
        // key as "" — the real value lives in user-secrets / Key Vault.
        string? apiKey = this.configuration["Recommendations:Llm:Claude:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            apiKey = this.configuration["Anthropic:ApiKey"];
        }

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException(
                "Recommendations:Llm:Backend is 'Claude' but neither Recommendations:Llm:Claude:ApiKey " +
                "nor Anthropic:ApiKey is configured. Set one via user-secrets or Key Vault.");
        }

        var body = new
        {
            model = this.model,
            max_tokens = role == ChatRole.Strategist ? StrategistMaxTokens : WriterMaxTokens,
            messages = new[]
            {
                new { role = "user", content = prompt },
            },
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{this.baseUrl}/v1/messages")
        {
            Content = JsonContent.Create(body),
        };
        request.Headers.Add("x-api-key", apiKey);
        request.Headers.Add("anthropic-version", AnthropicVersion);

        using HttpResponseMessage response = await this.httpClient.SendAsync(request, ct);
        string payload = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            this.logger.LogError(
                "[LLM] Anthropic call failed with status {Status}: {Body}",
                (int)response.StatusCode,
                Truncate(payload, 800));
            throw new InvalidOperationException(
                $"Anthropic call failed with status {(int)response.StatusCode}.");
        }

        using JsonDocument doc = JsonDocument.Parse(payload);

        // A refusal stop reason is a successful HTTP 200 with no usable content —
        // surface it as a failure so the per-stage retry/fallback logic kicks in.
        if (doc.RootElement.TryGetProperty("stop_reason", out JsonElement stopReason)
            && stopReason.GetString() == "refusal")
        {
            throw new InvalidOperationException("Anthropic declined the request (stop_reason=refusal).");
        }

        if (doc.RootElement.TryGetProperty("content", out JsonElement content)
            && content.ValueKind == JsonValueKind.Array)
        {
            foreach (JsonElement block in content.EnumerateArray())
            {
                if (block.TryGetProperty("type", out JsonElement type)
                    && type.GetString() == "text"
                    && block.TryGetProperty("text", out JsonElement text))
                {
                    return text.GetString() ?? string.Empty;
                }
            }
        }

        return string.Empty;
    }

    private static string Truncate(string s, int max)
        => s.Length <= max ? s : s[..max] + "…";
}
