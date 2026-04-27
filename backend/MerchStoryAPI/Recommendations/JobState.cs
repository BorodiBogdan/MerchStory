using MerchStoryImageGeneration.Models.Recommendations;

namespace MerchStoryAPI.Recommendations;

public enum JobState
{
    Generating,
    Ready,
    Failed,
}

public class JobEntry
{
    public Guid JobId { get; init; }

    public string UserId { get; init; } = string.Empty;

    public JobState State { get; set; }

    public Guid? RecommendationId { get; set; }

    public DateTime? GeneratedAtUtc { get; set; }

    public IReadOnlyList<IdeaDto>? Ideas { get; set; }

    public string? Error { get; set; }

    public DateTime CreatedAt { get; init; }
}
