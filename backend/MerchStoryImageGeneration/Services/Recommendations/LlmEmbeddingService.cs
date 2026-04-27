using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MerchStoryImageGeneration.Services.Recommendations;

// Calls the OpenAI-compatible /v1/embeddings endpoint exposed by LM Studio,
// Ollama, vLLM, etc. Configure via Recommendations:Llm:* (shared base URL with
// the chat provider) plus Recommendations:Llm:EmbeddingModel +
// Recommendations:Llm:EmbeddingDim.
//
// Dimension is pinned in config and validated against the actual response on
// first call. A mismatch is a hard failure — silently truncating or padding
// would corrupt the pgvector index.
public class LlmEmbeddingService : IEmbeddingService
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly HttpClient httpClient;
    private readonly ILogger<LlmEmbeddingService> logger;
    private readonly string baseUrl;
    private readonly string model;
    private readonly int expectedDim;

    public LlmEmbeddingService(IConfiguration configuration, ILogger<LlmEmbeddingService> logger)
    {
        this.baseUrl = (configuration["Recommendations:Llm:BaseUrl"]
            ?? "http://localhost:1234/v1").TrimEnd('/');
        this.model = configuration["Recommendations:Llm:EmbeddingModel"]
            ?? "nomic-embed-text-v1.5";
        this.expectedDim = configuration.GetValue("Recommendations:Llm:EmbeddingDim", 768);
        int timeoutSec = configuration.GetValue("Recommendations:Llm:RequestTimeoutSeconds", 90);

        this.httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(timeoutSec) };
        this.logger = logger;
    }

    public int Dimensions => this.expectedDim;

    public async Task<float[]> EmbedAsync(string text, CancellationToken ct)
    {
        IReadOnlyList<float[]> result = await this.EmbedManyAsync(new[] { text }, ct);
        return result[0];
    }

    public async Task<IReadOnlyList<float[]>> EmbedManyAsync(IReadOnlyList<string> texts, CancellationToken ct)
    {
        if (texts.Count == 0)
        {
            return Array.Empty<float[]>();
        }

        EmbeddingRequest payload = new(this.model, texts.ToArray());
        string body = JsonSerializer.Serialize(payload);

        using HttpRequestMessage req = new(HttpMethod.Post, $"{this.baseUrl}/embeddings")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
        req.Headers.Add("Authorization", "Bearer not-required");

        using HttpResponseMessage response = await this.httpClient.SendAsync(req, ct);
        if (!response.IsSuccessStatusCode)
        {
            string errBody = await response.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException(
                $"Embedding endpoint returned {response.StatusCode}: {Truncate(errBody, 400)}");
        }

        string json = await response.Content.ReadAsStringAsync(ct);
        EmbeddingResponse? parsed = JsonSerializer.Deserialize<EmbeddingResponse>(json, JsonOpts);
        if (parsed?.Data is null || parsed.Data.Length != texts.Count)
        {
            throw new InvalidOperationException(
                $"Embedding response had {parsed?.Data?.Length ?? 0} items but expected {texts.Count}.");
        }

        // Validate dimension against config — silently truncating or padding
        // would corrupt the pgvector column, which is dimension-pinned.
        foreach (EmbeddingItem item in parsed.Data)
        {
            if (item.Embedding is null || item.Embedding.Length != this.expectedDim)
            {
                throw new InvalidOperationException(
                    $"Embedding dimension mismatch: model returned {item.Embedding?.Length ?? 0}, " +
                    $"config expects {this.expectedDim}. Update Recommendations:Llm:EmbeddingDim or load a matching model.");
            }
        }

        return parsed.Data
            .OrderBy(d => d.Index)
            .Select(d => d.Embedding!)
            .ToArray();
    }

    private static string Truncate(string s, int max)
        => s.Length <= max ? s : s[..max] + "…";

    private record EmbeddingRequest(
        [property: JsonPropertyName("model")] string Model,
        [property: JsonPropertyName("input")] string[] Input);

    private record EmbeddingResponse([property: JsonPropertyName("data")] EmbeddingItem[]? Data);

    private record EmbeddingItem(
        [property: JsonPropertyName("index")] int Index,
        [property: JsonPropertyName("embedding")] float[]? Embedding);
}
