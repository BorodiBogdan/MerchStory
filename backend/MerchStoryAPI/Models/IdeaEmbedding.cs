using Pgvector;

namespace MerchStoryAPI.Models;

// Per-user, per-idea embedding. Auto-populated when a DailyRecommendation
// row is persisted: each idea's Title+Body is embedded once and stored here.
//
// Used by Phase 5b's anti-repetition RAG — the Writer prompt is augmented
// with "DON'T REPEAT THESE THEMES" pulled from the user's last 30 days of
// generated ideas.
public class IdeaEmbedding
{
    public Guid Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public AppUser User { get; set; } = null!;

    // The DailyRecommendation row this idea belongs to.
    public Guid DailyRecommendationId { get; set; }

    // The idea's identifier inside DailyRecommendation.IdeasJson.
    public string IdeaId { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Body { get; set; } = string.Empty;

    public DateTime GeneratedAtUtc { get; set; }

    public Vector Embedding { get; set; } = null!;
}
