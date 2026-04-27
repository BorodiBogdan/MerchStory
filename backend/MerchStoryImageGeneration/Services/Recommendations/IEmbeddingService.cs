namespace MerchStoryImageGeneration.Services.Recommendations;

public interface IEmbeddingService
{
    int Dimensions { get; }

    Task<float[]> EmbedAsync(string text, CancellationToken ct);

    Task<IReadOnlyList<float[]>> EmbedManyAsync(IReadOnlyList<string> texts, CancellationToken ct);
}
