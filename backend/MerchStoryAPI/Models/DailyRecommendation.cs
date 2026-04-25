namespace MerchStoryAPI.Models;

public class DailyRecommendation
{
    public Guid Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public AppUser User { get; set; } = null!;

    public DateTime GeneratedAtUtc { get; set; }

    // Diagnostic snapshot of the inputs used to produce IdeasJson — context signals,
    // degraded providers, RAG hits in later phases. Useful for debugging "why did
    // I get this idea today" without re-running the pipeline.
    public string ContextSnapshotJson { get; set; } = "{}";

    public string IdeasJson { get; set; } = "[]";
}
