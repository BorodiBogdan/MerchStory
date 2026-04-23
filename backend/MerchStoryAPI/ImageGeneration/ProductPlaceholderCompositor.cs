using MerchStoryImageGeneration.Models;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Drawing.Processing;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace MerchStoryAPI.ImageGeneration;

internal enum FallbackReason
{
    PartialPreserve,
    ExtraRegionsDiscarded,
    NoRegions,
}

internal readonly record struct ColorThreshold(
    int RMin, int RMax,
    int GMin, int GMax,
    int BMin, int BMax)
{
    public bool Matches(Rgba32 p)
        => p.R >= this.RMin && p.R <= this.RMax
        && p.G >= this.GMin && p.G <= this.GMax
        && p.B >= this.BMin && p.B <= this.BMax;
}

internal sealed record CompositeResult(
    ImageGenerationResult Image,
    int DetectedRegions,
    int ExpectedRegions,
    IReadOnlyList<string> MissingProductNames,
    FallbackReason? FallbackReason,
    IReadOnlyList<ColorDiagnostic>? Diagnostics = null);

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
    private const double MinAreaFraction = 0.002;
    private const int MinAreaFloor = 400;
    private const double MaxAspectRatio = 20.0;
    private const int EdgeStripWidth = 5;
    private const double EdgeCoverageThreshold = 0.70;
    private const int BgSampleStripWidth = 12;
    private const int CleanupExpansion = 14;
    private const int FillDilation = 4;

    public static CompositeResult Composite(
        byte[] imageBytes,
        IReadOnlyList<CatalogProductItem> products,
        IReadOnlyList<ProductMarkerAssignment> markerAssignments)
    {
        if (products.Count != markerAssignments.Count)
        {
            throw new ArgumentException(
                "Products and markerAssignments must have the same count.",
                nameof(markerAssignments));
        }

        using var canvas = Image.Load<Rgba32>(imageBytes);
        int width = canvas.Width;
        int height = canvas.Height;

        int expected = products.Count;
        var perColorRegions = new List<(int ProductIndex, Region Region)>();
        var missingProducts = new List<string>();
        var diagnostics = new List<ColorDiagnostic>();

        for (int i = 0; i < products.Count; i++)
        {
            var assignment = markerAssignments[i];
            var target = HexToRgb(assignment.MarkerHex);
            var tight = ColorThresholds.Tight(target);
            var loose = ColorThresholds.Loose(target);

            // Detection uses LOOSE threshold — tight threshold misses the anti-aliased
            // fringe of Gemini's outlines, causing the mask to fragment into many small
            // disconnected components. Loose threshold catches the full outline as one
            // connected shape. We still keep tightPixelCount for diagnostics.
            var tightMask = BuildMask(canvas, tight);
            int tightCount = CountTrue(tightMask);

            var mask = BuildMask(canvas, loose);
            int looseCount = CountTrue(mask);

            var components = LabelComponents(mask, width, height);
            var filtered = FilterShapes(components, width, height, mask);
            var best = SelectBestRegion(filtered);

            string? rejectReason = null;
            if (best is null)
            {
                if (tightCount == 0)
                {
                    rejectReason = $"no pixels matched tight threshold (loose matched {looseCount})";
                }
                else if (components.Count == 0)
                {
                    rejectReason = "no connected components formed (unexpected)";
                }
                else if (filtered.Count == 0)
                {
                    rejectReason = $"{components.Count} components found, none passed shape filter (too small / wrong aspect / failed edge coverage)";
                }
                else
                {
                    rejectReason = "unknown";
                }

                missingProducts.Add(products[i].Name);
            }
            else
            {
                perColorRegions.Add((i, best));
            }

            diagnostics.Add(new ColorDiagnostic(
                ProductName: products[i].Name,
                MarkerHex: assignment.MarkerHex,
                TightPixelCount: tightCount,
                LoosePixelCount: looseCount,
                ComponentCount: components.Count,
                ComponentsPassedShape: filtered.Count,
                Detected: best is not null,
                RejectReason: rejectReason));
        }

        int detected = perColorRegions.Count;

        if (detected == 0)
        {
            return new CompositeResult(
                Image: Encode(canvas),
                DetectedRegions: 0,
                ExpectedRegions: expected,
                MissingProductNames: missingProducts,
                FallbackReason: FallbackReason.NoRegions,
                Diagnostics: diagnostics);
        }

        var productImages = new Dictionary<int, Image<Rgba32>>();
        try
        {
            foreach (var (productIndex, _) in perColorRegions)
            {
                var product = products[productIndex];
                if (!string.IsNullOrWhiteSpace(product.ImageBase64))
                {
                    productImages[productIndex] = Image.Load<Rgba32>(DecodeBase64Image(product.ImageBase64));
                }
            }

            // Build a list of ALL marker loose thresholds so the bg sampler can reject
            // anti-aliased marker pixels from polluting the background color estimate.
            var allLooseThresholds = markerAssignments
                .Select(a => ColorThresholds.Loose(HexToRgb(a.MarkerHex)))
                .ToList();

            var bgColorByProduct = new Dictionary<int, Rgba32>();
            foreach (var (productIndex, region) in perColorRegions)
            {
                var bgColor = SampleBackground(
                    canvas,
                    region.Bounds,
                    perColorRegions.Select(x => x.Region.Bounds).ToList(),
                    allLooseThresholds);
                bgColorByProduct[productIndex] = bgColor;
                FillInterior(canvas, region.Bounds, bgColor);

                if (productImages.TryGetValue(productIndex, out var productImg))
                {
                    PasteProduct(canvas, region.Bounds, productImg);
                }
            }

            foreach (var (productIndex, region) in perColorRegions)
            {
                var loose = ColorThresholds.Loose(HexToRgb(markerAssignments[productIndex].MarkerHex));
                var bgColor = bgColorByProduct[productIndex];
                CleanResidual(canvas, region.Bounds, loose, bgColor);
            }

            FallbackReason? reason = null;
            if (detected < expected)
            {
                reason = FallbackReason.PartialPreserve;
            }

            return new CompositeResult(
                Image: Encode(canvas),
                DetectedRegions: detected,
                ExpectedRegions: expected,
                MissingProductNames: missingProducts,
                FallbackReason: reason,
                Diagnostics: diagnostics);
        }
        finally
        {
            foreach (var img in productImages.Values)
            {
                img.Dispose();
            }
        }
    }

    // ── Diagnostics helpers ──────────────────────────────────────────────────
    private static int CountTrue(bool[,] mask)
    {
        int count = 0;
        int h = mask.GetLength(0);
        int w = mask.GetLength(1);
        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                if (mask[y, x])
                {
                    count++;
                }
            }
        }

        return count;
    }

    // ── Threshold / mask ─────────────────────────────────────────────────────
    private static bool[,] BuildMask(Image<Rgba32> canvas, ColorThreshold threshold)
    {
        int w = canvas.Width;
        int h = canvas.Height;
        var mask = new bool[h, w];
        canvas.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < h; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < w; x++)
                {
                    mask[y, x] = threshold.Matches(row[x]);
                }
            }
        });
        return mask;
    }

    // ── Connected-component labeling (BFS, 8-connectivity) ───────────────────
    private static List<RawComponent> LabelComponents(bool[,] mask, int w, int h)
    {
        var labels = new int[h, w];
        int next = 0;
        var components = new List<RawComponent>();
        var queue = new Queue<(int Y, int X)>();
        var neighborsDy = new[] { -1, -1, -1, 0, 0, 1, 1, 1 };
        var neighborsDx = new[] { -1, 0, 1, -1, 1, -1, 0, 1 };

        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                if (!mask[y, x] || labels[y, x] != 0)
                {
                    continue;
                }

                next++;
                queue.Clear();
                queue.Enqueue((y, x));
                labels[y, x] = next;
                int minX = x, maxX = x, minY = y, maxY = y, area = 0;

                while (queue.Count > 0)
                {
                    var (cy, cx) = queue.Dequeue();
                    area++;
                    if (cx < minX)
                    {
                        minX = cx;
                    }

                    if (cx > maxX)
                    {
                        maxX = cx;
                    }

                    if (cy < minY)
                    {
                        minY = cy;
                    }

                    if (cy > maxY)
                    {
                        maxY = cy;
                    }

                    for (int n = 0; n < 8; n++)
                    {
                        int ny = cy + neighborsDy[n];
                        int nx = cx + neighborsDx[n];
                        if (ny < 0 || ny >= h || nx < 0 || nx >= w)
                        {
                            continue;
                        }

                        if (mask[ny, nx] && labels[ny, nx] == 0)
                        {
                            labels[ny, nx] = next;
                            queue.Enqueue((ny, nx));
                        }
                    }
                }

                components.Add(new RawComponent(
                    Label: next,
                    Bounds: new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1),
                    Area: area));
            }
        }

        return components;
    }

    // ── Shape filtering ──────────────────────────────────────────────────────
    private static List<Region> FilterShapes(List<RawComponent> components, int w, int h, bool[,] mask)
    {
        int minArea = Math.Max(MinAreaFloor, (int)(w * h * MinAreaFraction));
        var kept = new List<Region>();

        foreach (var c in components)
        {
            if (c.Area < minArea)
            {
                continue;
            }

            int bw = c.Bounds.Width;
            int bh = c.Bounds.Height;
            if (bw <= 0 || bh <= 0)
            {
                continue;
            }

            double aspect = Math.Max(bw, bh) / (double)Math.Min(bw, bh);
            if (aspect > MaxAspectRatio)
            {
                continue;
            }

            double fillRatio = c.Area / (double)(bw * bh);
            bool isOutline = fillRatio is >= 0.03 and <= 0.30;
            bool isSolidFill = fillRatio >= 0.70;

            if (!isOutline && !isSolidFill)
            {
                continue;
            }

            double edgeScore = ComputeEdgeCoverage(c.Bounds, mask);
            if (isOutline && edgeScore < EdgeCoverageThreshold)
            {
                continue;
            }

            kept.Add(new Region(c.Bounds, c.Area, edgeScore));
        }

        return kept;
    }

    private static double ComputeEdgeCoverage(Rectangle bounds, bool[,] mask)
    {
        int h = mask.GetLength(0);
        int w = mask.GetLength(1);
        int x0 = Math.Max(0, bounds.Left);
        int x1 = Math.Min(w - 1, bounds.Right - 1);
        int y0 = Math.Max(0, bounds.Top);
        int y1 = Math.Min(h - 1, bounds.Bottom - 1);

        double topCov = EdgeStripCoverage(mask, x0, x1, y0, Math.Min(y1, y0 + EdgeStripWidth - 1));
        double bottomCov = EdgeStripCoverage(mask, x0, x1, Math.Max(y0, y1 - EdgeStripWidth + 1), y1);
        double leftCov = EdgeStripCoverage(mask, x0, Math.Min(x1, x0 + EdgeStripWidth - 1), y0, y1);
        double rightCov = EdgeStripCoverage(mask, Math.Max(x0, x1 - EdgeStripWidth + 1), x1, y0, y1);

        return Math.Min(Math.Min(topCov, bottomCov), Math.Min(leftCov, rightCov));
    }

    private static double EdgeStripCoverage(bool[,] mask, int x0, int x1, int y0, int y1)
    {
        int total = 0;
        int hits = 0;
        for (int y = y0; y <= y1; y++)
        {
            for (int x = x0; x <= x1; x++)
            {
                total++;
                if (mask[y, x])
                {
                    hits++;
                }
            }
        }

        return total == 0 ? 0.0 : hits / (double)total;
    }

    private static Region? SelectBestRegion(List<Region> candidates)
    {
        if (candidates.Count == 0)
        {
            return null;
        }

        return candidates.OrderByDescending(r => r.EdgeCoverageScore).ThenByDescending(r => r.Area).First();
    }

    // ── Background sampling ──────────────────────────────────────────────────
    private static Rgba32 SampleBackground(
        Image<Rgba32> canvas,
        Rectangle region,
        IReadOnlyList<Rectangle> allRegions,
        IReadOnlyList<ColorThreshold> markerLooseThresholds)
    {
        int w = canvas.Width;
        int h = canvas.Height;
        var samples = new List<Rgba32>();

        int x0 = Math.Max(0, region.Left - BgSampleStripWidth);
        int x1 = Math.Min(w - 1, region.Right - 1 + BgSampleStripWidth);
        int y0 = Math.Max(0, region.Top - BgSampleStripWidth);
        int y1 = Math.Min(h - 1, region.Bottom - 1 + BgSampleStripWidth);

        canvas.ProcessPixelRows(accessor =>
        {
            for (int y = y0; y <= y1; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = x0; x <= x1; x++)
                {
                    bool insideRegion = region.Contains(x, y);
                    if (insideRegion)
                    {
                        continue;
                    }

                    bool inOtherRegion = false;
                    foreach (var other in allRegions)
                    {
                        if (other != region && other.Contains(x, y))
                        {
                            inOtherRegion = true;
                            break;
                        }
                    }

                    if (inOtherRegion)
                    {
                        continue;
                    }

                    // Reject anti-aliased marker pixels — they would pollute the median
                    // with a peachy/pink tint instead of the true surrounding scene color.
                    var pixel = row[x];
                    bool isMarkerFringe = false;
                    foreach (var threshold in markerLooseThresholds)
                    {
                        if (threshold.Matches(pixel))
                        {
                            isMarkerFringe = true;
                            break;
                        }
                    }

                    if (isMarkerFringe)
                    {
                        continue;
                    }

                    samples.Add(pixel);
                }
            }
        });

        if (samples.Count == 0)
        {
            return new Rgba32(128, 128, 128, 255);
        }

        var rs = samples.Select(p => (int)p.R).OrderBy(v => v).ToList();
        var gs = samples.Select(p => (int)p.G).OrderBy(v => v).ToList();
        var bs = samples.Select(p => (int)p.B).OrderBy(v => v).ToList();

        return new Rgba32(
            (byte)rs[rs.Count / 2],
            (byte)gs[gs.Count / 2],
            (byte)bs[bs.Count / 2],
            255);
    }

    // ── Fill + paste ────────────────────────────────────────────────────────
    private static void FillInterior(Image<Rgba32> canvas, Rectangle bounds, Rgba32 color)
    {
        // Dilate by FillDilation pixels so any anti-aliased outline fringe just outside
        // the detected bbox is covered by bg color, not left as visible marker remnants.
        int w = canvas.Width;
        int h = canvas.Height;
        int x = Math.Max(0, bounds.X - FillDilation);
        int y = Math.Max(0, bounds.Y - FillDilation);
        int width = Math.Min(w - x, bounds.Width + (2 * FillDilation));
        int height = Math.Min(h - y, bounds.Height + (2 * FillDilation));
        var rect = new RectangleF(x, y, width, height);
        canvas.Mutate(ctx => ctx.Fill(Color.FromRgba(color.R, color.G, color.B, color.A), rect));
    }

    private static void PasteProduct(Image<Rgba32> canvas, Rectangle bounds, Image<Rgba32> product)
    {
        // Letterbox-fit: preserve aspect ratio, no squash.
        double scaleW = bounds.Width / (double)product.Width;
        double scaleH = bounds.Height / (double)product.Height;
        double scale = Math.Min(scaleW, scaleH);
        int fittedW = Math.Max(1, (int)Math.Round(product.Width * scale));
        int fittedH = Math.Max(1, (int)Math.Round(product.Height * scale));

        int px = bounds.X + ((bounds.Width - fittedW) / 2);
        int py = bounds.Y + bounds.Height - fittedH; // bottom-align so the product "sits" on the scene surface

        using var resized = product.Clone(ctx => ctx.Resize(fittedW, fittedH));
        canvas.Mutate(ctx => ctx.DrawImage(resized, new Point(px, py), 1f));
    }

    // ── Residual cleanup ─────────────────────────────────────────────────────
    private static void CleanResidual(Image<Rgba32> canvas, Rectangle bounds, ColorThreshold loose, Rgba32 bgColor)
    {
        int w = canvas.Width;
        int h = canvas.Height;
        int x0 = Math.Max(0, bounds.Left - CleanupExpansion);
        int x1 = Math.Min(w - 1, bounds.Right - 1 + CleanupExpansion);
        int y0 = Math.Max(0, bounds.Top - CleanupExpansion);
        int y1 = Math.Min(h - 1, bounds.Bottom - 1 + CleanupExpansion);

        canvas.ProcessPixelRows(accessor =>
        {
            for (int y = y0; y <= y1; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = x0; x <= x1; x++)
                {
                    // Skip the bbox interior — that's where we pasted the real product;
                    // any "matching" pixel there is part of the product, not a residual outline.
                    if (bounds.Contains(x, y))
                    {
                        continue;
                    }

                    if (loose.Matches(row[x]))
                    {
                        row[x] = bgColor;
                    }
                }
            }
        });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    private static ImageGenerationResult Encode(Image<Rgba32> canvas)
    {
        using var ms = new MemoryStream();
        canvas.Save(ms, new PngEncoder());
        return new ImageGenerationResult(ms.ToArray(), "image/png");
    }

    private static byte[] DecodeBase64Image(string raw)
    {
        const string prefix = "data:";
        if (raw.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            int comma = raw.IndexOf(',', StringComparison.Ordinal);
            if (comma >= 0)
            {
                return Convert.FromBase64String(raw[(comma + 1)..]);
            }
        }

        return Convert.FromBase64String(raw);
    }

    private static (byte R, byte G, byte B) HexToRgb(string hex)
    {
        var span = hex.AsSpan();
        if (span.Length > 0 && span[0] == '#')
        {
            span = span[1..];
        }

        if (span.Length == 3)
        {
            byte r = (byte)((HexDigit(span[0]) * 17) & 0xFF);
            byte g = (byte)((HexDigit(span[1]) * 17) & 0xFF);
            byte b = (byte)((HexDigit(span[2]) * 17) & 0xFF);
            return (r, g, b);
        }

        if (span.Length == 6)
        {
            byte r = (byte)((HexDigit(span[0]) << 4) | HexDigit(span[1]));
            byte g = (byte)((HexDigit(span[2]) << 4) | HexDigit(span[3]));
            byte b = (byte)((HexDigit(span[4]) << 4) | HexDigit(span[5]));
            return (r, g, b);
        }

        throw new ArgumentException($"Invalid hex color: {hex}", nameof(hex));
    }

    private static int HexDigit(char c) => c switch
    {
        >= '0' and <= '9' => c - '0',
        >= 'a' and <= 'f' => c - 'a' + 10,
        >= 'A' and <= 'F' => c - 'A' + 10,
        _ => throw new ArgumentException($"Invalid hex digit: {c}"),
    };

    private sealed record RawComponent(int Label, Rectangle Bounds, int Area);

    private sealed record Region(Rectangle Bounds, int Area, double EdgeCoverageScore);
}

internal static class ColorThresholds
{
    private const int TightBand = 30;
    private const int LooseBand = 80;

    public static ColorThreshold Tight((byte R, byte G, byte B) target)
        => Build(target, TightBand);

    public static ColorThreshold Loose((byte R, byte G, byte B) target)
        => Build(target, LooseBand);

    private static ColorThreshold Build((byte R, byte G, byte B) target, int band)
        => new(
            RMin: Math.Max(0, target.R - band),
            RMax: Math.Min(255, target.R + band),
            GMin: Math.Max(0, target.G - band),
            GMax: Math.Min(255, target.G + band),
            BMin: Math.Max(0, target.B - band),
            BMax: Math.Min(255, target.B + band));
}
