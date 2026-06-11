using System.ClientModel;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.SemanticKernel;
using OpenAI;

namespace MerchStoryImageGeneration.Services.Recommendations;

// Calls the OpenAI-compatible /v1/embeddings endpoint exposed by LM Studio,
// Ollama, vLLM, etc. through Semantic Kernel's OpenAI connector — same library
// the chat services use, so the whole Recommendations stack speaks LLM
// backends through SK. Configure via Recommendations:Llm:* (shared base URL
// with the chat provider) plus Recommendations:Llm:EmbeddingModel +
// Recommendations:Llm:EmbeddingDim.
//
// Dimension is pinned in config and validated against the actual response on
// first call. A mismatch is a hard failure — silently truncating or padding
// would corrupt the pgvector index. We deliberately do NOT pass a dimensions
// hint to the API: local servers often reject the parameter, and validating
// the response is the safer contract anyway.
public class LlmEmbeddingService : IEmbeddingService
{
    private readonly IEmbeddingGenerator<string, Embedding<float>> generator;
    private readonly ILogger<LlmEmbeddingService> logger;
    private readonly string model;
    private readonly int expectedDim;

    public LlmEmbeddingService(IConfiguration configuration, ILogger<LlmEmbeddingService> logger)
    {
        string baseUrl = (configuration["Recommendations:Llm:BaseUrl"]
            ?? "http://localhost:1234/v1").TrimEnd('/');
        this.model = configuration["Recommendations:Llm:EmbeddingModel"]
            ?? "nomic-embed-text-v1.5";
        this.expectedDim = configuration.GetValue("Recommendations:Llm:EmbeddingDim", 768);
        int timeoutSec = configuration.GetValue("Recommendations:Llm:RequestTimeoutSeconds", 90);

        // The kernel-builder embedding overloads don't take a custom endpoint,
        // so build the underlying OpenAIClient ourselves and hand it to SK.
        // The dummy key matters: local servers ignore it but still expect the
        // Authorization header to be present.
        OpenAIClient client = new(
            new ApiKeyCredential("not-required"),
            new OpenAIClientOptions
            {
                Endpoint = new Uri(baseUrl),
                NetworkTimeout = TimeSpan.FromSeconds(timeoutSec),
            });

        Kernel kernel = Kernel.CreateBuilder()
            .AddOpenAIEmbeddingGenerator(this.model, client)
            .Build();
        this.generator = kernel.GetRequiredService<IEmbeddingGenerator<string, Embedding<float>>>();
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

        GeneratedEmbeddings<Embedding<float>> embeddings;
        try
        {
            embeddings = await this.generator.GenerateAsync(texts, cancellationToken: ct);
        }
        catch (ClientResultException ex)
        {
            throw new InvalidOperationException(
                $"Embedding endpoint call failed for model '{this.model}': {ex.Message}", ex);
        }

        if (embeddings.Count != texts.Count)
        {
            throw new InvalidOperationException(
                $"Embedding response had {embeddings.Count} items but expected {texts.Count}.");
        }

        // Validate dimension against config — silently truncating or padding
        // would corrupt the pgvector column, which is dimension-pinned.
        float[][] vectors = new float[embeddings.Count][];
        for (int i = 0; i < embeddings.Count; i++)
        {
            float[] vector = embeddings[i].Vector.ToArray();
            if (vector.Length != this.expectedDim)
            {
                throw new InvalidOperationException(
                    $"Embedding dimension mismatch: model returned {vector.Length}, " +
                    $"config expects {this.expectedDim}. Update Recommendations:Llm:EmbeddingDim or load a matching model.");
            }

            vectors[i] = vector;
        }

        return vectors;
    }
}
