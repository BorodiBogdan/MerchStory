using System.Diagnostics;
using System.Text.Json;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryAPI.Recommendations.Context;
using MerchStoryImageGeneration.Models.Recommendations;
using MerchStoryImageGeneration.Services.Recommendations;
using Microsoft.EntityFrameworkCore;

namespace MerchStoryAPI.Recommendations;

// Owns the generate-and-persist pipeline. Pulled out of RecommendationsRoutes
// in Phase 3 because the same logic now runs from two callers: the synchronous
// route handler (for tests + Mock provider) and the async job runner (for the
// real LLM provider). Keeping it here keeps the routes file thin.
public class RecommendationOrchestrator
{
    private const int PlaybookTopK = 3;
    private const int PreviousIdeasTopK = 5;

    private readonly AppDbContext db;
    private readonly IRecommendationProvider provider;
    private readonly ContextAggregator contextAggregator;
    private readonly PlaybookRetriever playbookRetriever;
    private readonly IdeaEmbeddingService ideaEmbeddings;
    private readonly IConfiguration configuration;
    private readonly ILogger<RecommendationOrchestrator> logger;

    public RecommendationOrchestrator(
        AppDbContext db,
        IRecommendationProvider provider,
        ContextAggregator contextAggregator,
        PlaybookRetriever playbookRetriever,
        IdeaEmbeddingService ideaEmbeddings,
        IConfiguration configuration,
        ILogger<RecommendationOrchestrator> logger)
    {
        this.db = db;
        this.provider = provider;
        this.contextAggregator = contextAggregator;
        this.playbookRetriever = playbookRetriever;
        this.ideaEmbeddings = ideaEmbeddings;
        this.configuration = configuration;
        this.logger = logger;
    }

    public async Task<DailyRecommendation?> GenerateAndPersistAsync(string userId, CancellationToken ct)
    {
        Stopwatch totalSw = Stopwatch.StartNew();
        this.logger.LogInformation("[Pipeline] start user={UserId}", userId);

        ShopProfile? shop = await this.db.ShopProfiles.SingleOrDefaultAsync(s => s.UserId == userId, ct);
        if (shop is null)
        {
            this.logger.LogWarning("[Pipeline] abort user={UserId}: no shop profile", userId);
            return null;
        }

        this.logger.LogInformation(
            "[Pipeline] shop={Brand} domain={Domain} city={City} country={Country} lang={Lang}",
            shop.BrandName,
            shop.BusinessDomain,
            shop.City ?? "(none)",
            shop.CountryCode,
            shop.GenerationLanguage);

        int ideasPerDay = this.configuration.GetValue("Recommendations:IdeasPerDay", 5);

        // Stage 1 — context signals
        Stopwatch stageSw = Stopwatch.StartNew();
        this.logger.LogInformation("[Pipeline] stage=context start");
        AggregatedContext aggregated = await this.contextAggregator.GatherAsync(shop, ct);
        this.logger.LogInformation(
            "[Pipeline] stage=context done in {Ms}ms signals={SignalCount} degraded=[{Degraded}]",
            stageSw.ElapsedMilliseconds,
            aggregated.Signals.Count,
            string.Join(",", aggregated.DegradedSources));

        // Stage 2 — playbook RAG
        string ragQuery = BuildRagQuery(shop, aggregated.Signals);
        stageSw.Restart();
        this.logger.LogInformation("[Pipeline] stage=playbook-rag start query='{Query}'", Truncate(ragQuery, 160));
        IReadOnlyList<PlaybookHit> playbookHits = await this.playbookRetriever
            .RetrieveAsync(shop.BusinessDomain, ragQuery, PlaybookTopK, ct);
        this.logger.LogInformation(
            "[Pipeline] stage=playbook-rag done in {Ms}ms hits={HitCount} themes=[{Themes}]",
            stageSw.ElapsedMilliseconds,
            playbookHits.Count,
            string.Join(" | ", playbookHits.Select(h => h.Theme)));

        // Stage 3 — previous-ideas RAG
        stageSw.Restart();
        this.logger.LogInformation("[Pipeline] stage=previous-ideas-rag start");
        IReadOnlyList<PreviousIdeaHit> previousIdeas = await this.ideaEmbeddings
            .RetrieveRecentForUserAsync(userId, ragQuery, PreviousIdeasTopK, ct);
        this.logger.LogInformation(
            "[Pipeline] stage=previous-ideas-rag done in {Ms}ms hits={HitCount}",
            stageSw.ElapsedMilliseconds,
            previousIdeas.Count);

        RecommendationContext context = new(
            UserId: userId,
            BrandName: shop.BrandName,
            BusinessDomain: shop.BusinessDomain,
            OtherDomain: shop.OtherDomain,
            TargetAudience: shop.TargetAudience,
            ShopType: shop.ShopType,
            City: shop.City,
            CountryCode: shop.CountryCode,
            Latitude: shop.Latitude,
            Longitude: shop.Longitude,
            GenerationLanguage: shop.GenerationLanguage.ToString(),
            IdeasPerDay: ideasPerDay,
            Signals: aggregated.Signals,
            DegradedSources: aggregated.DegradedSources,
            PlaybookHits: playbookHits,
            PreviousIdeas: previousIdeas);

        // Stage 4 — provider (Mock or LLM Strategist+Writers)
        stageSw.Restart();
        this.logger.LogInformation(
            "[Pipeline] stage=provider start providerType={Type} ideasPerDay={N}",
            this.provider.GetType().Name,
            ideasPerDay);
        RecommendationResult result = await this.provider.GenerateAsync(context, ct);
        this.logger.LogInformation(
            "[Pipeline] stage=provider done in {Ms}ms ideas={IdeaCount}",
            stageSw.ElapsedMilliseconds,
            result.Ideas.Count);

        ContextSnapshot snapshotShape = new(
            Signals: aggregated.Signals,
            DegradedSources: aggregated.DegradedSources,
            PlaybookHits: playbookHits.Select(h => h.Theme).ToArray(),
            ProviderSnapshot: TryParseJson(result.ContextSnapshotJson));
        string snapshot = JsonSerializer.Serialize(snapshotShape);

        DailyRecommendation row = new()
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            GeneratedAtUtc = DateTime.UtcNow,
            ContextSnapshotJson = snapshot,
            IdeasJson = JsonSerializer.Serialize(result.Ideas),
        };

        // Stage 5 — persist
        stageSw.Restart();
        this.db.DailyRecommendations.Add(row);
        await this.db.SaveChangesAsync(ct);
        this.logger.LogInformation(
            "[Pipeline] stage=persist done in {Ms}ms recommendationId={RecId}",
            stageSw.ElapsedMilliseconds,
            row.Id);

        // Stage 6 — embed new ideas (best-effort, doesn't fail the run)
        stageSw.Restart();
        this.logger.LogInformation("[Pipeline] stage=embed-new-ideas start count={Count}", result.Ideas.Count);
        await this.ideaEmbeddings.PersistIdeasAsync(
            userId,
            row.Id,
            row.GeneratedAtUtc,
            result.Ideas,
            ct);
        this.logger.LogInformation(
            "[Pipeline] stage=embed-new-ideas done in {Ms}ms",
            stageSw.ElapsedMilliseconds);

        this.logger.LogInformation(
            "[Pipeline] DONE user={UserId} total={TotalMs}ms ideas={Count}",
            userId,
            totalSw.ElapsedMilliseconds,
            result.Ideas.Count);

        return row;
    }

    private static string Truncate(string s, int max)
        => s.Length <= max ? s : s[..max] + "…";

    private static string BuildRagQuery(ShopProfile shop, IReadOnlyList<ContextSignal> signals)
    {
        // Top 5 signals by severity — captures the strongest "what's happening
        // now" for retrieval. Falls back to shop identity alone if no signals.
        IEnumerable<string> signalParts = signals
            .OrderBy(s => s.Severity == "high" ? 0 : s.Severity == "medium" ? 1 : 2)
            .Take(5)
            .Select(s => $"{s.Source}: {s.Title}");

        string signalSummary = string.Join("; ", signalParts);
        string shopSummary = $"{shop.BusinessDomain} shop \"{shop.BrandName}\"" +
            (string.IsNullOrEmpty(shop.City) ? string.Empty : $" in {shop.City}");

        return string.IsNullOrEmpty(signalSummary) ? shopSummary : $"{shopSummary} | {signalSummary}";
    }

    private static JsonElement? TryParseJson(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        try
        {
            using JsonDocument doc = JsonDocument.Parse(raw);
            return doc.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    // Concrete shape for the diagnostic snapshot persisted alongside each
    // DailyRecommendation row. Was originally an anonymous type, but those
    // get compiler-generated names like '<>f__AnonymousType5' that drift
    // under dotnet watch hot reload — concrete record sidesteps that.
    private record ContextSnapshot(
        IReadOnlyList<ContextSignal> Signals,
        IReadOnlyList<string> DegradedSources,
        IReadOnlyList<string> PlaybookHits,
        JsonElement? ProviderSnapshot);
}
