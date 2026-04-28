namespace MerchStoryAPI.Print;

public interface IUpscaler
{
    Task<byte[]> UpscaleAsync(byte[] imageBytes, int scaleFactor, CancellationToken ct = default);
}
