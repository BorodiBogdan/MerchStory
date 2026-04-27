namespace MerchStoryImageGeneration.Models.Recommendations;

// One generated promo idea. Tone drives the icon and source-pill copy on the
// frontend; the backend stays presentation-agnostic.
//
// Tone vocabulary (lowercase strings, must match frontend mapping):
//   "weather" | "holiday" | "news" | "trend"
//
// Title/Meta/Body/SuggestedPost hold the canonical English text the LLM
// pipeline produces. Translations is keyed by ISO-639-1 lang code (e.g. "ro")
// and supplies localized variants for each user-visible field. Read-time
// projection in the route handler picks the right variant based on the shop's
// GenerationLanguage; if a translation is missing for the requested language,
// the route falls back to the English base fields.
public record IdeaDto(
    string Id,
    string Tone,
    string Title,
    string Meta,
    string Body,
    string SuggestedPost,
    Dictionary<string, IdeaTranslation>? Translations = null);

public record IdeaTranslation(
    string Title,
    string Meta,
    string Body,
    string SuggestedPost);
