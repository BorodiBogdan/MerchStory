using Pgvector;

namespace MerchStoryAPI.Models;

// Curated knowledge base of reusable promo recipes the Strategist retrieves
// from at generation time. Each entry encodes a known-good pattern (theme +
// trigger condition + tactics + example copy) and is embedded for cosine
// similarity search.
//
// Per-domain split: BusinessDomain matches ShopProfile.BusinessDomain values
// ("Market", "Food", "Retail", "Fashion"). v1 ships only the Market entries;
// other domains are scaffolded but empty. The Strategist prompt skips RAG
// gracefully when no entries exist for the user's domain.
public class PromoPlaybookEntry
{
    public Guid Id { get; set; }

    public string BusinessDomain { get; set; } = string.Empty;

    public string Theme { get; set; } = string.Empty;

    // weather | holiday | news | seasonal
    public string TriggerType { get; set; } = string.Empty;

    public string Trigger { get; set; } = string.Empty;

    public string Tactics { get; set; } = string.Empty;

    public string ExampleCopy { get; set; } = string.Empty;

    // Embedding of "Theme + Trigger + Tactics" via the configured embedding
    // model. Dimension is pinned in config; mismatch on startup is a hard fail.
    //
    // Language: entries are stored in English (the Strategist receives the
    // user's GenerationLanguage and writes its output in that language; the
    // playbook is a domain-knowledge source, not a translation table).
    public Vector Embedding { get; set; } = null!;

    public DateTime CreatedAt { get; set; }
}
