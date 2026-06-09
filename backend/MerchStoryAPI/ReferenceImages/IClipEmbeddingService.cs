using Pgvector;

namespace MerchStoryAPI.ReferenceImages;

public interface IClipEmbeddingService
{
    Vector Embed(byte[] imageBytes);

    /// <summary>
    /// Embeds a free-text query into the same 512-dim space as <see cref="Embed"/>
    /// using the CLIP text encoder, enabling text-to-image similarity search.
    /// </summary>
    /// <param name="text">The free-text query to embed.</param>
    /// <returns>A 512-dimensional, L2-normalized CLIP embedding vector.</returns>
    Vector EmbedText(string text);
}
