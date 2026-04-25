using MerchStoryImageGeneration.Models.Recommendations;

namespace MerchStoryImageGeneration.Services.Recommendations;

public interface IRecommendationProvider
{
    Task<RecommendationResult> GenerateAsync(RecommendationContext context, CancellationToken ct);
}
