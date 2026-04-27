namespace MerchStoryAPI.Models;

// Per-idea user-interaction event. The dataset built up here is the future
// fine-tuning corpus: thumbs_up / thumbs_down / generated_from are positive
// and negative labels for what the user actually wants. Dismissed and viewed
// are weaker signals captured for completeness.
//
// Action vocabulary (lowercase strings):
//   viewed         — card came into view (passive; not collected by default in v1)
//   thumbs_up      — user explicitly liked the idea
//   thumbs_down    — user explicitly disliked the idea
//   dismissed      — user closed/swiped away the card
//   generated_from — user tapped the idea to start a generation flow
public class IdeaInteraction
{
    public Guid Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public AppUser User { get; set; } = null!;

    public Guid DailyRecommendationId { get; set; }

    public string IdeaId { get; set; } = string.Empty;

    public string Action { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }
}
