namespace MerchStoryImageGeneration.Models.Recommendations;

// Inputs to a recommendation provider. Phase 1 carries only shop-profile data;
// Phase 2 adds external context signals (weather/holidays/news), Phase 5 adds
// RAG hits (PromoPlaybook + PreviousIdeas).
public record RecommendationContext(
    string UserId,
    string BrandName,
    string BusinessDomain,
    string? OtherDomain,
    string? TargetAudience,
    string? ShopType,
    string? City,
    string CountryCode,
    double? Latitude,
    double? Longitude,
    string GenerationLanguage,
    int IdeasPerDay);
