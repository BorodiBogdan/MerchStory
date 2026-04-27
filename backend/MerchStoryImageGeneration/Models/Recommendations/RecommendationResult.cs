namespace MerchStoryImageGeneration.Models.Recommendations;

// Provider output. ContextSnapshotJson is a free-form diagnostic blob persisted
// alongside the run — useful for "why did I get this idea today" debugging
// without having to re-execute the pipeline. DegradedSignals lists external
// providers that failed (Phase 2+); empty in Phase 1.
public record RecommendationResult(
    IReadOnlyList<IdeaDto> Ideas,
    string ContextSnapshotJson,
    IReadOnlyList<string> DegradedSignals);
