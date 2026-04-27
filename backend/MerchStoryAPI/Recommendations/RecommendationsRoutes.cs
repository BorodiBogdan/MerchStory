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

    // GET /recommendations/today
    // - If a row already exists for this user and the current UTC day → returns "ready" inline.
    // - Otherwise kicks off a background generation job → returns "generating" + jobId.
    private static async Task<IResult> GetToday(
        ClaimsPrincipal principal,
        AppDbContext db,
        RecommendationJobRunner runner,
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
            return Results.Ok(MapReady(existing));
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

    // GET /recommendations/jobs/{jobId} — polling endpoint.
    private static async Task<IResult> GetJob(
        Guid jobId,
        ClaimsPrincipal principal,
        AppDbContext db,
        RecommendationJobRegistry registry,
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

                return Results.Ok(MapReady(row));

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

    private static RecommendationResponse MapReady(DailyRecommendation row)
    {
        IReadOnlyList<IdeaDto> ideas = string.IsNullOrEmpty(row.IdeasJson)
            ? Array.Empty<IdeaDto>()
            : JsonSerializer.Deserialize<IdeaDto[]>(row.IdeasJson) ?? Array.Empty<IdeaDto>();

        return new RecommendationResponse(
            Status: "ready",
            JobId: null,
            Id: row.Id,
            GeneratedAtUtc: row.GeneratedAtUtc,
            Ideas: ideas,
            Error: null);
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
