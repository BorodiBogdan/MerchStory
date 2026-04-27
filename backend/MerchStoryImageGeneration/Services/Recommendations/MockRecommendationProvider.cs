using MerchStoryImageGeneration.Models.Recommendations;

namespace MerchStoryImageGeneration.Services.Recommendations;

// Seed provider used in dev + integration tests. As of Phase 2 it consumes
// the aggregated ContextSignals and templates them into ideas, so dev/test
// runs reflect real weather and holiday data without needing a running LLM.
// When live signals run thin, we backfill with hand-written seeds so the
// frontend always renders the configured number of cards.
//
// Phase 3 swaps this for the LM Studio provider via Recommendations:ProviderType.
public class MockRecommendationProvider : IRecommendationProvider
{
    private static readonly IdeaDto[] SeedIdeas =
    [
        new(
            Id: "spring-clean",
            Tone: "trend",
            Title: "Spring-cleaning searches peaking",
            Meta: "Google Trends · +62% this week",
            Body: "Home organizers, cleaning kits and storage solutions are seeing their biggest national lift of the year.",
            SuggestedPost: "Spring refresh bundle"),
        new(
            Id: "weeknight-dinner",
            Tone: "trend",
            Title: "Weeknight quick-dinner queries surging",
            Meta: "Search trend · weekday evenings",
            Body: "Customers are looking for 20-minute meal ideas. Bundle pantry staples + a recipe card to win the dinner-rush window.",
            SuggestedPost: "20-minute dinner kit"),
        new(
            Id: "weekend-bundle",
            Tone: "trend",
            Title: "Weekend family-meal moment",
            Meta: "Sat–Sun · peak basket size",
            Body: "Saturday baskets are 30% larger than weekday ones for markets. A 'Sunday roast' bundle (centrepiece + sides + dessert) leans into that intent.",
            SuggestedPost: "Sunday roast bundle"),
    ];

    public Task<RecommendationResult> GenerateAsync(RecommendationContext context, CancellationToken ct)
    {
        int target = context.IdeasPerDay > 0 ? context.IdeasPerDay : 5;

        // Sort signals: high → medium → low; ties broken by earliest RelevantOnDate.
        IdeaDto[] fromSignals = context.Signals
            .OrderBy(s => SeverityRank(s.Severity))
            .ThenBy(s => s.RelevantOnDate ?? DateTime.MaxValue)
            .Select((s, i) => SignalToIdea(s, i))
            .ToArray();

        List<IdeaDto> assembled = new(target);
        assembled.AddRange(fromSignals.Take(target));

        // Backfill with seed ideas so the frontend always has a full grid.
        if (assembled.Count < target)
        {
            assembled.AddRange(SeedIdeas
                .Where(seed => assembled.All(a => a.Id != seed.Id))
                .Take(target - assembled.Count));
        }

        return Task.FromResult(new RecommendationResult(
            Ideas: assembled,
            ContextSnapshotJson: """{"provider":"mock"}""",
            DegradedSignals: Array.Empty<string>()));
    }

    private static int SeverityRank(string severity) => severity switch
    {
        "high" => 0,
        "medium" => 1,
        _ => 2,
    };

    private static IdeaDto SignalToIdea(ContextSignal signal, int index)
    {
        string tone = NormalizeTone(signal.Source);
        string meta = signal.RelevantOnDate is { } d
            ? d.ToString("ddd MMM d")
            : signal.Severity switch
            {
                "high" => "High priority",
                "medium" => "Worth acting on",
                _ => "Ambient signal",
            };

        return new IdeaDto(
            Id: $"signal-{tone}-{index}",
            Tone: tone,
            Title: signal.Title,
            Meta: meta,
            Body: signal.Summary,
            SuggestedPost: BuildSuggestedPost(signal, tone));
    }

    private static string NormalizeTone(string source) => source switch
    {
        "weather" => "weather",
        "holiday" => "holiday",
        "news" => "news",
        _ => "trend",
    };

    // Bare templated copy — the LLM in later phases produces something less
    // formulaic, but for Mock this still proves the signal flowed through.
    private static string BuildSuggestedPost(ContextSignal signal, string tone) => tone switch
    {
        "weather" => "Weather-tied promo",
        "holiday" => "Holiday gift guide",
        "news" => "Local-moment piggyback",
        _ => "Trending angle",
    };
}
