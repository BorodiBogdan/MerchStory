using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace MerchStoryAPI.Print;

// Lanczos resampling is the highest-quality non-AI upscale ImageSharp ships.
// Sharper than bilinear/bicubic and instant (no model load). Good enough as the
// premium-tier baseline; swap in a Real-ESRGAN ncnn-vulkan implementation behind
// IUpscaler when the binary infra is ready.
public sealed class LanczosUpscaler : IUpscaler
{
    public Task<byte[]> UpscaleAsync(byte[] imageBytes, int scaleFactor, CancellationToken ct = default)
    {
        if (scaleFactor < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(scaleFactor), "Scale factor must be >= 1.");
        }

        if (scaleFactor == 1)
        {
            return Task.FromResult(imageBytes);
        }

        using Image<Rgba32> image = Image.Load<Rgba32>(imageBytes);
        int newW = image.Width * scaleFactor;
        int newH = image.Height * scaleFactor;

        image.Mutate(ctx => ctx.Resize(new ResizeOptions
        {
            Size = new Size(newW, newH),
            Sampler = KnownResamplers.Lanczos3,
        }));

        using var ms = new MemoryStream();
        image.Save(ms, new PngEncoder());
        return Task.FromResult(ms.ToArray());
    }
}
