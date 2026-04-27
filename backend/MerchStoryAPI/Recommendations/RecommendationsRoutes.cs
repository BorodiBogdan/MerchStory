using System.Security.Claims;
using System.Text.Json;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryImageGeneration.Models.Recommendations;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.Recommendations;

public static class RecommendationsRoutes
{
    private static readonly HashSet<string> ValidFeedbackActions = new(StringComparer.OrdinalIgnoreCase)
    {
        "viewed",
        "thumbs_up",
        "thumbs_down",
        "dismissed",
        "generated_from",
    };

    public static void MapRecommendationsEndpoints(this WebApplication app)
    {
        RouteGroupBuilder group = app.MapGroup("/recommendations").RequireAuthorization();

        group.MapGet("/today", GetToday);
        group.MapPost("/refresh", RefreshToday);
        group.MapGet("/jobs/{jobId:guid}", GetJob);
        group.MapPost("/{recId:guid}/feedback", PostFeedback);
    }

    // GET /recommendations/today?lang=ro|en
    // - If a row already exists for this user and the current UTC day → returns "ready" inline.
    // - Otherwise kicks off a background generation job → returns "generating" + jobId.
    // The optional `lang` query param takes priority over AppUser.PreferredLanguage —
    // lets the frontend's live language toggle work immediately without waiting
    // for the next /auth/language sync round-trip.
    private static async Task<IResult> GetToday(
        ClaimsPrincipal principal,
        AppDbContext db,
        RecommendationJobRunner runner,
        string? lang,
        CancellationToken ct)
    {
        string? userId = GetUserId(principal);
        if (userId is null)
        {
            return Results.Unauthorized();
        }

        DateTime todayStart = DateTime.UtcNow.Date;
        DateTime tomorrowStart = todayStart.AddDays(1);
        DailyRecommendation? existing = await db.DailyRecommendations
            .Where(r => r.UserId == userId
                        && r.GeneratedAtUtc >= todayStart
                        && r.GeneratedAtUtc < tomorrowStart)
            .OrderByDescending(r => r.GeneratedAtUtc)
            .FirstOrDefaultAsync(ct);

        if (existing is not null)
        {
            string targetLang = await ResolveTargetLangAsync(db, userId, lang, ct);
            return Results.Ok(MapReady(existing, targetLang));
        }

        Guid jobId = runner.StartGeneration(userId);
        return Results.Ok(MapGenerating(jobId));
    }

    // POST /recommendations/refresh — always kicks off a new job; cache hit is ignored.
    private static IResult RefreshToday(
        ClaimsPrincipal principal,
        RecommendationJobRunner runner)
    {
        string? userId = GetUserId(principal);
        if (userId is null)
        {
            return Results.Unauthorized();
        }

        Guid jobId = runner.StartGeneration(userId);
        return Results.Ok(MapGenerating(jobId));
    }

    // GET /recommendations/jobs/{jobId}?lang=ro|en — polling endpoint.
    private static async Task<IResult> GetJob(
        Guid jobId,
        ClaimsPrincipal principal,
        AppDbContext db,
        RecommendationJobRegistry registry,
        string? lang,
        CancellationToken ct)
    {
        string? userId = GetUserId(principal);
        if (userId is null)
        {
            return Results.Unauthorized();
        }

        JobEntry? entry = registry.Get(jobId);
        if (entry is null || entry.UserId != userId)
        {
            return Results.NotFound();
        }

        switch (entry.State)
        {
            case JobState.Generating:
                return Results.Ok(MapGenerating(entry.JobId));

            case JobState.Failed:
                return Results.Ok(new RecommendationResponse(
                    Status: "failed",
                    JobId: entry.JobId,
                    Id: null,
                    GeneratedAtUtc: null,
                    Ideas: null,
                    Error: entry.Error));

            case JobState.Ready when entry.RecommendationId is { } recId:
                // Re-read from DB to get the canonical persisted shape.
                DailyRecommendation? row = await db.DailyRecommendations
                    .FirstOrDefaultAsync(r => r.Id == recId, ct);
                if (row is null)
                {
                    return Results.Ok(new RecommendationResponse(
                        Status: "failed",
                        JobId: entry.JobId,
                        Id: null,
                        GeneratedAtUtc: null,
                        Ideas: null,
                        Error: "Recommendation row missing after job completion."));
                }

                string targetLangForJob = await ResolveTargetLangAsync(db, userId, lang, ct);
                return Results.Ok(MapReady(row, targetLangForJob));

            default:
                return Results.Ok(MapGenerating(entry.JobId));
        }
    }

    // POST /recommendations/{recId}/feedback
    private static async Task<IResult> PostFeedback(
        Guid recId,
        FeedbackRequest request,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        string? userId = GetUserId(principal);
        if (userId is null)
        {
            return Results.Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.IdeaId))
        {
            return Results.BadRequest("ideaId is required.");
        }

        string action = request.Action?.Trim().ToLowerInvariant() ?? string.Empty;
        if (!ValidFeedbackActions.Contains(action))
        {
            return Results.BadRequest(
                $"Invalid action '{action}'. Allowed: {string.Join(", ", ValidFeedbackActions)}");
        }

        // Cross-tenant guard: a user can only record feedback against their own
        // recommendation rows.
        bool ownsRow = await db.DailyRecommendations
            .AnyAsync(r => r.Id == recId && r.UserId == userId, ct);
        if (!ownsRow)
        {
            return Results.NotFound();
        }

        db.IdeaInteractions.Add(new IdeaInteraction
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            DailyRecommendationId = recId,
            IdeaId = request.IdeaId.Trim(),
            Action = action,
            CreatedAt = DateTime.UtcNow,
        });

        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static RecommendationResponse MapReady(DailyRecommendation row, string targetLang)
    {
        IdeaDto[] persistedIdeas = string.IsNullOrEmpty(row.IdeasJson)
            ? Array.Empty<IdeaDto>()
            : JsonSerializer.Deserialize<IdeaDto[]>(row.IdeasJson) ?? Array.Empty<IdeaDto>();

        // Project each idea to the user's current language. Translations are
        // stored alongside the canonical English text so toggling languages
        // never requires regeneration. Translations dict is stripped before the
        // wire response — frontend gets a flat IdeaDto in the picked language.
        IdeaDto[] localized = persistedIdeas.Select(i => Project(i, targetLang)).ToArray();

        return new RecommendationResponse(
            Status: "ready",
            JobId: null,
            Id: row.Id,
            GeneratedAtUtc: row.GeneratedAtUtc,
            Ideas: localized,
            Error: null);
    }

    private static IdeaDto Project(IdeaDto idea, string targetLang)
    {
        // English (or unknown lang) → use base fields; just clear translations.
        if (string.Equals(targetLang, "en", StringComparison.OrdinalIgnoreCase) || idea.Translations is null)
        {
            return idea with { Translations = null };
        }

        if (idea.Translations.TryGetValue(targetLang, out IdeaTranslation? t))
        {
            return idea with
            {
                Title = t.Title,
                Meta = t.Meta,
                Body = t.Body,
                SuggestedPost = t.SuggestedPost,
                Translations = null,
            };
        }

        // Translation missing for this language — fall back to English.
        return idea with { Translations = null };
    }

    // Resolves the language to project ideas in. Priority:
    //   1. Explicit `?lang=` query param from the frontend (its useI18n() value).
    //      The frontend's i18n state is the source of truth — it can change
    //      faster than AppUser.PreferredLanguage syncs.
    //   2. AppUser.PreferredLanguage as fallback when the param is absent /
    //      malformed (e.g. someone hits the API directly).
    //   3. "en" when no user record either.
    private static async Task<string> ResolveTargetLangAsync(
        AppDbContext db,
        string userId,
        string? queryLang,
        CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(queryLang))
        {
            string normalized = queryLang.Trim().ToLowerInvariant();
            if (normalized is "en" or "ro")
            {
                return normalized;
            }
        }

        return await GetTargetLangAsync(db, userId, ct);
    }

    // Reads the user's app-language preference (AppUser.PreferredLanguage)
    // and normalizes to an ISO-639-1 lang code matching the keys in
    // IdeaDto.Translations. Returns "en" when the user record is missing.
    private static async Task<string> GetTargetLangAsync(AppDbContext db, string userId, CancellationToken ct)
    {
        AppLanguage? lang = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => (AppLanguage?)u.PreferredLanguage)
            .FirstOrDefaultAsync(ct);

        return lang switch
        {
            AppLanguage.RO => "ro",
            _ => "en",
        };
    }

    private static RecommendationResponse MapGenerating(Guid jobId) => new(
        Status: "generating",
        JobId: jobId,
        Id: null,
        GeneratedAtUtc: null,
        Ideas: null,
        Error: null);

    private static string? GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
}

// Discriminated response. Status is the only always-present field; everything
// else is null-omitted by System.Text.Json defaults so the wire payload stays
// tight per state.
public record RecommendationResponse(
    string Status,
    Guid? JobId,
    Guid? Id,
    DateTime? GeneratedAtUtc,
    IReadOnlyList<IdeaDto>? Ideas,
    string? Error);

public record FeedbackRequest(string IdeaId, string Action);
