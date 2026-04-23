using MerchStoryImageGeneration.Models;
using MerchStoryImageGeneration.Services;

namespace MerchStory.Tests.Fakes;

internal sealed class ConfigurableMockImageProvider : IImageProvider
{
    private readonly Func<string, IReadOnlyList<string?>?, ImageGenerationResult> responder;

    public ConfigurableMockImageProvider(Func<string, IReadOnlyList<string?>?, ImageGenerationResult> responder)
    {
        this.responder = responder;
        this.Calls = new List<RecordedCall>();
    }

    public List<RecordedCall> Calls { get; }

    public Task<ImageGenerationResult> GenerateAsync(
        string prompt,
        IReadOnlyList<string?>? inlineImages = null,
        CancellationToken cancellationToken = default)
    {
        this.Calls.Add(new RecordedCall(prompt, inlineImages?.Count ?? 0));
        return Task.FromResult(this.responder(prompt, inlineImages));
    }
}

internal sealed record RecordedCall(string Prompt, int InlineImageCount);
