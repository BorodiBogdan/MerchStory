namespace MerchStoryAPI.Print;

// Raised when the AI upscaler can't service a request (model file missing,
// ONNX session failed to load, etc). PrintRoutes surfaces this as a render
// failure and refunds the premium credit charge.
public sealed class UpscalerUnavailableException : Exception
{
    public UpscalerUnavailableException(string message)
        : base(message)
    {
    }
}
