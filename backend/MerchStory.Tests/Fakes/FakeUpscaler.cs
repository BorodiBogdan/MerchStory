using MerchStoryAPI.Print;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace MerchStory.Tests.Fakes;

// Stands in for RealEsrganUpscaler so tests don't need the Real-ESRGAN ONNX
// models loaded. Mirrors the production "no model -> Lanczos" intent: it just
// resizes the image by the requested factor with a plain Lanczos resample,
// which is enough for the print pipeline to produce a correctly sized PDF.
internal sealed class FakeUpscaler : IUpscaler
{
    public Task<byte[]> UpscaleAsync(byte[] imageBytes, int scaleFactor, CancellationToken ct = default)
    {
        if (scaleFactor <= 1)
        {
            return Task.FromResult(imageBytes);
        }

        using var image = Image.Load<Rgba32>(imageBytes);
        image.Mutate(ctx => ctx.Resize(
            image.Width * scaleFactor,
            image.Height * scaleFactor,
            KnownResamplers.Lanczos3));

        using var ms = new MemoryStream();
        image.Save(ms, new PngEncoder());
        return Task.FromResult(ms.ToArray());
    }
}
