using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Drawing.Processing;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace MerchStory.Tests.Fakes;

internal static class TestCanvas
{
    public static byte[] CanvasWithOutlines(
        int width,
        int height,
        Rgba32 background,
        IReadOnlyList<(Rectangle Area, string OutlineHex)> outlinedAreas)
    {
        using var image = new Image<Rgba32>(width, height, background);

        image.Mutate(ctx =>
        {
            foreach (var (area, outlineHex) in outlinedAreas)
            {
                // A "hallucinated product" fill inside the outlined area.
                var innerInset = Rectangle.Inflate(area, -20, -20);
                if (innerInset.Width > 0 && innerInset.Height > 0)
                {
                    ctx.Fill(Color.FromRgb(90, 90, 90), new RectangleF(innerInset.X, innerInset.Y, innerInset.Width, innerInset.Height));
                }

                // Draw a 4-px thick magenta rectangle outline (top, bottom, left, right).
                var color = Color.ParseHex(outlineHex.TrimStart('#'));
                ctx.Fill(color, new RectangleF(area.X, area.Y, area.Width, 4));
                ctx.Fill(color, new RectangleF(area.X, area.Y + area.Height - 4, area.Width, 4));
                ctx.Fill(color, new RectangleF(area.X, area.Y, 4, area.Height));
                ctx.Fill(color, new RectangleF(area.X + area.Width - 4, area.Y, 4, area.Height));
            }
        });

        using var ms = new MemoryStream();
        image.Save(ms, new PngEncoder());
        return ms.ToArray();
    }

    public static byte[] CanvasWithSolidFills(
        int width,
        int height,
        Rgba32 background,
        IReadOnlyList<(Rectangle Area, string FillHex)> filledAreas)
    {
        using var image = new Image<Rgba32>(width, height, background);

        image.Mutate(ctx =>
        {
            foreach (var (area, fillHex) in filledAreas)
            {
                var color = Color.ParseHex(fillHex.TrimStart('#'));
                ctx.Fill(color, new RectangleF(area.X, area.Y, area.Width, area.Height));
            }
        });

        using var ms = new MemoryStream();
        image.Save(ms, new PngEncoder());
        return ms.ToArray();
    }

    public static byte[] SolidCanvas(int width, int height, Rgba32 color)
    {
        using var image = new Image<Rgba32>(width, height, color);
        using var ms = new MemoryStream();
        image.Save(ms, new PngEncoder());
        return ms.ToArray();
    }

    public static byte[] SolidProductPng(int width, int height, Rgba32 color)
    {
        using var image = new Image<Rgba32>(width, height, color);
        using var ms = new MemoryStream();
        image.Save(ms, new PngEncoder());
        return ms.ToArray();
    }
}
