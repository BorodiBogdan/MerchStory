using MerchStoryAPI.Models;
using MerchStoryImageGeneration.Models.Recommendations;

namespace MerchStoryAPI.Recommendations.Context;

public interface IContextProvider
{
    string SourceName { get; }

    Task<IReadOnlyList<ContextSignal>> GetSignalsAsync(ShopProfile shop, CancellationToken ct);
}
