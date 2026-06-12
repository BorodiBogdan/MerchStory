namespace MerchStoryImageGeneration.Services;

// Picks an image provider per request. The default provider (Gemini, or the
// canned debug provider) backs everything; OpenAI is an opt-in alternative the
// catalog flow can request by name. Unknown / null model names fall back to the
// default, so callers never have to validate the value up front.
public interface IImageProviderResolver
{
    IImageProvider Resolve(string? model);
}

internal sealed class ImageProviderResolver : IImageProviderResolver
{
    private readonly IImageProvider defaultProvider;
    private readonly OpenAiImageProvider openAiProvider;

    public ImageProviderResolver(IImageProvider defaultProvider, OpenAiImageProvider openAiProvider)
    {
        this.defaultProvider = defaultProvider;
        this.openAiProvider = openAiProvider;
    }

    public IImageProvider Resolve(string? model) =>
        string.Equals(model, "openai", StringComparison.OrdinalIgnoreCase)
            ? this.openAiProvider
            : this.defaultProvider;
}
