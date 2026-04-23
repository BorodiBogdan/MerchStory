namespace MerchStoryAPI.ReferenceImages;

public sealed class ClipServiceUnavailableException : Exception
{
    public ClipServiceUnavailableException()
        : base("Image search service is currently unavailable. Please try again later.")
    {
    }
}
