using System.Text.Json;
using MerchStoryAPI.ImageGeneration;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;

namespace MerchStory.Tests.Fakes;

// Stands in for a running IOPaint (LaMa) server. CompositeAsync takes a concrete,
// sealed IOPaintClient, so we can't subclass it; instead we hand it an HttpClient
// backed by a fake handler that intercepts the inpaint POST and locally simulates
// LaMa: every pixel the mask paints white (the region to rewrite) is replaced with
// a neutral background, which is enough to erase the detected marker outlines so
// the paste-and-no-loose-marker assertions hold without a real model.
internal static class FakeInpaint
{
    public static IOPaintClient Client(Rgba32? background = null)
    {
        var handler = new EraseMaskedRegionHandler(background ?? new Rgba32(128, 128, 128, 255));
        var http = new HttpClient(handler);
        var config = new ConfigurationBuilder().Build();
        return new IOPaintClient(http, config, NullLogger<IOPaintClient>.Instance);
    }

    private sealed class EraseMaskedRegionHandler : HttpMessageHandler
    {
        private readonly Rgba32 background;

        public EraseMaskedRegionHandler(Rgba32 background)
        {
            this.background = background;
        }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            string json = await request.Content!.ReadAsStringAsync(cancellationToken);
            using JsonDocument doc = JsonDocument.Parse(json);

            byte[] imageBytes = DecodeDataUrl(doc.RootElement.GetProperty("image").GetString()!);
            byte[] maskBytes = DecodeDataUrl(doc.RootElement.GetProperty("mask").GetString()!);

            using var image = Image.Load<Rgba32>(imageBytes);
            using var mask = Image.Load<Rgba32>(maskBytes);

            Rgba32 bg = this.background;
            image.ProcessPixelRows(mask, (imageRows, maskRows) =>
            {
                for (int y = 0; y < imageRows.Height; y++)
                {
                    Span<Rgba32> imgRow = imageRows.GetRowSpan(y);
                    Span<Rgba32> maskRow = maskRows.GetRowSpan(y);
                    for (int x = 0; x < imgRow.Length; x++)
                    {
                        // White mask pixels mark the region LaMa would rewrite.
                        if (maskRow[x].R > 127)
                        {
                            imgRow[x] = bg;
                        }
                    }
                }
            });

            using var ms = new MemoryStream();
            image.Save(ms, new PngEncoder());

            return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(ms.ToArray()),
            };
        }

        private static byte[] DecodeDataUrl(string dataUrl)
        {
            int comma = dataUrl.IndexOf(',', StringComparison.Ordinal);
            string payload = comma >= 0 ? dataUrl[(comma + 1)..] : dataUrl;
            return Convert.FromBase64String(payload);
        }
    }
}
