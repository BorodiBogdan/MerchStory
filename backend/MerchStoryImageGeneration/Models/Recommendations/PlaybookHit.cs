namespace MerchStoryImageGeneration.Models.Recommendations;

// Top-K retrieved PromoPlaybook entry, projected for prompt injection. We don't
// pass embeddings or IDs to the LLM — just the semantic content.
public record PlaybookHit(
    string Theme,
    string TriggerType,
    string Trigger,
    string Tactics,
    string ExampleCopy);
