using System.Collections.Concurrent;

namespace MerchStoryAPI.Recommendations;

// Singleton in-memory job tracker. Backend restart drops in-flight jobs —
// acceptable for v1; production would persist JobState in a row.
//
// Per-user dedup: if a user already has an active job (state=Generating, age
// under StaleAfter), we return that jobId rather than spawning a parallel one.
// Stale entries (>StaleAfter old, still Generating) are treated as orphaned
// and a new job replaces them.
public class RecommendationJobRegistry
{
    private static readonly TimeSpan StaleAfter = TimeSpan.FromMinutes(5);

    private readonly ConcurrentDictionary<Guid, JobEntry> jobs = new();
    private readonly ConcurrentDictionary<string, Guid> userActiveJob = new();
    private readonly ILogger<RecommendationJobRegistry> logger;

    public RecommendationJobRegistry(ILogger<RecommendationJobRegistry> logger)
    {
        this.logger = logger;
    }

    public Guid StartIfNotRunning(string userId, Func<Guid, CancellationToken, Task> work)
    {
        if (this.userActiveJob.TryGetValue(userId, out Guid existingJobId)
            && this.jobs.TryGetValue(existingJobId, out JobEntry? existing)
            && existing.State == JobState.Generating
            && DateTime.UtcNow - existing.CreatedAt < StaleAfter)
        {
            this.logger.LogInformation(
                "[Job] dedup user={UserId} → returning in-flight {JobId} (started {AgeMs}ms ago)",
                userId,
                existingJobId,
                (int)(DateTime.UtcNow - existing.CreatedAt).TotalMilliseconds);
            return existingJobId;
        }

        Guid jobId = Guid.NewGuid();
        JobEntry entry = new()
        {
            JobId = jobId,
            UserId = userId,
            State = JobState.Generating,
            CreatedAt = DateTime.UtcNow,
        };
        this.jobs[jobId] = entry;
        this.userActiveJob[userId] = jobId;

        // Fire-and-forget. Background work uses a fresh CancellationToken because
        // the request's CT fires when the response stream closes.
        _ = Task.Run(async () =>
        {
            try
            {
                await work(jobId, CancellationToken.None);
            }
            catch (Exception ex)
            {
                this.logger.LogError(ex, "Recommendation job {JobId} failed", jobId);
                this.MarkFailed(jobId, ex.Message);
            }
            finally
            {
                this.userActiveJob.TryRemove(new KeyValuePair<string, Guid>(userId, jobId));
            }
        });

        return jobId;
    }

    public void MarkReady(Guid jobId, Guid recommendationId, DateTime generatedAt, IReadOnlyList<MerchStoryImageGeneration.Models.Recommendations.IdeaDto> ideas)
    {
        if (this.jobs.TryGetValue(jobId, out JobEntry? entry))
        {
            entry.State = JobState.Ready;
            entry.RecommendationId = recommendationId;
            entry.GeneratedAtUtc = generatedAt;
            entry.Ideas = ideas;
        }
    }

    public void MarkFailed(Guid jobId, string error)
    {
        if (this.jobs.TryGetValue(jobId, out JobEntry? entry))
        {
            entry.State = JobState.Failed;
            entry.Error = error;
        }
    }

    public JobEntry? Get(Guid jobId)
        => this.jobs.TryGetValue(jobId, out JobEntry? entry) ? entry : null;
}
