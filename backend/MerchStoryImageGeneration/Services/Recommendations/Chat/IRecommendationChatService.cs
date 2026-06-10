namespace MerchStoryImageGeneration.Services.Recommendations.Chat;

// Which pipeline role is asking. Backends use this to pick per-role models
// and sampling settings: the Strategist plans (low temperature, longer
// output), the Writer creates copy (higher temperature, shorter output).
// The Translator stage reuses Writer settings.
public enum ChatRole
{
    Strategist,
    Writer,
}

// Chat-completion seam for the recommendation pipeline. LlmRecommendationProvider
// owns prompts + JSON parsing; implementations own the wire protocol, so the
// same Strategist/Writer/Translator pipeline can run against LM Studio,
// DeepSeek, or Claude purely via config (Recommendations:Llm:Backend).
//
// Mirrors the spirit of MerchStoryAPI's ILLMService, but lives in this library
// because the provider does (the API project references us, not vice versa),
// and recommendation calls need per-role settings that ILLMService doesn't model.
public interface IRecommendationChatService
{
    // Human-readable backend identity for logs + the diagnostic snapshot,
    // e.g. "lmstudio:qwen2.5-7b-instruct" or "claude:claude-opus-4-8".
    string Description { get; }

    // Sends a single self-contained prompt as one user message and returns the
    // raw assistant text. Throwing is fine — the provider/job runner handles
    // failures per stage.
    Task<string> CompleteAsync(string prompt, ChatRole role, CancellationToken ct);
}
