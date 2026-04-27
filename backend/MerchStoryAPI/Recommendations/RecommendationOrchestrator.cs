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
    private readonly AppDbContext db;
    private readonly IRecommendationProvider provider;
    private readonly ContextAggregator contextAggregator;
    private readonly IConfiguration configuration;

    public RecommendationOrchestrator(
        AppDbContext db,
        IRecommendationProvider provider,
        ContextAggregator contextAggregator,
        IConfiguration configuration)
    {
        this.db = db;
        this.provider = provider;
        this.contextAggregator = contextAggregator;
        this.configuration = configuration;
    }

    public async Task<DailyRecommendation?> GenerateAndPersistAsync(string userId, CancellationToken ct)
    {
        ShopProfile? shop = await this.db.ShopProfiles.SingleOrDefaultAsync(s => s.UserId == userId, ct);
        if (shop is null)
        {
            return null;
        }

        int ideasPerDay = this.configuration.GetValue("Recommendations:IdeasPerDay", 5);

        AggregatedContext aggregated = await this.contextAggregator.GatherAsync(shop, ct);

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
            DegradedSources: aggregated.DegradedSources);

        RecommendationResult result = await this.provider.GenerateAsync(context, ct);

        string snapshot = JsonSerializer.Serialize(new
        {
            signals = aggregated.Signals,
            degradedSources = aggregated.DegradedSources,
            providerSnapshot = TryParseJson(result.ContextSnapshotJson),
        });

        DailyRecommendation row = new()
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            GeneratedAtUtc = DateTime.UtcNow,
            ContextSnapshotJson = snapshot,
            IdeasJson = JsonSerializer.Serialize(result.Ideas),
        };

        this.db.DailyRecommendations.Add(row);
        await this.db.SaveChangesAsync(ct);

        return row;
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
}
