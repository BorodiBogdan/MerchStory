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

internal enum OutwardDirection
{
    Up,
    Down,
    Left,
    Right,
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
    private const int OutlineInsetPx = 4;

    // After the directional walk exits the thickened band, require this many
    // consecutive "clean" pixels (outside-band AND non-marker-color) before
    // sampling. Pushes the sample further from the outline so we don't pick
    // pixels that are technically outside the band but still belong to the
    // product interior (e.g. corner cases where direction inference is off).
    private const int SceneSamplingMargin = 2;

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

        // Snapshot the canvas into a managed buffer so the inpaint pass can do
        // arbitrary random-access reads without going through ImageSharp's accessor.
        Rgba32[,] pixels = new Rgba32[height, width];
        canvas.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < height; y++)
            {
                Span<Rgba32> row = accessor.GetRowSpan(y);
                for (int x = 0; x < width; x++)
                {
                    pixels[y, x] = row[x];
                }
            }
        });

        // Pass 1: detect — fill matched[y,x] with the matching product index, or -1.
        int[,] matched = new int[height, width];
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                matched[y, x] = NearestTarget(pixels[y, x], targets);
            }
        }

        // Pass 2: thicken the detected band by OutlineInsetPx pixels in every direction.
        int[,] thickened = Thicken(matched, height, width, OutlineInsetPx);

        // Pass 3: per-product centroids — used to decide which side of each
        // outline pixel is "outside the product" (i.e. where the scene lives).
        (int X, int Y)[] centroids = ComputeCentroids(matched, targets.Length, height, width);

        // Pass 4: for every thickened pixel, walk outward (away from its product's
        // centroid) until we hit a non-outline pixel, then copy that scene colour
        // into the outline pixel. Updates pixels[,] in place — safe because we only
        // write to outline pixels and only read from non-outline pixels.
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int idx = thickened[y, x];
                if (idx < 0)
                {
                    continue;
                }

                perProductCounts[idx]++;

                OutwardDirection dir = DominantOutwardDirection(
                    x, y, centroids[idx].X, centroids[idx].Y);
                if (TrySampleScene(pixels, thickened, targets, x, y, idx, dir, width, height, out Rgba32 sample))
                {
                    pixels[y, x] = sample;
                }
            }
        }

        // Write the modified outline pixels back onto the canvas.
        canvas.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < height; y++)
            {
                Span<Rgba32> row = accessor.GetRowSpan(y);
                for (int x = 0; x < width; x++)
                {
                    if (thickened[y, x] >= 0)
                    {
                        row[x] = pixels[y, x];
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

    // Per-product centroid (sum of x,y coords / count) computed from the matched
    // mask. Used to decide which side of each outline pixel faces the scene.
    private static (int X, int Y)[] ComputeCentroids(
        int[,] matched, int productCount, int height, int width)
    {
        long[] sumX = new long[productCount];
        long[] sumY = new long[productCount];
        int[] counts = new int[productCount];

        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int idx = matched[y, x];
                if (idx >= 0 && idx < productCount)
                {
                    sumX[idx] += x;
                    sumY[idx] += y;
                    counts[idx]++;
                }
            }
        }

        var result = new (int X, int Y)[productCount];
        for (int i = 0; i < productCount; i++)
        {
            result[i] = counts[i] > 0
                ? ((int)(sumX[i] / counts[i]), (int)(sumY[i] / counts[i]))
                : (width / 2, height / 2);
        }

        return result;
    }

    // Picks the dominant axis between (x,y) and the product centroid: vertical when
    // the y-delta is larger, horizontal otherwise. The sign of the delta then
    // chooses Up vs Down or Left vs Right.
    private static OutwardDirection DominantOutwardDirection(
        int x, int y, int centroidX, int centroidY)
    {
        int dx = x - centroidX;
        int dy = y - centroidY;
        if (Math.Abs(dy) > Math.Abs(dx))
        {
            return dy < 0 ? OutwardDirection.Up : OutwardDirection.Down;
        }

        return dx < 0 ? OutwardDirection.Left : OutwardDirection.Right;
    }

    // Tries the dominant direction first; if that fails, falls back to the other
    // three. A pixel only qualifies as the SAMPLE if all four hold:
    //   1. It's outside the thickened outline band (thickened[y,x] < 0).
    //   2. Its colour isn't close to any marker target — guards against halo
    //      pixels that escaped detection (e.g. anti-alias bleed beyond the
    //      Chebyshev-80 threshold) and would otherwise look outline-tinted.
    //   3. It's at least SceneSamplingMargin consecutive clean pixels past the
    //      band, so we don't land on a single-pixel "hole" in the band.
    //   4. Sandwich check: continuing past the candidate in the same direction
    //      does NOT re-hit this product's own outline. If it would, we're
    //      inside the product (the walker headed inward because the dominant-
    //      direction heuristic was wrong for this pixel) — reject and keep
    //      walking, or fall back to a different direction.
    private static bool TrySampleScene(
        Rgba32[,] pixels,
        int[,] thickened,
        Rgba32[] targets,
        int startX,
        int startY,
        int productIdx,
        OutwardDirection primary,
        int width,
        int height,
        out Rgba32 result)
    {
        if (TryWalkInDirection(pixels, thickened, targets, startX, startY, productIdx, primary, width, height, out result))
        {
            return true;
        }

        foreach (OutwardDirection fallback in new[]
        {
            OutwardDirection.Up,
            OutwardDirection.Down,
            OutwardDirection.Left,
            OutwardDirection.Right,
        })
        {
            if (fallback == primary)
            {
                continue;
            }

            if (TryWalkInDirection(pixels, thickened, targets, startX, startY, productIdx, fallback, width, height, out result))
            {
                return true;
            }
        }

        result = default;
        return false;
    }

    private static bool TryWalkInDirection(
        Rgba32[,] pixels,
        int[,] thickened,
        Rgba32[] targets,
        int startX,
        int startY,
        int productIdx,
        OutwardDirection direction,
        int width,
        int height,
        out Rgba32 result)
    {
        (int dx, int dy) = direction switch
        {
            OutwardDirection.Up => (0, -1),
            OutwardDirection.Down => (0, 1),
            OutwardDirection.Left => (-1, 0),
            OutwardDirection.Right => (1, 0),
            _ => (0, 0),
        };

        int x = startX + dx;
        int y = startY + dy;
        int contiguousClean = 0;
        while (x >= 0 && x < width && y >= 0 && y < height)
        {
            bool clean = thickened[y, x] < 0 && NearestTarget(pixels[y, x], targets) < 0;
            if (clean)
            {
                contiguousClean++;
                if (contiguousClean >= SceneSamplingMargin
                    && !HitsOwnOutlineAhead(thickened, x, y, dx, dy, productIdx, width, height))
                {
                    result = pixels[y, x];
                    return true;
                }
            }
            else
            {
                contiguousClean = 0;
            }

            x += dx;
            y += dy;
        }

        result = default;
        return false;
    }

    // Sandwich check: from (startX, startY), keep walking in (dx, dy). If we
    // re-encounter THIS product's thickened outline before exiting the canvas,
    // the candidate point was sandwiched between two outline edges of the same
    // product, i.e. inside the product — return true to reject.
    private static bool HitsOwnOutlineAhead(
        int[,] thickened,
        int startX,
        int startY,
        int dx,
        int dy,
        int productIdx,
        int width,
        int height)
    {
        int x = startX + dx;
        int y = startY + dy;
        while (x >= 0 && x < width && y >= 0 && y < height)
        {
            if (thickened[y, x] == productIdx)
            {
                return true;
            }

            x += dx;
            y += dy;
        }

        return false;
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
