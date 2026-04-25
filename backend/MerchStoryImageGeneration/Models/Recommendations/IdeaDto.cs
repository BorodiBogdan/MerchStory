namespace MerchStoryImageGeneration.Models.Recommendations;

// One generated promo idea. Tone drives the icon and source-pill copy on the
// frontend; the backend stays presentation-agnostic.
//
// Tone vocabulary (lowercase strings, must match frontend mapping):
//   "weather" | "holiday" | "news" | "trend"
public record IdeaDto(
    string Id,
    string Tone,
    string Title,
    string Meta,
    string Body,
    string SuggestedPost);
