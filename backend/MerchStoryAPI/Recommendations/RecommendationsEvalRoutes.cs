using MerchStoryImageGeneration.Models.Recommendations;
using MerchStoryImageGeneration.Services.Recommendations;
using MerchStoryImageGeneration.Services.Recommendations.Chat;

namespace MerchStoryAPI.Recommendations;

// Admin-only evaluation endpoint. Runs the writer pipeline on a caller-supplied
// (shop, signals) tuple against a caller-chosen model, synchronously, with NO
// database read, NO live context gathering, and NO persistence.
//
// This exists so the DeepEval harness in /python can drive every writer model
// head-to-head on a frozen reference set (see chapter5.tex, "LLM output
// evaluation with DeepEval"). The normal /recommendations pipeline can't do
// this: it reads the authenticated user's real shop and gathers live weather /
// news / holiday signals, and the model is fixed at startup. Here the caller
// supplies the tuple and picks the backend per request.
//
// Admin-only (matches /recommendations/refresh): a generation call burns real
// model credits, so it sits behind the same AdminOnly gate.
public static class RecommendationsEvalRoutes
{
    public static void MapRecommendationsEvalEndpoints(this WebApplication app)
    {
        app.MapPost("/recommendations/evaluate", Evaluate)
            .RequireAuthorization("AdminOnly");
    }

    private static async Task<IResult> Evaluate(
        EvalRequest request,
        IConfiguration configuration,
        ILoggerFactory loggerFactory,
        CancellationToken ct)
    {
        if (request.Shop is null)
        {
            return Results.BadRequest("shop is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Backend))
        {
            return Results.BadRequest("backend is required (Local, DeepSeek, Claude, or ChatGPT).");
        }

        IRecommendationChatService chat;
        try
        {
            chat = RecommendationChatServiceFactory.Create(
                request.Backend,
                request.Model,
                configuration,
                loggerFactory);
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(ex.Message);
        }

        var provider = new LlmRecommendationProvider(
            chat,
            loggerFactory.CreateLogger<LlmRecommendationProvider>());

        EvalShop shop = request.Shop;
        int ideasPerDay = request.IdeasPerDay is > 0 ? request.IdeasPerDay.Value : 2;

        ContextSignal[] signals = (request.Signals ?? Array.Empty<EvalSignal>())
            .Select(s => new ContextSignal(
                Source: s.Source ?? "trend",
                Title: s.Title ?? string.Empty,
                Summary: s.Summary ?? string.Empty,
                Severity: s.Severity ?? "medium",
                RelevantOnDate: s.RelevantOnDate))
            .ToArray();

        var context = new RecommendationContext(
            UserId: "eval",
            BrandName: shop.BrandName ?? "Shop",
            BusinessDomain: shop.BusinessDomain ?? "Market",
            OtherDomain: shop.OtherDomain,
            TargetAudience: shop.TargetAudience,
            ShopType: shop.ShopType,
            City: shop.City,
            CountryCode: shop.CountryCode ?? "RO",
            Latitude: null,
            Longitude: null,
            GenerationLanguage: shop.GenerationLanguage ?? "EN",
            IdeasPerDay: ideasPerDay,
            Signals: signals,
            DegradedSources: Array.Empty<string>(),
            PlaybookHits: Array.Empty<PlaybookHit>(),
            PreviousIdeas: Array.Empty<PreviousIdeaHit>());

        try
        {
            RecommendationResult result = await provider.GenerateAsync(context, ct);
            return Results.Ok(new EvalResponse(chat.Description, result.Ideas));
        }
        catch (Exception ex)
        {
            return Results.Problem(
                title: "Evaluation generation failed.",
                detail: ex.Message,
                statusCode: StatusCodes.Status502BadGateway);
        }
    }
}

// Request body for POST /recommendations/evaluate. Shop + signals are the
// (shop, day, signal) tuple; backend/model pick the writer model under test.
public record EvalRequest(
    string Backend,
    string? Model,
    int? IdeasPerDay,
    EvalShop Shop,
    EvalSignal[]? Signals);

public record EvalShop(
    string? BrandName,
    string? BusinessDomain,
    string? OtherDomain,
    string? TargetAudience,
    string? ShopType,
    string? City,
    string? CountryCode,
    string? GenerationLanguage);

public record EvalSignal(
    string? Source,
    string? Title,
    string? Summary,
    string? Severity,
    DateTime? RelevantOnDate);

public record EvalResponse(string Backend, IReadOnlyList<IdeaDto> Ideas);
