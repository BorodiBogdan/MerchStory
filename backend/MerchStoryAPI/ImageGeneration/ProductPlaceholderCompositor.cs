using MerchStoryImageGeneration.Models;
using SixLabors.ImageSharp;
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
    private const int BgSampleStripWidth = 12;
    private const int CleanupExpansion = 14;

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

        // Build DISJOINT masks — each candidate marker pixel is assigned to the SINGLE
        // closest target color (by Chebyshev distance in RGB). This prevents two products
        // whose loose thresholds overlap (e.g. magenta and electric violet, both with
        // G≈0 and B≈255) from claiming the same pixels → same bbox → same region.
        var targets = markerAssignments.Select(a => HexToRgb(a.MarkerHex)).ToList();
        var disjointMasks = BuildDisjointMasks(canvas, targets, maxDistance: 80);

        for (int i = 0; i < products.Count; i++)
        {
            var assignment = markerAssignments[i];
            var target = HexToRgb(assignment.MarkerHex);
            var tight = ColorThresholds.Tight(target);

            // tightCount is only for diagnostics — report how many pixels would have
            // matched the strict threshold, regardless of disambiguation.
            var tightMask = BuildMask(canvas, tight);
            int tightCount = CountTrue(tightMask);

            var mask = disjointMasks[i];
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

            // For each detected region:
            //   1) sample a bg color from the scene just outside the bbox (skipping marker fringe)
            //      — we still need this for CleanResidual to erase anti-aliased fringe outside the paste
            //   2) paste the user's product in COVER mode (fills bbox + dilation, overflows cleanly)
            //      — the paste itself erases the outline and Gemini's rendered product; no pre-fill needed
            var bgColorByProduct = new Dictionary<int, Rgba32>();
            List<Rectangle> allBounds = [.. perColorRegions.Select(x => x.Region.Bounds)];
            foreach ((int productIndex, Region region) in perColorRegions)
            {
                Rgba32 bgColor = SampleBackground(
                    canvas,
                    region.Bounds,
                    allBounds,
                    allLooseThresholds);
                bgColorByProduct[productIndex] = bgColor;

                if (productImages.TryGetValue(productIndex, out var productImg))
                {
                    PasteProduct(canvas, region, productImg);
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

    // ── Disjoint nearest-neighbor masks ──────────────────────────────────────
    // For each pixel, assigns it to the target color that's closest in RGB (Chebyshev
    // distance ≤ maxDistance). If no target is within reach, the pixel is not in any mask.
    // This ensures overlapping loose thresholds don't cause two products to claim the
    // same pixels → same region.
    private static bool[][,] BuildDisjointMasks(
        Image<Rgba32> canvas,
        IReadOnlyList<(byte R, byte G, byte B)> targets,
        int maxDistance)
    {
        int w = canvas.Width;
        int h = canvas.Height;
        int n = targets.Count;
        var masks = new bool[n][,];
        for (int i = 0; i < n; i++)
        {
            masks[i] = new bool[h, w];
        }

        canvas.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < h; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < w; x++)
                {
                    var p = row[x];
                    int bestIdx = -1;
                    int bestDist = int.MaxValue;
                    for (int i = 0; i < n; i++)
                    {
                        var t = targets[i];
                        int dr = Math.Abs(p.R - t.R);
                        int dg = Math.Abs(p.G - t.G);
                        int db = Math.Abs(p.B - t.B);
                        int dist = Math.Max(dr, Math.Max(dg, db));
                        if (dist < bestDist)
                        {
                            bestDist = dist;
                            bestIdx = i;
                        }
                    }

                    if (bestIdx >= 0 && bestDist <= maxDistance)
                    {
                        masks[bestIdx][y, x] = true;
                    }
                }
            }
        });

        return masks;
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
    // Accepts:
    //   - Solid fills (fill ratio ≥ 70%) — Gemini occasionally fills instead of outlining.
    //   - Closed contours (fill ratio < 70% AND encloses a non-trivial area) — silhouette
    //     outlines that trace the product's shape. Check via flood-fill from outside the
    //     bbox: pixels not reached by the flood = enclosed by the outline.
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

            if (fillRatio >= 0.70)
            {
                // Solid-fill marker — accept.
                kept.Add(new Region(c.Bounds, c.Area, 1.0));
                continue;
            }

            // Outline case: require the outline to enclose a meaningful area.
            // Flood-fill the bbox (plus 1-px padding) starting from a corner using !mask.
            // Pixels that remain unvisited AND are not part of the mask = enclosed by the outline.
            int enclosedArea = CountEnclosedArea(c.Bounds, mask);
            double enclosedRatio = enclosedArea / (double)(bw * bh);

            // Require at least 30% of the bbox to be enclosed — rules out open strokes
            // that happen to loop back on themselves slightly.
            if (enclosedRatio < 0.30)
            {
                continue;
            }

            kept.Add(new Region(c.Bounds, c.Area, enclosedRatio));
        }

        return kept;
    }

    // Flood-fills the bbox area (padded by 1 px) from the top-left corner using pixels
    // where mask == false. Any pixel inside the bbox that is NOT mask AND NOT reached by
    // the flood is "enclosed" by the outline — returns the count of those pixels.
    private static int CountEnclosedArea(Rectangle bounds, bool[,] mask)
    {
        int h = mask.GetLength(0);
        int w = mask.GetLength(1);

        int x0 = Math.Max(0, bounds.Left - 1);
        int y0 = Math.Max(0, bounds.Top - 1);
        int x1 = Math.Min(w - 1, bounds.Right);
        int y1 = Math.Min(h - 1, bounds.Bottom);

        int regW = x1 - x0 + 1;
        int regH = y1 - y0 + 1;
        var visited = new bool[regH, regW];

        var queue = new Queue<(int Y, int X)>();

        // Seed from all four edges of the padded bbox — any of those that aren't masked
        // must be "outside" the outline (since we padded 1 px around the blob's bbox).
        for (int x = x0; x <= x1; x++)
        {
            SeedIfOpen(mask, visited, queue, y0, x, x0, y0);
            SeedIfOpen(mask, visited, queue, y1, x, x0, y0);
        }

        for (int y = y0; y <= y1; y++)
        {
            SeedIfOpen(mask, visited, queue, y, x0, x0, y0);
            SeedIfOpen(mask, visited, queue, y, x1, x0, y0);
        }

        while (queue.Count > 0)
        {
            var (cy, cx) = queue.Dequeue();
            for (int dy = -1; dy <= 1; dy++)
            {
                for (int dx = -1; dx <= 1; dx++)
                {
                    if (dx == 0 && dy == 0)
                    {
                        continue;
                    }

                    int ny = cy + dy;
                    int nx = cx + dx;
                    if (ny < y0 || ny > y1 || nx < x0 || nx > x1)
                    {
                        continue;
                    }

                    int ly = ny - y0;
                    int lx = nx - x0;
                    if (visited[ly, lx] || mask[ny, nx])
                    {
                        continue;
                    }

                    visited[ly, lx] = true;
                    queue.Enqueue((ny, nx));
                }
            }
        }

        // Count pixels inside the original bounds that are neither masked nor visited — they
        // are enclosed by the outline.
        int enclosed = 0;
        for (int y = bounds.Top; y < bounds.Bottom; y++)
        {
            for (int x = bounds.Left; x < bounds.Right; x++)
            {
                int ly = y - y0;
                int lx = x - x0;
                if (!mask[y, x] && !visited[ly, lx])
                {
                    enclosed++;
                }
            }
        }

        return enclosed;
    }

    private static void SeedIfOpen(bool[,] mask, bool[,] visited, Queue<(int Y, int X)> queue, int y, int x, int offsetX, int offsetY)
    {
        int ly = y - offsetY;
        int lx = x - offsetX;
        if (visited[ly, lx] || mask[y, x])
        {
            return;
        }

        visited[ly, lx] = true;
        queue.Enqueue((y, x));
    }

    private static Region? SelectBestRegion(List<Region> candidates)
    {
        if (candidates.Count == 0)
        {
            return null;
        }

        // When multiple candidates survive (e.g. Gemini hallucinated two outlines in the
        // same color — maybe a tiny decorative one + the real product), pick the one with
        // the LARGEST bbox area. The real product is almost always the bigger enclosed
        // region; small duplicates are noise. Pixel-area is used as tiebreaker.
        return candidates
            .OrderByDescending(r => r.Bounds.Width * r.Bounds.Height)
            .ThenByDescending(r => r.Area)
            .ThenByDescending(r => r.EdgeCoverageScore)
            .First();
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

    // ── Paste ───────────────────────────────────────────────────────────────
    private static void PasteProduct(Image<Rgba32> canvas, Region region, Image<Rgba32> product)
    {
        Rectangle bounds = region.Bounds;

        // Estimate the outline's actual thickness from its pixel area and the bbox perimeter.
        // For a thin ring, outlineArea ≈ 2 × (W + H) × thickness, so thickness ≈ area / perimeter.
        int perimeter = Math.Max(1, 2 * (bounds.Width + bounds.Height));
        int measuredThickness = Math.Max(2, region.Area / perimeter);

        // Dilate paste by ~½× the measured thickness + 2 px buffer — tight fit that just
        // covers the outline + anti-aliased fringe without overshooting much beyond the
        // product silhouette. Minimum 4 px floor for small regions.
        int pasteDilation = Math.Max(4, (measuredThickness / 2) + 4);
        int canvasW = canvas.Width;
        int canvasH = canvas.Height;
        int px0 = Math.Max(0, bounds.X - pasteDilation);
        int py0 = Math.Max(0, bounds.Y - pasteDilation);
        int px1 = Math.Min(canvasW, bounds.Right + pasteDilation);
        int py1 = Math.Min(canvasH, bounds.Bottom + pasteDilation);
        int pasteW = px1 - px0;
        int pasteH = py1 - py0;

        // Crop the product PNG to the bounding box of its non-transparent pixels so the
        // scaling is based on the visible product, not the full PNG including padding.
        Rectangle opaqueBounds = FindOpaqueBounds(product);
        using Image<Rgba32> cropped = opaqueBounds == new Rectangle(0, 0, product.Width, product.Height)
            ? product.Clone(ctx => { })
            : product.Clone(ctx => ctx.Crop(opaqueBounds));

        // Orientation-match: Gemini is allowed to rotate products by whole 90° increments
        // (0°/90°/180°/270°) for layout reasons. The prompt tells it so — but the rendered
        // outline will trace the rotated silhouette, so the bbox's aspect can differ from
        // the user's PNG aspect. We detect a large aspect mismatch and rotate the PNG 90°
        // to compensate so the paste aligns visually. (180°/270° are indistinguishable in
        // aspect from 0°/90°, and choosing right-side-up is better left to Gemini's pose
        // guidance in the prompt — we only correct aspect, not upside-down flips.)
        double pngAspect = cropped.Width / (double)cropped.Height;
        double bboxAspect = bounds.Width / (double)bounds.Height;
        double directMismatch = Math.Abs(Math.Log(pngAspect) - Math.Log(bboxAspect));
        double rotatedMismatch = Math.Abs(Math.Log(1.0 / pngAspect) - Math.Log(bboxAspect));
        if (rotatedMismatch + 0.2 < directMismatch)
        {
            cropped.Mutate(ctx => ctx.Rotate(90));
        }

        // COVER-fit on the (possibly rotated) CROPPED product so it fills the paste area on both axes.
        double scaleW = pasteW / (double)cropped.Width;
        double scaleH = pasteH / (double)cropped.Height;
        double scale = Math.Max(scaleW, scaleH);
        int fittedW = Math.Max(1, (int)Math.Round(cropped.Width * scale));
        int fittedH = Math.Max(1, (int)Math.Round(cropped.Height * scale));

        // If COVER scaling caused overflow on one axis, center-crop the resized product so
        // it never exceeds the paste area. This prevents a wide product (e.g. Milka bar)
        // in a tall bbox from spilling hundreds of pixels left/right onto neighbouring
        // products.
        using Image<Rgba32> resized = cropped.Clone(ctx => ctx.Resize(fittedW, fittedH));
        int overflowX = Math.Max(0, fittedW - pasteW);
        int overflowY = Math.Max(0, fittedH - pasteH);
        if (overflowX > 0 || overflowY > 0)
        {
            int cropX = overflowX / 2;
            int cropY = overflowY / 2;
            int cropW = Math.Min(pasteW, fittedW);
            int cropH = Math.Min(pasteH, fittedH);
            resized.Mutate(ctx => ctx.Crop(new Rectangle(cropX, cropY, cropW, cropH)));
        }

        int px = px0 + Math.Max(0, (pasteW - resized.Width) / 2);
        int py = py0 + Math.Max(0, (pasteH - resized.Height) / 2);

        canvas.Mutate(ctx => ctx.DrawImage(resized, new Point(px, py), 1f));
    }

    private static Rectangle FindOpaqueBounds(Image<Rgba32> image)
    {
        int w = image.Width;
        int h = image.Height;
        int minX = w;
        int maxX = -1;
        int minY = h;
        int maxY = -1;

        image.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < h; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < w; x++)
                {
                    if (row[x].A > 16)
                    {
                        if (x < minX)
                        {
                            minX = x;
                        }

                        if (x > maxX)
                        {
                            maxX = x;
                        }

                        if (y < minY)
                        {
                            minY = y;
                        }

                        if (y > maxY)
                        {
                            maxY = y;
                        }
                    }
                }
            }
        });

        if (maxX < 0)
        {
            return new Rectangle(0, 0, w, h);
        }

        return new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1);
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
