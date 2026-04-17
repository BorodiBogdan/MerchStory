using Pgvector;

namespace MerchStoryAPI.ReferenceImages;

public interface IClipEmbeddingService
{
    Vector Embed(byte[] imageBytes);
}
