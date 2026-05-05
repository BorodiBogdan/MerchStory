using System.Text.Json;

namespace MerchStoryAPI.LlmServices;

public sealed class ClaudeLlmService : ILLMService
{
    private const string DefaultBaseUrl = "https://api.anthropic.com";
    private const string DefaultModel = "claude-haiku-4-5";
    private const string AnthropicVersion = "2023-06-01";

    private readonly HttpClient httpClient;
    private readonly IConfiguration configuration;
    private readonly ILogger<ClaudeLlmService> logger;

    public ClaudeLlmService(HttpClient httpClient, IConfiguration configuration, ILogger<ClaudeLlmService> logger)
    {
        this.httpClient = httpClient;
        this.configuration = configuration;
        this.logger = logger;
    }

    public async Task<string> GenerateAsync(
        string prompt,
        IReadOnlyList<string?>? inlineImages = null,
        CancellationToken cancellationToken = default)
    {
        string? apiKey = this.configuration["Anthropic:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("Anthropic:ApiKey is not configured.");
        }

        string baseUrl = (this.configuration["Anthropic:BaseUrl"] ?? DefaultBaseUrl).TrimEnd('/');
        string model = this.configuration["Anthropic:Model"] ?? DefaultModel;

        var userContent = new List<object>();
        if (inlineImages is not null)
        {
            foreach (string? raw in inlineImages)
            {
                if (string.IsNullOrWhiteSpace(raw))
                {
                    continue;
                }

                (string Data, string MediaType) image = DecodeInlineImage(raw);
                userContent.Add(new
                {
                    type = "image",
                    source = new
                    {
                        type = "base64",
                        media_type = image.MediaType,
                        data = image.Data,
                    },
                });
            }
        }

        userContent.Add(new { type = "text", text = "Judge the image per the system instructions." });

        var body = new
        {
            model,
            max_tokens = 16,

            // Stable instruction goes in `system` with a cache breakpoint. Across the 3
            // retry calls inside one composite generation the prompt is identical, so
            // caching pays the write once and reads cheaply on retries 2 and 3 — but
            // only if the prompt exceeds the model's minimum cacheable prefix
            // (4096 tokens on Haiku 4.5). Below that it's a silent no-op.
            system = new[]
            {
                new
                {
                    type = "text",
                    text = prompt,
                    cache_control = new { type = "ephemeral" },
                },
            },
            messages = new[]
            {
                new { role = "user", content = userContent },
            },
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/v1/messages")
        {
            Content = JsonContent.Create(body),
        };
        request.Headers.Add("x-api-key", apiKey);
        request.Headers.Add("anthropic-version", AnthropicVersion);

        using HttpResponseMessage response = await this.httpClient.SendAsync(request, cancellationToken);
        string payload = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            this.logger.LogError(
                "Anthropic call failed with status {Status}: {Body}",
                (int)response.StatusCode,
                payload);
            throw new InvalidOperationException($"Anthropic call failed with status {(int)response.StatusCode}.");
        }

        using JsonDocument doc = JsonDocument.Parse(payload);
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

    // Anthropic's image source expects raw base64 + an explicit media_type. Accept
    // both raw base64 (defaulting to image/png — what our compositor produces) and
    // pre-formed data: URLs from callers that have a different mime type.
    private static (string Data, string MediaType) DecodeInlineImage(string raw)
    {
        const string prefix = "data:";
        if (raw.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            int semicolon = raw.IndexOf(';', StringComparison.Ordinal);
            int comma = raw.IndexOf(',', StringComparison.Ordinal);
            string mediaType = semicolon > 0 && comma > semicolon
                ? raw[prefix.Length..semicolon]
                : "image/png";
            return (raw[(comma + 1)..], mediaType);
        }

        return (raw, "image/png");
    }
}
