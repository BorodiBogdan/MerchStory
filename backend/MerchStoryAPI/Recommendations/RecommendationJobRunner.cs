using System.Text.Json;
using MerchStoryAPI.Models;
using MerchStoryImageGeneration.Models.Recommendations;

namespace MerchStoryAPI.Recommendations;

// Glue between the singleton job registry and the scoped orchestrator. Each
// job runs in a fresh DI scope so EF Core's DbContext (scoped) isn't shared
// across the request thread and the background generation thread.
public class RecommendationJobRunner
{
    private readonly RecommendationJobRegistry registry;
    private readonly IServiceScopeFactory scopeFactory;
    private readonly ILogger<RecommendationJobRunner> logger;

    public RecommendationJobRunner(
        RecommendationJobRegistry registry,
        IServiceScopeFactory scopeFactory,
        ILogger<RecommendationJobRunner> logger)
    {
        this.registry = registry;
        this.scopeFactory = scopeFactory;
        this.logger = logger;
    }

    public Guid StartGeneration(string userId)
    {
        return this.registry.StartIfNotRunning(userId, async (jobId, ct) =>
        {
            using IServiceScope scope = this.scopeFactory.CreateScope();
            RecommendationOrchestrator orchestrator = scope.ServiceProvider.GetRequiredService<RecommendationOrchestrator>();

            DailyRecommendation? row = await orchestrator.GenerateAndPersistAsync(userId, ct);
            if (row is null)
            {
                this.registry.MarkFailed(jobId, "Shop profile required before generating recommendations.");
                return;
            }

            IdeaDto[] ideas = string.IsNullOrEmpty(row.IdeasJson)
                ? Array.Empty<IdeaDto>()
                : JsonSerializer.Deserialize<IdeaDto[]>(row.IdeasJson) ?? Array.Empty<IdeaDto>();

            this.registry.MarkReady(jobId, row.Id, row.GeneratedAtUtc, ideas);
            this.logger.LogInformation(
                "Recommendation job {JobId} ready in {ElapsedMs}ms with {IdeaCount} ideas",
                jobId,
                (int)(DateTime.UtcNow - row.GeneratedAtUtc).TotalMilliseconds,
                ideas.Length);
        });
    }
}
