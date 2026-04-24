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
    private const double MinAreaFraction = 0.002;
    private const int MinAreaFloor = 400;
    private const double MaxAspectRatio = 20.0;

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

            var allLooseThresholds = markerAssignments
                .Select(a => ColorThresholds.Loose(HexToRgb(a.MarkerHex)))
                .ToList();
            var markerTargets = markerAssignments.Select(a => HexToRgb(a.MarkerHex)).ToList();

            // Inpaint BEFORE paste. If we pasted first, DrawImage's source-over blend
            // would pull the outline's cyan colour into each product PNG's 1–3 px
            // anti-aliased fringe, and the inpaint's A > 16 opaque-skip would then
            // refuse to clean those fringe pixels — leaving a visible marker-tinted
            // ring around every product silhouette. Cleaning the outline off the
            // pristine canvas first means the subsequent paste blends over pure
            // scene pixels, so the fringe stays untainted.
            var preInpaintInfos = perColorRegions
                .Select(r => new PasteInfo(
                    Bounds: r.Region.Bounds,
                    PasteRect: default,
                    ProductRect: default,
                    ProductOpaque: new bool[0, 0]))
                .ToList();
            int globalStragglersReplaced = InpaintGlobalMarkerStragglers(
                canvas, allLooseThresholds, markerTargets, preInpaintInfos);

            // For each detected region, paste the user's product in CONTAIN mode with
            // a synthetic shadow. CONTAIN keeps the whole product visible (e.g. tall
            // bottles don't get cropped); the paste now lands on a canvas whose marker
            // pixels have already been replaced with scene colour, so alpha-blended
            // edges come out clean.
            var pasteInfos = new List<PasteInfo>();
            foreach ((int productIndex, Region region) in perColorRegions)
            {
                if (productImages.TryGetValue(productIndex, out var productImg))
                {
                    pasteInfos.Add(PasteProduct(canvas, region, productImg));
                }
            }

            // Post-composite sanity check. After the pre-paste inpaint plus the paste
            // overwriting the interior, this should be near-zero except for legitimate
            // marker-like colours on the real product packaging itself.
            int finalMarkerCount = CountMarkerPixels(canvas, allLooseThresholds);

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
                Diagnostics: diagnostics,
                FinalMarkerPixelCount: finalMarkerCount,
                GlobalStragglersReplaced: globalStragglersReplaced);
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

    // ── Paste ───────────────────────────────────────────────────────────────
    private static PasteInfo PasteProduct(
        Image<Rgba32> canvas,
        Region region,
        Image<Rgba32> product)
    {
        Rectangle bounds = region.Bounds;

        // Estimate the outline's actual thickness from its pixel area and the bbox perimeter.
        // For a thin ring, outlineArea ≈ 2 × (W + H) × thickness, so thickness ≈ area / perimeter.
        int perimeter = Math.Max(1, 2 * (bounds.Width + bounds.Height));
        int measuredThickness = Math.Max(2, region.Area / perimeter);

        // Dilate paste generously: outline thickness + ~12 px extra to cover Gemini's
        // anti-aliased halo around the outline (typically 5-8 px wide). The real product
        // ends up slightly larger than the outline Gemini drew, physically covering both
        // the outline core AND its soft fringe — so even any marker residue that escapes
        // the global inpaint ends up underneath the paste and stays invisible. Minimum
        // 14 px floor ensures small outlines still get adequate coverage.
        int pasteDilation = Math.Max(14, measuredThickness + 12);
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

        // CONTAIN-fit: scale so the whole product fits inside the paste area without cropping.
        // One axis matches the paste dimension exactly; the other leaves margin that will be
        // inpainted from the surrounding scene (per-pixel, NOT a flat-colour fill — see
        // InpaintSceneAroundPaste below).
        double scaleW = pasteW / (double)cropped.Width;
        double scaleH = pasteH / (double)cropped.Height;
        double scale = Math.Min(scaleW, scaleH);
        int fittedW = Math.Max(1, (int)Math.Round(cropped.Width * scale));
        int fittedH = Math.Max(1, (int)Math.Round(cropped.Height * scale));
        using Image<Rgba32> resized = cropped.Clone(ctx => ctx.Resize(fittedW, fittedH));

        // Build an opacity mask of the resized product — so the later inpaint step knows
        // which canvas pixels were actually covered by opaque product content vs which
        // remain as (now undesired) Gemini rendering that needs replacing.
        var productOpaque = BuildOpaqueMask(resized);

        // Bottom-align horizontally-centered. Products naturally "stand" on the paste floor;
        // whatever vertical margin exists (when the product is narrower than the bbox is tall)
        // sits ABOVE the product as negative space — matching how items display in a catalog.
        int px = px0 + ((pasteW - resized.Width) / 2);
        int py = py0 + (pasteH - resized.Height);

        // DrawImage with opacity 1.0 alpha-blends: opaque product pixels overwrite, transparent
        // pixels preserve whatever was underneath. That "underneath" content (Gemini's outline
        // + fake product rendering in the margin) is what we'll clean up via scene inpaint.
        canvas.Mutate(ctx => ctx.DrawImage(resized, new Point(px, py), 1f));

        var productBounds = new Rectangle(px, py, resized.Width, resized.Height);

        return new PasteInfo(
            Bounds: bounds,
            PasteRect: new Rectangle(px0, py0, pasteW, pasteH),
            ProductRect: productBounds,
            ProductOpaque: productOpaque);
    }

    // Builds a boolean "opaque" mask (true where alpha > 16) for a resized product image.
    // Used by the final inpaint step to know which canvas pixels carry real product content
    // after paste, so margin pixels (transparent on the product) can be replaced with
    // scene-blended colors instead of leaving Gemini's render peeking through.
    private static bool[,] BuildOpaqueMask(Image<Rgba32> resized)
    {
        int w = resized.Width;
        int h = resized.Height;
        var mask = new bool[h, w];
        resized.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < h; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < w; x++)
                {
                    if (row[x].A > 16)
                    {
                        mask[y, x] = true;
                    }
                }
            }
        });
        return mask;
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

    // ── Helpers ──────────────────────────────────────────────────────────────
    // Outline removal, simplified:
    //   1. Detect every pixel that is outline-tinted (strict marker threshold OR
    //      chromatic match with any marker colour).
    //   2. Flood-fill from the image boundary through pixels that are NEITHER outline
    //      NOR product. The reached pixels are the TRUE scene outside the outline —
    //      guaranteed not to contain any tint because the flood cannot cross a marker
    //      pixel (so undetected outer-halo pixels stay unreached, classified as non-scene).
    //   3. For each outline pixel, cast 8 radial rays. Each ray continues past any
    //      non-scene pixel (outline, fringe, product, unreachable area) and uses the
    //      first flood-reached scene pixel as its sample. Weighted average by 1/distance.
    //   4. Write the averaged scene colour into the outline pixel.
    //
    // Why this is correct: samples can ONLY be flood-reached "outside" pixels, so they
    // are scene pixels that were never close enough to an outline to be blended with it.
    // Replacement values are pure scene colour, with no residual outline tint.
    private static int InpaintGlobalMarkerStragglers(
        Image<Rgba32> canvas,
        IReadOnlyList<ColorThreshold> allLooseThresholds,
        IReadOnlyList<(byte R, byte G, byte B)> markerTargets,
        IReadOnlyList<PasteInfo> pasteInfos)
    {
        const int MaxSearchRadius = 256;

        // Within the tightly-bounded consider region, we use the SAME permissive
        // thresholds for both "what to replace" and "flood-fill barrier". Any pixel
        // with even a hint of chroma leaning toward a marker colour gets repainted
        // with clean scene. This eliminates the sub-threshold fine lines that earlier
        // stricter target settings were leaving behind. The spatial restriction
        // (ConsiderMargin below) keeps us from touching unrelated scene content.
        const int MarkerChebBand = 230;
        const int MinChroma = 10;

        // Spatial scope — two-stage gating so only pixels near REAL outline get touched.
        //
        // SEED detection is STRICT: only pixels with high chroma AND close to a marker
        // colour qualify. This guarantees seeds are actual outline pixels (not naturally-
        // tinted scene like bluish shadows near the cyan marker in RGB space).
        //
        // DILATION around the strict seeds is WIDE (25 px) so the consider band covers
        // the full anti-aliased halo that Gemini renders around each outline — but
        // CENTRED on real outline pixels, not on scene that happened to lean toward
        // marker hues.
        //
        // Inside the consider band, the TARGET check is permissive — any chromatic
        // pixel leaning toward a marker gets replaced. Since the band is tight around
        // actual outline, this permissiveness can't touch unrelated scene content.
        const int CoarseMargin = 30;    // initial bbox expansion for seed detection
        const int SeedProximity = 25;   // dilation radius around seed outline pixels
        const int SeedChroma = 45;      // STRICT: only clearly-tinted pixels qualify
        const int SeedChebBand = 120;   // STRICT: close enough to marker in RGB cheb

        int w = canvas.Width;
        int h = canvas.Height;
        int thresholdCount = allLooseThresholds.Count;
        int targetCount = markerTargets.Count;

        // Union of all products' opaque masks in canvas coordinates. Built first because
        // the seed detection below checks opaque to skip real-product pixels.
        var opaque = new bool[h, w];
        foreach (var infoForOpaque in pasteInfos)
        {
            int prodH = infoForOpaque.ProductOpaque.GetLength(0);
            int prodW = infoForOpaque.ProductOpaque.GetLength(1);
            int baseY = infoForOpaque.ProductRect.Top;
            int baseX = infoForOpaque.ProductRect.Left;
            for (int py = 0; py < prodH; py++)
            {
                int cy = baseY + py;
                if (cy < 0 || cy >= h)
                {
                    continue;
                }

                for (int px = 0; px < prodW; px++)
                {
                    int cx = baseX + px;
                    if (cx < 0 || cx >= w)
                    {
                        continue;
                    }

                    if (infoForOpaque.ProductOpaque[py, px])
                    {
                        opaque[cy, cx] = true;
                    }
                }
            }
        }

        // Pass A: within the coarse bbox-rect, detect SEED outline pixels (anything
        // chromatic-and-close-to-marker). These are the anchor points for the tight
        // final mask — we only operate on pixels spatially near one of these seeds.
        var seed = new bool[h, w];
        bool anySeed = false;
        foreach (var info in pasteInfos)
        {
            int cx0 = Math.Max(0, info.Bounds.Left - CoarseMargin);
            int cy0 = Math.Max(0, info.Bounds.Top - CoarseMargin);
            int cx1 = Math.Min(w - 1, info.Bounds.Right - 1 + CoarseMargin);
            int cy1 = Math.Min(h - 1, info.Bounds.Bottom - 1 + CoarseMargin);

            canvas.ProcessPixelRows(accessor =>
            {
                for (int y = cy0; y <= cy1; y++)
                {
                    var row = accessor.GetRowSpan(y);
                    for (int x = cx0; x <= cx1; x++)
                    {
                        if (opaque[y, x])
                        {
                            continue;
                        }

                        var p = row[x];
                        int pMax = p.R;
                        if (p.G > pMax)
                        {
                            pMax = p.G;
                        }

                        if (p.B > pMax)
                        {
                            pMax = p.B;
                        }

                        int pMin = p.R;
                        if (p.G < pMin)
                        {
                            pMin = p.G;
                        }

                        if (p.B < pMin)
                        {
                            pMin = p.B;
                        }

                        int chroma = pMax - pMin;
                        if (chroma < SeedChroma)
                        {
                            continue;
                        }

                        for (int t = 0; t < targetCount; t++)
                        {
                            var tg = markerTargets[t];
                            int dR = p.R > tg.R ? p.R - tg.R : tg.R - p.R;
                            int dG = p.G > tg.G ? p.G - tg.G : tg.G - p.G;
                            int dB = p.B > tg.B ? p.B - tg.B : tg.B - p.B;
                            int cheb = dR;
                            if (dG > cheb)
                            {
                                cheb = dG;
                            }

                            if (dB > cheb)
                            {
                                cheb = dB;
                            }

                            if (cheb <= SeedChebBand)
                            {
                                seed[y, x] = true;
                                anySeed = true;
                                break;
                            }
                        }
                    }
                }
            });
        }

        // Pass B: dilate seed by SeedProximity to build the final consider mask.
        // Separable square dilation (horizontal then vertical) — O(radius) per pixel.
        var consider = new bool[h, w];
        if (anySeed)
        {
            var hDilated = new bool[h, w];
            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    int xMin = Math.Max(0, x - SeedProximity);
                    int xMax = Math.Min(w - 1, x + SeedProximity);
                    for (int nx = xMin; nx <= xMax; nx++)
                    {
                        if (seed[y, nx])
                        {
                            hDilated[y, x] = true;
                            break;
                        }
                    }
                }
            }

            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    int yMin = Math.Max(0, y - SeedProximity);
                    int yMax = Math.Min(h - 1, y + SeedProximity);
                    for (int ny = yMin; ny <= yMax; ny++)
                    {
                        if (hDilated[ny, x])
                        {
                            consider[y, x] = true;
                            break;
                        }
                    }
                }
            }
        }

        // Snapshot + single detection mask. Within the consider region only, any
        // pixel that is chromatic (chroma ≥ 10) AND within Chebyshev 230 of a marker
        // colour is flagged — it's both a replacement target AND a flood-fill barrier.
        // Unified threshold means no sub-threshold fringe is left behind.
        var buf = new Rgba32[h, w];
        var outline = new bool[h, w];
        bool anyOutline = false;

        canvas.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < h; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < w; x++)
                {
                    var p = row[x];
                    buf[y, x] = p;
                    if (opaque[y, x] || !consider[y, x])
                    {
                        continue;
                    }

                    int pMax = p.R;
                    if (p.G > pMax)
                    {
                        pMax = p.G;
                    }

                    if (p.B > pMax)
                    {
                        pMax = p.B;
                    }

                    int pMin = p.R;
                    if (p.G < pMin)
                    {
                        pMin = p.G;
                    }

                    if (p.B < pMin)
                    {
                        pMin = p.B;
                    }

                    int chroma = pMax - pMin;
                    if (chroma < MinChroma)
                    {
                        continue;
                    }

                    // Chebyshev distance to the CLOSEST marker colour.
                    int closest = int.MaxValue;
                    for (int t = 0; t < targetCount; t++)
                    {
                        var tg = markerTargets[t];
                        int dR = p.R > tg.R ? p.R - tg.R : tg.R - p.R;
                        int dG = p.G > tg.G ? p.G - tg.G : tg.G - p.G;
                        int dB = p.B > tg.B ? p.B - tg.B : tg.B - p.B;
                        int cheb = dR;
                        if (dG > cheb)
                        {
                            cheb = dG;
                        }

                        if (dB > cheb)
                        {
                            cheb = dB;
                        }

                        if (cheb < closest)
                        {
                            closest = cheb;
                        }
                    }

                    if (closest <= MarkerChebBand)
                    {
                        outline[y, x] = true;
                        anyOutline = true;
                    }
                }
            }
        });

        if (!anyOutline)
        {
            return 0;
        }

        // Scene = valid replacement sample pool. Restricted to pixels OUTSIDE the
        // consider region (and not opaque product). Crucially, we do NOT flood
        // inward through !outline paths: Gemini's outlines almost always have at
        // least one sub-threshold gap (anti-aliased dropouts, thin spots, typography
        // crossings), and any flood would spill through that gap into the fake-
        // product interior. The interior pixels — darker glass, product shadows,
        // label colours — would then leak into outline replacements via the 8-ray
        // sampling below, producing visible dark halos around each product. By
        // keeping scene strictly "outside consider", rays walk through every
        // consider-region pixel (outline AND non-outline) with `continue` until
        // they hit an outside-consider pixel, which is guaranteed clean scene.
        var scene = new bool[h, w];
        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                if (!consider[y, x] && !opaque[y, x])
                {
                    scene[y, x] = true;
                }
            }
        }

        // For each outline pixel, cast 8 rays and sample the first outside-consider
        // scene pixel on each ray. Those samples come from pixels untouched by the
        // outline detection and its halo, so they're pure backdrop — no fake-interior
        // colours, no marker tint.
        var replacement = new Rgba32[h, w];
        var replaced = new bool[h, w];

        int[] ddx = [0, 1, 1, 1, 0, -1, -1, -1];
        int[] ddy = [-1, -1, 0, 1, 1, 1, 0, -1];

        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                if (!outline[y, x])
                {
                    continue;
                }

                double accR = 0, accG = 0, accB = 0, accWeight = 0;
                for (int d = 0; d < 8; d++)
                {
                    int sx = ddx[d];
                    int sy = ddy[d];
                    int cx = x;
                    int cy = y;
                    for (int step = 1; step <= MaxSearchRadius; step++)
                    {
                        cx += sx;
                        cy += sy;
                        if (cx < 0 || cx >= w || cy < 0 || cy >= h)
                        {
                            break;
                        }

                        if (!scene[cy, cx])
                        {
                            continue;
                        }

                        double weight = 1.0 / step;
                        var sample = buf[cy, cx];
                        accR += sample.R * weight;
                        accG += sample.G * weight;
                        accB += sample.B * weight;
                        accWeight += weight;
                        break;
                    }
                }

                if (accWeight > 0)
                {
                    replacement[y, x] = new Rgba32(
                        (byte)Math.Clamp(Math.Round(accR / accWeight), 0, 255),
                        (byte)Math.Clamp(Math.Round(accG / accWeight), 0, 255),
                        (byte)Math.Clamp(Math.Round(accB / accWeight), 0, 255),
                        255);
                    replaced[y, x] = true;
                }
            }
        }

        int count = 0;
        canvas.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < h; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < w; x++)
                {
                    if (replaced[y, x])
                    {
                        row[x] = replacement[y, x];
                        count++;
                    }
                }
            }
        });

        return count;
    }

    // Counts how many pixels in the full canvas still match ANY marker loose threshold —
    // a post-composite sanity check. If the inpaint pass did its job, this should be very
    // small (well under 1000 pixels, accounting for occasional marker-ish hues that happen
    // to appear in legit scene content).
    private static int CountMarkerPixels(Image<Rgba32> canvas, IReadOnlyList<ColorThreshold> allLooseThresholds)
    {
        int count = 0;
        int thresholdCount = allLooseThresholds.Count;
        canvas.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < row.Length; x++)
                {
                    var p = row[x];
                    for (int t = 0; t < thresholdCount; t++)
                    {
                        if (allLooseThresholds[t].Matches(p))
                        {
                            count++;
                            break;
                        }
                    }
                }
            }
        });
        return count;
    }

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

    // Paste info passed to the final inpaint step — lets the inpainter know, for each
    // product, which canvas pixels were actually covered by the real photographic paste
    // (so every other pixel inside the paste rect must be inpainted from the surrounding scene).
    internal readonly record struct PasteInfo(
        Rectangle Bounds,           // the detected outline bbox
        Rectangle PasteRect,        // bbox + outline dilation (the zone to clean)
        Rectangle ProductRect,      // where the real product sits on the canvas
        bool[,] ProductOpaque);     // mask sized to ProductRect; true where real product is opaque

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
