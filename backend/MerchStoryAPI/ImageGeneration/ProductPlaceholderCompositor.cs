using System.Globalization;
using MerchStoryImageGeneration.Models;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;

namespace MerchStoryAPI.ImageGeneration;

internal enum FallbackReason
{
    PartialPreserve,
    ExtraRegionsDiscarded,
    NoRegions,
}

internal sealed record CompositeResult(
    ImageGenerationResult Image,
    int DetectedRegions,
    int ExpectedRegions,
    IReadOnlyList<string> MissingProductNames,
    FallbackReason? FallbackReason,
    IReadOnlyList<ColorDiagnostic>? Diagnostics = null,
    int FinalMarkerPixelCount = 0,
    int GlobalStragglersReplaced = 0);

internal sealed record ColorDiagnostic(
    string ProductName,
    string MarkerHex,
    int TightPixelCount,
    int LoosePixelCount,
    int ComponentCount,
    int ComponentsPassedShape,
    bool Detected,
    string? RejectReason);

internal static class ProductPlaceholderCompositor
{
    // Chebyshev RGB distance: how far a pixel can be from a marker target colour
    // and still count as part of the outline. Wide enough to capture the 1–3 px
    // anti-aliased halo Gemini renders around each stroke.
    private const int MaxColorDistance = 80;

    // How many pixels to grow the detected band on every side of the outline.
    // Symmetric because we don't distinguish inside-of-product from outside-of-scene.
    private const int OutlineInsetPx = 2;

    // Placeholder fill for detected pixels — purely a visualization so the next
    // pass of work can replace this with real per-product handling.
    private static readonly Rgba32 DetectedFill = new(0, 255, 0, 255);

    public static CompositeResult Composite(
        byte[] imageBytes,
        IReadOnlyList<CatalogProductItem> products,
        IReadOnlyList<ProductMarkerAssignment> markerAssignments)
    {
        using var canvas = Image.Load<Rgba32>(imageBytes);
        int width = canvas.Width;
        int height = canvas.Height;

        Rgba32[] targets = [.. markerAssignments.Select(a => HexToRgb(a.MarkerHex))];
        int[] perProductCounts = new int[targets.Length];

        // Pass 1: detect — fill matched[y,x] with the matching product index, or -1.
        int[,] matched = new int[height, width];
        canvas.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < accessor.Height; y++)
            {
                Span<Rgba32> row = accessor.GetRowSpan(y);
                for (int x = 0; x < row.Length; x++)
                {
                    matched[y, x] = NearestTarget(row[x], targets);
                }
            }
        });

        // Pass 2: thicken the detected band by OutlineInsetPx pixels in every direction.
        int[,] thickened = Thicken(matched, height, width, OutlineInsetPx);

        // Pass 3: paint thickened pixels and tally per-product counts.
        canvas.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < accessor.Height; y++)
            {
                Span<Rgba32> row = accessor.GetRowSpan(y);
                for (int x = 0; x < row.Length; x++)
                {
                    int idx = thickened[y, x];
                    if (idx >= 0)
                    {
                        perProductCounts[idx]++;
                        row[x] = DetectedFill;
                    }
                }
            }
        });

        var diagnostics = new List<ColorDiagnostic>(products.Count);
        for (int i = 0; i < products.Count; i++)
        {
            int count = i < perProductCounts.Length ? perProductCounts[i] : 0;
            diagnostics.Add(new ColorDiagnostic(
                ProductName: products[i].Name,
                MarkerHex: i < markerAssignments.Count ? markerAssignments[i].MarkerHex : "n/a",
                TightPixelCount: count,
                LoosePixelCount: count,
                ComponentCount: 0,
                ComponentsPassedShape: 0,
                Detected: count > 0,
                RejectReason: count > 0 ? null : "no pixels matched marker"));
        }

        using var ms = new MemoryStream();
        canvas.Save(ms, new PngEncoder());

        return new CompositeResult(
            Image: new ImageGenerationResult(ms.ToArray(), "image/png"),
            DetectedRegions: products.Count,
            ExpectedRegions: products.Count,
            MissingProductNames: [],
            FallbackReason: null,
            Diagnostics: diagnostics,
            FinalMarkerPixelCount: perProductCounts.Sum());
    }

    // Grows the detected band by `inset` pixels in every direction. For each
    // pixel that wasn't matched in pass 1, look at its (2*inset+1)² neighbourhood;
    // if any neighbour was matched, copy the closest one's product index. The
    // result is the original mask plus a uniform halo of `inset` extra pixels
    // around every side of the outline.
    private static int[,] Thicken(int[,] matched, int height, int width, int inset)
    {
        if (inset <= 0)
        {
            return matched;
        }

        int[,] result = new int[height, width];
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                if (matched[y, x] >= 0)
                {
                    result[y, x] = matched[y, x];
                    continue;
                }

                int bestIdx = -1;
                int bestD = inset + 1;
                int yMin = Math.Max(0, y - inset);
                int yMax = Math.Min(height - 1, y + inset);
                int xMin = Math.Max(0, x - inset);
                int xMax = Math.Min(width - 1, x + inset);
                for (int ny = yMin; ny <= yMax; ny++)
                {
                    for (int nx = xMin; nx <= xMax; nx++)
                    {
                        int neighbour = matched[ny, nx];
                        if (neighbour < 0)
                        {
                            continue;
                        }

                        int d = Math.Max(Math.Abs(ny - y), Math.Abs(nx - x));
                        if (d < bestD)
                        {
                            bestD = d;
                            bestIdx = neighbour;
                        }
                    }
                }

                result[y, x] = bestIdx;
            }
        }

        return result;
    }

    // Returns the index of the closest target colour within MaxColorDistance, or -1
    // if none match. Chebyshev distance (max of channel deltas) — cheap and matches
    // the convention used elsewhere in this project.
    private static int NearestTarget(Rgba32 p, Rgba32[] targets)
    {
        int bestIdx = -1;
        int bestDist = MaxColorDistance + 1;
        for (int i = 0; i < targets.Length; i++)
        {
            Rgba32 t = targets[i];
            int d = Math.Max(Math.Abs(p.R - t.R), Math.Max(Math.Abs(p.G - t.G), Math.Abs(p.B - t.B)));
            if (d < bestDist)
            {
                bestDist = d;
                bestIdx = i;
            }
        }

        return bestIdx;
    }

    private static Rgba32 HexToRgb(string hex)
    {
        hex = hex.TrimStart('#');
        byte r = byte.Parse(hex[0..2], NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        byte g = byte.Parse(hex[2..4], NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        byte b = byte.Parse(hex[4..6], NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        return new Rgba32(r, g, b, 255);
    }
}
