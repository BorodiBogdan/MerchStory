using MerchStoryAPI.LlmServices;

namespace MerchStory.Tests.Fakes;

// Stands in for ClaudeLlmService so tests never reach the real Anthropic API.
// Defaults to approving composites ("YES"); the verdict is overridable per test,
// and every call is recorded so tests can assert how often the judge ran.
internal sealed class FakeLlmService : ILLMService
{
    private readonly List<(string Prompt, IReadOnlyList<string?>? Images)> calls = new();

    public FakeLlmService(string verdict = "YES")
    {
        this.Verdict = verdict;
    }

    public string Verdict { get; set; }

    public IReadOnlyList<(string Prompt, IReadOnlyList<string?>? Images)> Calls => this.calls;

    public Task<string> GenerateAsync(
        string prompt,
        IReadOnlyList<string?>? inlineImages = null,
        CancellationToken cancellationToken = default)
    {
        this.calls.Add((prompt, inlineImages));
        return Task.FromResult(this.Verdict);
    }
}
