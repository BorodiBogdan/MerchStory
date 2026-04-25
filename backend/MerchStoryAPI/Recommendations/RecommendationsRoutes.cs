using System.Security.Claims;
using System.Text.Json;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryImageGeneration.Models.Recommendations;
using MerchStoryImageGeneration.Services.Recommendations;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.Recommendations;

public static class RecommendationsRoutes
{
    public static void MapRecommendationsEndpoints(this WebApplication app)
    {
        RouteGroupBuilder group = app.MapGroup("/recommendations").RequireAuthorization();

        group.MapGet("/today", GetToday);
        group.MapPost("/refresh", RefreshToday);
    }

    private static async Task<IResult> GetToday(
        ClaimsPrincipal principal,
        AppDbContext db,
        IRecommendationProvider provider,
        IConfiguration configuration,
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
            return Results.Ok(MapToResponse(existing));
        }

        DailyRecommendation? generated = await GenerateAndPersist(userId, db, provider, configuration, ct);
        return generated is null
            ? Results.BadRequest("Shop profile required before generating recommendations.")
            : Results.Ok(MapToResponse(generated));
    }

    private static async Task<IResult> RefreshToday(
        ClaimsPrincipal principal,
        AppDbContext db,
        IRecommendationProvider provider,
        IConfiguration configuration,
        CancellationToken ct)
    {
        string? userId = GetUserId(principal);
        if (userId is null)
        {
            return Results.Unauthorized();
        }

        DailyRecommendation? generated = await GenerateAndPersist(userId, db, provider, configuration, ct);
        return generated is null
            ? Results.BadRequest("Shop profile required before generating recommendations.")
            : Results.Ok(MapToResponse(generated));
    }

    private static async Task<DailyRecommendation?> GenerateAndPersist(
        string userId,
        AppDbContext db,
        IRecommendationProvider provider,
        IConfiguration configuration,
        CancellationToken ct)
    {
        ShopProfile? shop = await db.ShopProfiles.SingleOrDefaultAsync(s => s.UserId == userId, ct);
        if (shop is null)
        {
            return null;
        }

        int ideasPerDay = configuration.GetValue("Recommendations:IdeasPerDay", 5);

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
            IdeasPerDay: ideasPerDay);

        RecommendationResult result = await provider.GenerateAsync(context, ct);

        DailyRecommendation row = new()
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            GeneratedAtUtc = DateTime.UtcNow,
            ContextSnapshotJson = result.ContextSnapshotJson,
            IdeasJson = JsonSerializer.Serialize(result.Ideas),
        };

        db.DailyRecommendations.Add(row);
        await db.SaveChangesAsync(ct);

        return row;
    }

    private static TodayResponse MapToResponse(DailyRecommendation row)
    {
        IReadOnlyList<IdeaDto> ideas = string.IsNullOrEmpty(row.IdeasJson)
            ? Array.Empty<IdeaDto>()
            : JsonSerializer.Deserialize<IdeaDto[]>(row.IdeasJson) ?? Array.Empty<IdeaDto>();

        return new TodayResponse(row.Id, row.GeneratedAtUtc, ideas);
    }

    private static string? GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
}

public record TodayResponse(
    Guid Id,
    DateTime GeneratedAtUtc,
    IReadOnlyList<IdeaDto> Ideas);
