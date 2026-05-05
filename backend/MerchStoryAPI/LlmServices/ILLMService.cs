namespace MerchStoryAPI.LlmServices;

public interface ILLMService
{
    Task<string> GenerateAsync(
        string prompt,
        IReadOnlyList<string?>? inlineImages = null,
        CancellationToken cancellationToken = default);
}
