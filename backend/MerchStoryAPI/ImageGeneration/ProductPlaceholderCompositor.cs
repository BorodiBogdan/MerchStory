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

    // How many pixels to grow the detected band on every side of the outline
    // before sending it to the inpainter. A bit of margin guarantees LaMa sees
    // the entire outline + halo as part of the mask.
    private const int OutlineInsetPx = 4;

    // Sends the Gemini-rendered image and a binary mask of the detected outlines
    // to IOPaint (LaMa). Returns the cleaned image with the outlines erased.
    public static async Task<CompositeResult> CompositeAsync(
        byte[] imageBytes,
        IReadOnlyList<CatalogProductItem> products,
        IReadOnlyList<ProductMarkerAssignment> markerAssignments,
        IOPaintClient inpaintClient,
        CancellationToken cancellationToken = default)
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
            for (int y = 0; y < height; y++)
            {
                Span<Rgba32> row = accessor.GetRowSpan(y);
                for (int x = 0; x < width; x++)
                {
                    matched[y, x] = NearestTarget(row[x], targets);
                }
            }
        });

        // Pass 2: thicken so LaMa receives the full outline + halo as one mask region.
        int[,] thickened = Thicken(matched, height, width, OutlineInsetPx);

        // Tally per-product pixel counts so the existing logger output stays useful.
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int idx = thickened[y, x];
                if (idx >= 0 && idx < perProductCounts.Length)
                {
                    perProductCounts[idx]++;
                }
            }
        }

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

        int totalMaskPixels = perProductCounts.Sum();
        if (totalMaskPixels == 0)
        {
            // Nothing detected — return the raw input. The route's NoRegions
            // branch logs a warning and surfaces the diagnostic image.
            return new CompositeResult(
                Image: new ImageGenerationResult(imageBytes, "image/png"),
                DetectedRegions: 0,
                ExpectedRegions: products.Count,
                MissingProductNames: [.. products.Select(p => p.Name)],
                FallbackReason: FallbackReason.NoRegions,
                Diagnostics: diagnostics);
        }

        byte[] maskPng = EncodeMaskPng(thickened, width, height);
        byte[] cleaned = await inpaintClient.InpaintAsync(imageBytes, maskPng, cancellationToken);

        return new CompositeResult(
            Image: new ImageGenerationResult(cleaned, "image/png"),
            DetectedRegions: products.Count,
            ExpectedRegions: products.Count,
            MissingProductNames: [],
            FallbackReason: null,
            Diagnostics: diagnostics,
            FinalMarkerPixelCount: totalMaskPixels);
    }

    // Builds the PNG IOPaint expects: white where we want the outline erased,
    // black everywhere else. Same dimensions as the source image.
    private static byte[] EncodeMaskPng(int[,] thickened, int width, int height)
    {
        var white = new Rgba32(255, 255, 255, 255);
        var black = new Rgba32(0, 0, 0, 255);

        using var mask = new Image<Rgba32>(width, height, black);
        mask.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < height; y++)
            {
                Span<Rgba32> row = accessor.GetRowSpan(y);
                for (int x = 0; x < width; x++)
                {
                    if (thickened[y, x] >= 0)
                    {
                        row[x] = white;
                    }
                }
            }
        });

        using var ms = new MemoryStream();
        mask.Save(ms, new PngEncoder());
        return ms.ToArray();
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
