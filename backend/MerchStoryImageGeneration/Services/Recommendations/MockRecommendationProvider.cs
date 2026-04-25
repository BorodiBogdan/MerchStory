using MerchStoryImageGeneration.Models.Recommendations;

namespace MerchStoryImageGeneration.Services.Recommendations;

// Seed provider used in dev + integration tests. Returns a fixed set of ideas
// so the rest of the pipeline (persistence, routes, frontend wiring) can be
// validated end-to-end without depending on a running LLM. Phases 2+ swap this
// for the real LM Studio provider via the Recommendations:ProviderType config.
public class MockRecommendationProvider : IRecommendationProvider
{
    private static readonly IdeaDto[] SeedIdeas =
    [
        new(
            Id: "rain",
            Tone: "weather",
            Title: "Cold rain rolling in this weekend",
            Meta: "Sat–Sun · 8°C · 85% rain",
            Body: "Warm drinks, comfort food, and cozy apparel move fastest on rainy weekends. Push a 'stay-in' promo.",
            SuggestedPost: "Hot drinks · 15% off"),
        new(
            Id: "mothers-day",
            Tone: "holiday",
            Title: "Mother's Day is in 4 days",
            Meta: "May 11 · national holiday",
            Body: "Curate a gift bundle — beauty, handmade goods and flowers historically outsell everything else this week.",
            SuggestedPost: "Mother's Day gift guide"),
        new(
            Id: "marathon",
            Tone: "news",
            Title: "Downtown half-marathon on Saturday",
            Meta: "Runs past your street · ~4k runners",
            Body: "Thousands will walk past your shop. Run a hydration promo or a finisher-reward bundle on race day.",
            SuggestedPost: "Marathon weekend special"),
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
    ];

    public Task<RecommendationResult> GenerateAsync(RecommendationContext context, CancellationToken ct)
    {
        IReadOnlyList<IdeaDto> ideas = SeedIdeas
            .Take(context.IdeasPerDay > 0 ? context.IdeasPerDay : SeedIdeas.Length)
            .ToArray();

        return Task.FromResult(new RecommendationResult(
            Ideas: ideas,
            ContextSnapshotJson: """{"provider":"mock"}""",
            DegradedSignals: Array.Empty<string>()));
    }
}
