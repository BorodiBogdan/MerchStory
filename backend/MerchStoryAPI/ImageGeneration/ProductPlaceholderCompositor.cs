using System.Globalization;
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

    // After flood-filling outline + interior, dilate the mask outward by this
    // many pixels. Captures Gemini's drop shadows (which extend past the bag
    // silhouette) so LaMa erases them too — otherwise the shadows survive
    // around the pasted products as awkward grey gradients.
    private const int MaskDilationPx = 30;

    // Pasted products are scaled to this fraction of the median placeholder
    // bbox. Less than 1.0 leaves visual breathing room around each product so
    // adjacent products don't touch and the chip-bag silhouettes don't fill
    // the whole grid cell. Adjust if products look too small / too big.
    private const float PasteScaleFactor = 0.8f;

    // Sends the Gemini-rendered image and a binary mask of the detected outlines
    // to IOPaint (LaMa). Returns the cleaned image with the outlines erased and
    // each product's photo pasted onto its detected placeholder.
    public static async Task<CompositeResult> CompositeAsync(
        byte[] imageBytes,
        IReadOnlyList<CatalogProductItem> products,
        IReadOnlyList<ProductMarkerAssignment> markerAssignments,
        IOPaintClient inpaintClient,
        ILogger? logger = null,
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

        // Pass 1.5: per product, keep only the LARGEST connected component of
        // matched pixels. Scattered false-positive matches (random scene
        // pixels that happen to fall inside the marker's Chebyshev radius)
        // would otherwise stretch the bbox across the whole image and pull the
        // paste anchor away from the real outline.
        matched = FilterToLargestComponent(matched, products.Count, height, width);

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

        // Build the LaMa mask: outline + interior of every product. Flood-fill
        // from the canvas border through cells where thickened == -1; every
        // pixel reached is true scene (kept). Everything else (outline cells +
        // pixels enclosed by the outline = the placeholder products themselves)
        // is what LaMa rewrites with synthesised scene. Then dilate by
        // MaskDilationPx so Gemini's drop shadows (which extend past the bag
        // silhouette and are otherwise outside the mask) get erased too.
        bool[,] inpaintMask = BuildFullProductMask(thickened, height, width);
        inpaintMask = DilateMask(inpaintMask, height, width, MaskDilationPx);
        byte[] maskPng = EncodeMaskPng(inpaintMask, width, height);
        byte[] cleaned = await inpaintClient.InpaintAsync(imageBytes, maskPng, cancellationToken);

        // Paste each user-supplied product photo onto its detected placeholder.
        // The centroid (mass-weighted average of matched pixels) is more robust
        // than the bbox centre when detection picks up scattered halo pixels —
        // those outliers stretch the bbox but barely move the centroid.
        Rectangle[] boundingBoxes = ComputeBoundingBoxes(matched, products.Count, height, width);
        (int X, int Y)[] centroids = ComputeCentroids(matched, products.Count, height, width);

        if (logger is not null)
        {
            for (int i = 0; i < products.Count; i++)
            {
                Rectangle b = boundingBoxes[i];
                (int cx, int cy) = centroids[i];
                logger.LogInformation(
                    "  paste candidate '{Name}' bbox=({X},{Y},{W},{H}) centroid=({CX},{CY}) hasImage={HasImg}",
                    products[i].Name,
                    b.X,
                    b.Y,
                    b.Width,
                    b.Height,
                    cx,
                    cy,
                    !string.IsNullOrWhiteSpace(products[i].ImageBase64));
            }
        }

        byte[] finalBytes = PasteProducts(cleaned, products, boundingBoxes, logger);

        // Recount mask pixels for the diagnostics log so it reflects the
        // actual area we asked LaMa to inpaint (outline + interior).
        int totalInpaintPixels = 0;
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                if (inpaintMask[y, x])
                {
                    totalInpaintPixels++;
                }
            }
        }

        return new CompositeResult(
            Image: new ImageGenerationResult(finalBytes, "image/png"),
            DetectedRegions: products.Count,
            ExpectedRegions: products.Count,
            MissingProductNames: [],
            FallbackReason: null,
            Diagnostics: diagnostics,
            FinalMarkerPixelCount: totalInpaintPixels);
    }

    // Flood-fills from every canvas-border cell, advancing only through cells
    // whose thickened value is -1 (i.e. NOT part of any product's outline).
    // Anything the flood reaches is true scene; everything else is either
    // outline OR pixels enclosed by an outline (= the placeholder product).
    // Returns a bool[,] where true = inpaint, false = keep.
    private static bool[,] BuildFullProductMask(int[,] thickened, int height, int width)
    {
        var visited = new bool[height, width];
        var queue = new Queue<(int Y, int X)>();

        for (int x = 0; x < width; x++)
        {
            if (thickened[0, x] < 0)
            {
                visited[0, x] = true;
                queue.Enqueue((0, x));
            }

            if (thickened[height - 1, x] < 0)
            {
                visited[height - 1, x] = true;
                queue.Enqueue((height - 1, x));
            }
        }

        for (int y = 0; y < height; y++)
        {
            if (thickened[y, 0] < 0)
            {
                visited[y, 0] = true;
                queue.Enqueue((y, 0));
            }

            if (thickened[y, width - 1] < 0)
            {
                visited[y, width - 1] = true;
                queue.Enqueue((y, width - 1));
            }
        }

        ReadOnlySpan<int> dy = [-1, 1, 0, 0];
        ReadOnlySpan<int> dx = [0, 0, -1, 1];

        while (queue.Count > 0)
        {
            (int y, int x) = queue.Dequeue();
            for (int d = 0; d < 4; d++)
            {
                int ny = y + dy[d];
                int nx = x + dx[d];
                if (ny < 0 || ny >= height || nx < 0 || nx >= width)
                {
                    continue;
                }

                if (visited[ny, nx])
                {
                    continue;
                }

                if (thickened[ny, nx] >= 0)
                {
                    continue;
                }

                visited[ny, nx] = true;
                queue.Enqueue((ny, nx));
            }
        }

        var mask = new bool[height, width];
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                mask[y, x] = !visited[y, x];
            }
        }

        return mask;
    }

    // Per product, keep only the largest 4-connected component of matched
    // pixels. Other components (typically scattered false-positive halo
    // pixels in unrelated parts of the canvas) are reset to -1 so they don't
    // skew bbox / centroid calculations and don't waste LaMa cycles.
    private static int[,] FilterToLargestComponent(
        int[,] matched, int productCount, int height, int width)
    {
        if (productCount == 0)
        {
            return matched;
        }

        int[,] componentIds = new int[height, width];
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                componentIds[y, x] = -1;
            }
        }

        var componentProductIdx = new List<int>();
        var componentSizes = new List<int>();
        var queue = new Queue<(int Y, int X)>();
        ReadOnlySpan<int> dy = [-1, 1, 0, 0];
        ReadOnlySpan<int> dx = [0, 0, -1, 1];

        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int idx = matched[y, x];
                if (idx < 0 || idx >= productCount || componentIds[y, x] >= 0)
                {
                    continue;
                }

                int compId = componentSizes.Count;
                int count = 0;
                queue.Clear();
                queue.Enqueue((y, x));
                componentIds[y, x] = compId;

                while (queue.Count > 0)
                {
                    (int py, int px) = queue.Dequeue();
                    count++;

                    for (int d = 0; d < 4; d++)
                    {
                        int ny = py + dy[d];
                        int nx = px + dx[d];
                        if (ny < 0 || ny >= height || nx < 0 || nx >= width)
                        {
                            continue;
                        }

                        if (componentIds[ny, nx] >= 0)
                        {
                            continue;
                        }

                        if (matched[ny, nx] != idx)
                        {
                            continue;
                        }

                        componentIds[ny, nx] = compId;
                        queue.Enqueue((ny, nx));
                    }
                }

                componentProductIdx.Add(idx);
                componentSizes.Add(count);
            }
        }

        // For each product, find the component with the most pixels.
        int[] largestPerProduct = new int[productCount];
        int[] largestSizePerProduct = new int[productCount];
        for (int i = 0; i < productCount; i++)
        {
            largestPerProduct[i] = -1;
        }

        for (int c = 0; c < componentSizes.Count; c++)
        {
            int productIdx = componentProductIdx[c];
            if (componentSizes[c] > largestSizePerProduct[productIdx])
            {
                largestSizePerProduct[productIdx] = componentSizes[c];
                largestPerProduct[productIdx] = c;
            }
        }

        int[,] filtered = new int[height, width];
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int idx = matched[y, x];
                if (idx < 0 || idx >= productCount)
                {
                    filtered[y, x] = -1;
                    continue;
                }

                filtered[y, x] = componentIds[y, x] == largestPerProduct[idx] ? idx : -1;
            }
        }

        return filtered;
    }

    // Chebyshev dilation by `radius`: any pixel within a (2r+1)² window of a
    // true pixel becomes true. Implemented as two separable 1D passes
    // (horizontal then vertical) so total work is O(W·H·radius) rather than
    // the O(W·H·radius²) of a naïve 2D scan. Used to grow the inpaint mask
    // outward to cover Gemini's drop shadows.
    private static bool[,] DilateMask(bool[,] mask, int height, int width, int radius)
    {
        if (radius <= 0)
        {
            return mask;
        }

        bool[,] horizontal = new bool[height, width];
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int xMin = Math.Max(0, x - radius);
                int xMax = Math.Min(width - 1, x + radius);
                for (int nx = xMin; nx <= xMax; nx++)
                {
                    if (mask[y, nx])
                    {
                        horizontal[y, x] = true;
                        break;
                    }
                }
            }
        }

        bool[,] result = new bool[height, width];
        for (int x = 0; x < width; x++)
        {
            for (int y = 0; y < height; y++)
            {
                int yMin = Math.Max(0, y - radius);
                int yMax = Math.Min(height - 1, y + radius);
                for (int ny = yMin; ny <= yMax; ny++)
                {
                    if (horizontal[ny, x])
                    {
                        result[y, x] = true;
                        break;
                    }
                }
            }
        }

        return result;
    }

    // Builds the PNG IOPaint expects: white where mask is true, black elsewhere.
    private static byte[] EncodeMaskPng(bool[,] mask, int width, int height)
    {
        var white = new Rgba32(255, 255, 255, 255);
        var black = new Rgba32(0, 0, 0, 255);

        using var img = new Image<Rgba32>(width, height, black);
        img.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < height; y++)
            {
                Span<Rgba32> row = accessor.GetRowSpan(y);
                for (int x = 0; x < width; x++)
                {
                    if (mask[y, x])
                    {
                        row[x] = white;
                    }
                }
            }
        });

        using var ms = new MemoryStream();
        img.Save(ms, new PngEncoder());
        return ms.ToArray();
    }

    // Per-product min/max x,y over the matched outline pixels. Uses `matched`
    // (the original outline mask, not the padded `thickened` band) so the bbox
    // traces the actual silhouette. Products that weren't detected get
    // Rectangle.Empty so the paste step skips them.
    private static Rectangle[] ComputeBoundingBoxes(int[,] matched, int productCount, int height, int width)
    {
        var bboxes = new Rectangle[productCount];
        if (productCount == 0)
        {
            return bboxes;
        }

        int[] minX = new int[productCount];
        int[] maxX = new int[productCount];
        int[] minY = new int[productCount];
        int[] maxY = new int[productCount];
        bool[] seen = new bool[productCount];
        for (int i = 0; i < productCount; i++)
        {
            minX[i] = int.MaxValue;
            minY[i] = int.MaxValue;
            maxX[i] = int.MinValue;
            maxY[i] = int.MinValue;
        }

        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int idx = matched[y, x];
                if (idx < 0 || idx >= productCount)
                {
                    continue;
                }

                seen[idx] = true;
                if (x < minX[idx])
                {
                    minX[idx] = x;
                }

                if (x > maxX[idx])
                {
                    maxX[idx] = x;
                }

                if (y < minY[idx])
                {
                    minY[idx] = y;
                }

                if (y > maxY[idx])
                {
                    maxY[idx] = y;
                }
            }
        }

        for (int i = 0; i < productCount; i++)
        {
            bboxes[i] = seen[i]
                ? new Rectangle(minX[i], minY[i], (maxX[i] - minX[i]) + 1, (maxY[i] - minY[i]) + 1)
                : Rectangle.Empty;
        }

        return bboxes;
    }

    // Loads the LaMa-cleaned image, then for each product with both an
    // ImageBase64 payload and a non-empty bbox: trims the product PNG to its
    // opaque content, scales it so its VISUAL AREA matches the median bbox
    // area (so a tall bottle and a square box render at similar perceived
    // sizes), clamps the result so it can't overflow its own placeholder
    // bbox, and anchors at the bbox's bottom-left corner so all products
    // sit on a common baseline (like items on a shelf).
    private static byte[] PasteProducts(
        byte[] cleanedBytes,
        IReadOnlyList<CatalogProductItem> products,
        Rectangle[] boundingBoxes,
        ILogger? logger)
    {
        using var canvas = Image.Load<Rgba32>(cleanedBytes);

        long medianArea = ComputeMedianBboxArea(boundingBoxes);
        if (medianArea <= 0)
        {
            using var msEmpty = new MemoryStream();
            canvas.Save(msEmpty, new PngEncoder());
            return msEmpty.ToArray();
        }

        // PasteScaleFactor is a linear factor, so square it for area math.
        double targetArea = medianArea * PasteScaleFactor * PasteScaleFactor;

        for (int i = 0; i < products.Count; i++)
        {
            if (i >= boundingBoxes.Length)
            {
                break;
            }

            Rectangle bbox = boundingBoxes[i];
            string? imageBase64 = products[i].ImageBase64;
            if (bbox.Width <= 0 || bbox.Height <= 0 || string.IsNullOrWhiteSpace(imageBase64))
            {
                logger?.LogWarning(
                    "  skip paste '{Name}': bbox=({X},{Y},{W},{H}) hasImage={HasImg}",
                    products[i].Name,
                    bbox.X,
                    bbox.Y,
                    bbox.Width,
                    bbox.Height,
                    !string.IsNullOrWhiteSpace(imageBase64));
                continue;
            }

            using var productImg = Image.Load<Rgba32>(DecodeBase64Image(imageBase64));

            // Trim transparent padding so scaling is based on actual product
            // content, not surrounding empty pixels. Opaque photos return the
            // full image bounds (no-op crop). Skip only if fully transparent.
            Rectangle? opaque = FindOpaqueBoundingBox(productImg);
            if (opaque is Rectangle trim && (trim.Width < productImg.Width || trim.Height < productImg.Height))
            {
                productImg.Mutate(ctx => ctx.Crop(trim));
            }

            // Area-based scaling: scale so productW * productH ~= targetArea,
            // independent of aspect ratio. Tall and square products end up
            // covering similar visual area.
            long productArea = (long)productImg.Width * productImg.Height;
            double areaScale = Math.Sqrt(targetArea / Math.Max(1.0, productArea));
            int targetW = Math.Max(1, (int)(productImg.Width * areaScale));
            int targetH = Math.Max(1, (int)(productImg.Height * areaScale));

            // Clamp so the pasted product never overflows its placeholder.
            if (targetW > bbox.Width)
            {
                double clamp = (double)bbox.Width / targetW;
                targetW = bbox.Width;
                targetH = Math.Max(1, (int)(targetH * clamp));
            }

            if (targetH > bbox.Height)
            {
                double clamp = (double)bbox.Height / targetH;
                targetH = bbox.Height;
                targetW = Math.Max(1, (int)(targetW * clamp));
            }

            productImg.Mutate(ctx => ctx.Resize(targetW, targetH));

            // Bottom-left anchor: align the product's bottom-left corner to
            // the placeholder's bottom-left corner so products "stand" on a
            // common baseline. Easier to scan visually than centred placement.
            int pasteX = bbox.X;
            int pasteY = (bbox.Y + bbox.Height) - targetH;

            logger?.LogInformation(
                "  paste '{Name}' at ({PX},{PY}) size {W}x{H} (bbox=({BX},{BY},{BW},{BH}))",
                products[i].Name,
                pasteX,
                pasteY,
                targetW,
                targetH,
                bbox.X,
                bbox.Y,
                bbox.Width,
                bbox.Height);

            canvas.Mutate(ctx => ctx.DrawImage(productImg, new Point(pasteX, pasteY), 1f));
        }

        using var ms = new MemoryStream();
        canvas.Save(ms, new PngEncoder());
        return ms.ToArray();
    }

    // Median bbox area across detected products. Median is robust against the
    // occasional over-detection that produces a wildly large or small bbox.
    private static long ComputeMedianBboxArea(Rectangle[] boundingBoxes)
    {
        var areas = new List<long>();
        foreach (Rectangle b in boundingBoxes)
        {
            if (b.Width > 0 && b.Height > 0)
            {
                areas.Add((long)b.Width * b.Height);
            }
        }

        if (areas.Count == 0)
        {
            return 0;
        }

        areas.Sort();
        return areas[areas.Count / 2];
    }

    // Mass-weighted centroid of matched pixels per product. Less sensitive to
    // halo / outlier pixels than the bbox centre, so the paste lands roughly
    // where the bulk of the outline actually is.
    private static (int X, int Y)[] ComputeCentroids(
        int[,] matched, int productCount, int height, int width)
    {
        var centroids = new (int X, int Y)[productCount];
        if (productCount == 0)
        {
            return centroids;
        }

        long[] sumX = new long[productCount];
        long[] sumY = new long[productCount];
        int[] counts = new int[productCount];

        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int idx = matched[y, x];
                if (idx < 0 || idx >= productCount)
                {
                    continue;
                }

                sumX[idx] += x;
                sumY[idx] += y;
                counts[idx]++;
            }
        }

        for (int i = 0; i < productCount; i++)
        {
            centroids[i] = counts[i] > 0
                ? ((int)(sumX[i] / counts[i]), (int)(sumY[i] / counts[i]))
                : (width / 2, height / 2);
        }

        return centroids;
    }

    // Scans the alpha channel and returns the tight bounding box of pixels
    // whose alpha is at least `alphaThreshold`. Used to ignore transparent
    // padding around product PNGs so CONTAIN-fit math is based on the real
    // content. Returns null when the image is fully transparent.
    private static Rectangle? FindOpaqueBoundingBox(Image<Rgba32> img, byte alphaThreshold = 16)
    {
        int minX = int.MaxValue;
        int maxX = int.MinValue;
        int minY = int.MaxValue;
        int maxY = int.MinValue;
        bool any = false;

        img.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < accessor.Height; y++)
            {
                Span<Rgba32> row = accessor.GetRowSpan(y);
                for (int x = 0; x < row.Length; x++)
                {
                    if (row[x].A >= alphaThreshold)
                    {
                        any = true;
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

        if (!any)
        {
            return null;
        }

        return new Rectangle(minX, minY, (maxX - minX) + 1, (maxY - minY) + 1);
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
