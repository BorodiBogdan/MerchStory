using MerchStoryAPI.Models;
using MerchStoryImageGeneration.Models.Recommendations;

namespace MerchStoryAPI.Recommendations.Context;

// Fans context-signal collection out across all registered providers in
// parallel. Per-provider try/catch isolates failures: if Open-Meteo is down,
// we still get holidays + news, with "weather" recorded in DegradedSources for
// diagnostic visibility.
public class ContextAggregator
{
    private readonly IEnumerable<IContextProvider> providers;
    private readonly ILogger<ContextAggregator> logger;

    public ContextAggregator(IEnumerable<IContextProvider> providers, ILogger<ContextAggregator> logger)
    {
        this.providers = providers;
        this.logger = logger;
    }

    public async Task<AggregatedContext> GatherAsync(ShopProfile shop, CancellationToken ct)
    {
        IContextProvider[] providerList = this.providers.ToArray();
        Task<ProviderRun>[] tasks = providerList
            .Select(p => this.RunOneAsync(p, shop, ct))
            .ToArray();

        ProviderRun[] runs = await Task.WhenAll(tasks);

        List<ContextSignal> signals = new();
        List<string> degraded = new();
        foreach (ProviderRun run in runs)
        {
            if (run.Failed)
            {
                degraded.Add(run.SourceName);
                continue;
            }

            signals.AddRange(run.Signals);
        }

        return new AggregatedContext(signals, degraded);
    }

    private async Task<ProviderRun> RunOneAsync(IContextProvider provider, ShopProfile shop, CancellationToken ct)
    {
        try
        {
            IReadOnlyList<ContextSignal> signals = await provider.GetSignalsAsync(shop, ct);
            return new ProviderRun(provider.SourceName, signals, Failed: false);
        }
        catch (Exception ex)
        {
            this.logger.LogWarning(
                ex,
                "Context provider {SourceName} failed; pipeline will continue with degraded signals.",
                provider.SourceName);
            return new ProviderRun(provider.SourceName, Array.Empty<ContextSignal>(), Failed: true);
        }
    }

    private record ProviderRun(string SourceName, IReadOnlyList<ContextSignal> Signals, bool Failed);
}

public record AggregatedContext(IReadOnlyList<ContextSignal> Signals, IReadOnlyList<string> DegradedSources);
