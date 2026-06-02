using System.Reflection;
using MerchStoryImageGeneration.Models;
using SixLabors.Fonts;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Drawing;
using SixLabors.ImageSharp.Drawing.Processing;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace MerchStoryAPI.ImageGeneration;

internal sealed record TextStyleOptions(
    string? FontFamily = "Modern",
    string? FontSize = "Medium",
    string? NameColor = "#1e1e1e",
    string? PriceColor = null,
    string? ColorMode = "Solid",
    string? GradientEndColor = null,
    string? TextEffect = "Shadow",
    string? PriceBadge = "None");

internal static class CatalogCompositor
{
    private const int OuterMargin = 20;
    private const int ZoneInnerPadding = 12;
    private const int CellGap = 8;
    private const int CardPadding = 8;

    private const int PriceGap = 6;

    private const int TargetWidth = 1080;

    // productImagesBase64 carries each product's photo, resolved server-side from blob
    // storage and aligned by index with request.Products (null where the product has no image).
    public static ImageGenerationResult Composite(
        CatalogOnWallpaperApiRequest request,
        IReadOnlyList<string?> productImagesBase64)
    {
        byte[] wallpaperBytes = DecodeBase64Image(request.WallpaperBase64);
        using var canvas = Image.Load<Rgba32>(wallpaperBytes);

        // Normalize to 1080 px wide (preserve aspect ratio, no letterboxing).
        // Font sizes and margins are tuned for this width; other resolutions cause overflow.
        if (canvas.Width != TargetWidth)
        {
            int targetH = (int)Math.Round((double)canvas.Height * TargetWidth / canvas.Width);
            canvas.Mutate(ctx => ctx.Resize(TargetWidth, Math.Max(1, targetH)));
        }

        int canvasW = canvas.Width;
        int canvasH = canvas.Height;

        var products = request.Products ?? [];
        var productImages = new List<Image<Rgba32>?>(products.Count);
        for (int i = 0; i < products.Count; i++)
        {
            string? imageBase64 = i < productImagesBase64.Count ? productImagesBase64[i] : null;
            productImages.Add(!string.IsNullOrWhiteSpace(imageBase64)
                ? Image.Load<Rgba32>(DecodeBase64Image(imageBase64))
                : null);
        }

        var textStyle = request.TextStyle ?? new TextStyleOptions();

        try
        {
            var cells = ComputeCells(request.Layout, products.Count, canvasW, canvasH, request.PlacementZone);
            var (nameFont, priceFont) = ResolveFonts(textStyle);

            for (int i = 0; i < products.Count && i < cells.Count; i++)
            {
                DrawCard(canvas, cells[i], products[i], productImages[i], request.ShowProductNames, request.ShowPrices, nameFont, priceFont, textStyle);
            }

            using var ms = new MemoryStream();
            canvas.Save(ms, new PngEncoder());
            return new ImageGenerationResult(ms.ToArray(), "image/png");
        }
        finally
        {
            foreach (var img in productImages)
            {
                img?.Dispose();
            }
        }
    }

    // ── Cell layout ───────────────────────────────────────────────────────────
    private static List<Rectangle> ComputeCells(
        string layout,
        int count,
        int canvasW,
        int canvasH,
        PlacementZone? zone = null)
    {
        int usableX, usableY, usableW, usableH;

        if (zone is not null)
        {
            usableX = (int)Math.Round(zone.X * canvasW) + ZoneInnerPadding;
            usableY = (int)Math.Round(zone.Y * canvasH) + ZoneInnerPadding;
            usableW = (int)Math.Round(zone.Width * canvasW) - (ZoneInnerPadding * 2);
            usableH = (int)Math.Round(zone.Height * canvasH) - (ZoneInnerPadding * 2);
            usableX = Math.Clamp(usableX, 0, canvasW - 1);
            usableY = Math.Clamp(usableY, 0, canvasH - 1);
            usableW = Math.Clamp(usableW, 1, canvasW - usableX);
            usableH = Math.Clamp(usableH, 1, canvasH - usableY);
        }
        else
        {
            usableX = OuterMargin;
            usableY = OuterMargin;
            usableW = canvasW - (OuterMargin * 2);
            usableH = canvasH - (OuterMargin * 2);
        }

        return layout switch
        {
            "Showcase" => ShowcaseCells(count, usableX, usableY, usableW, usableH),
            _ => StoryCells(count, usableX, usableY, usableW, usableH),
        };
    }

    private static List<Rectangle> ShowcaseCells(int count, int x, int y, int w, int h)
    {
        if (count <= 1)
        {
            return StoryCells(count, x, y, w, h);
        }

        int heroW = (int)(w * 0.55);
        int sideW = w - heroW - CellGap;

        // With 4+ products put 2 items in the hero column so neither column is too sparse.
        int heroCount = count >= 4 ? 2 : 1;
        int sideCount = count - heroCount;

        int heroH = heroCount == 1 ? h : (h - CellGap) / 2;
        int sideH = sideCount == 1 ? h : (h - (CellGap * (sideCount - 1))) / sideCount;

        var cells = new List<Rectangle>(count);

        for (int i = 0; i < heroCount; i++)
        {
            cells.Add(new Rectangle(x, y + (i * (heroH + CellGap)), heroW, heroH));
        }

        for (int i = 0; i < sideCount; i++)
        {
            cells.Add(new Rectangle(
                x + heroW + CellGap,
                y + (i * (sideH + CellGap)),
                sideW,
                sideH));
        }

        return cells;
    }

    private static List<Rectangle> StoryCells(int count, int x, int y, int w, int h)
    {
        if (count == 0)
        {
            return [];
        }

        // Use 2 columns when there are more than 3 products so cells stay large enough.
        if (count > 3)
        {
            int cols = 2;
            int rows = (int)Math.Ceiling((double)count / cols);
            int cellW = (w - CellGap) / cols;
            int rawCellH = (h - (CellGap * (rows - 1))) / rows;
            int cellH = rows > 1 ? Math.Min(rawCellH, w / 2) : rawCellH;
            int lastRowCount = count - ((rows - 1) * cols);

            var cells = new List<Rectangle>(count);
            for (int i = 0; i < count; i++)
            {
                int col = i % cols;
                int row = i / cols;
                bool isLastRow = row == rows - 1;
                int rowItemCount = isLastRow ? lastRowCount : cols;
                int rowTotalW = (rowItemCount * cellW) + (CellGap * (rowItemCount - 1));
                int rowStartX = x + ((w - rowTotalW) / 2);

                cells.Add(new Rectangle(
                    rowStartX + (col * (cellW + CellGap)),
                    y + (row * (cellH + CellGap)),
                    cellW,
                    cellH));
            }

            return cells;
        }

        // 1–3 products: single column, full-width rows.
        int rawSingleH = (h - (CellGap * (count - 1))) / count;
        int singleCellH = count > 1 ? Math.Min(rawSingleH, w / 2) : rawSingleH;
        var singleCells = new List<Rectangle>(count);
        for (int i = 0; i < count; i++)
        {
            singleCells.Add(new Rectangle(x, y + (i * (singleCellH + CellGap)), w, singleCellH));
        }

        return singleCells;
    }

    // ── Card drawing ──────────────────────────────────────────────────────────
    private static void DrawCard(
        Image<Rgba32> canvas,
        Rectangle cell,
        CatalogProductApiItem product,
        Image<Rgba32>? productImg,
        bool showProductNames,
        bool showPrices,
        Font? nameFont,
        Font? priceFont,
        TextStyleOptions style)
    {
        var inner = new Rectangle(
            cell.X + CardPadding,
            cell.Y + CardPadding,
            cell.Width - (CardPadding * 2),
            cell.Height - (CardPadding * 2));

        if (productImg != null)
        {
            DrawProductImageCentered(canvas, productImg, inner, product, showProductNames, showPrices, nameFont, priceFont, style);
        }
        else
        {
            DrawTextOnly(canvas, product, showProductNames, showPrices, inner, nameFont, priceFont, style);
        }
    }

    private static void DrawProductImageCentered(
        Image<Rgba32> canvas,
        Image<Rgba32> productImg,
        Rectangle inner,
        CatalogProductApiItem product,
        bool showProductNames,
        bool showPrices,
        Font? nameFont,
        Font? priceFont,
        TextStyleOptions style)
    {
        const int PanelPadV = 8;
        bool hasPill = (style.PriceBadge ?? "None") == "Pill";
        bool hasSticker = (style.PriceBadge ?? "None") == "Sticker";

        // Larger name→price gap when a pill is drawn so the pill's PadV (10) doesn't
        // push the pill against the name baseline.
        int textGap = hasPill ? 14 : 10;

        bool hasName = showProductNames && nameFont != null && !string.IsNullOrWhiteSpace(product.Name);
        bool hasPrice = showPrices && priceFont != null;

        // Sticker badge overlays the image (bottom-right), so the price doesn't
        // take any vertical space in the below-image text panel. The panel only
        // contains the name in that mode.
        bool priceInPanel = hasPrice && !hasSticker;

        // Name-only (in the panel): scale the name font up toward the price-font size but
        // clamp so the rendered string fits the cell width (the "allocated space for the
        // image"). Sticker mode also uses the panel for the name alone, so it benefits too.
        Font? effectiveNameFont = nameFont;
        if (hasName && !priceInPanel)
        {
            effectiveNameFont = UpsizeNameFont(nameFont!, priceFont, product.Name, inner.Width);
        }

        // Use reference strings for height so ALL cards in the same row measure identical values
        // and therefore share the same panelY — this keeps prices colinear across a row.
        float nameH = hasName ? MeasureTextHeight(effectiveNameFont!, "Ag") : 0f;

        // When a pill is drawn, reserve the full line-advance + 2*PadV vertical
        // space (pill extends beyond the tight glyph box) so the cell layout
        // allocates room for the pill's bottom edge rather than clipping it.
        float priceH = priceInPanel
            ? (hasPill
                ? TextMeasurer.MeasureAdvance("$0.00", new TextOptions(priceFont!)).Height + 20f
                : MeasureTextHeight(priceFont!, "$0.00"))
            : 0f;

        const int ImgBottomPad = 8;

        // Panel height is deterministic (depends only on fonts, not on product data)
        int panelH = 0;
        if (hasName || priceInPanel)
        {
            panelH = PanelPadV * 2;
            if (hasName)
            {
                panelH += (int)nameH + textGap;
            }

            if (priceInPanel)
            {
                panelH += (int)priceH + textGap;
            }

            panelH -= textGap;
        }

        // Space available for the image (above the price panel)
        int textBlockH = panelH > 0 ? ImgBottomPad + PriceGap + panelH : 0;
        int availForImage = inner.Height - textBlockH;
        if (availForImage <= 0)
        {
            return;
        }

        float scale = Math.Min(
            (float)inner.Width / productImg.Width,
            (float)availForImage / productImg.Height);
        int imgW = (int)(productImg.Width * scale);
        int imgH = (int)(productImg.Height * scale);

        // Center the image+price block vertically so dead space is split evenly above and below
        int contentH = imgH + textBlockH;
        int topPad = Math.Max(0, (inner.Height - contentH) / 2);

        int imgX = inner.X + ((inner.Width - imgW) / 2);
        int imgY = inner.Y + topPad;

        using Image<Rgba32> resized = productImg.Clone(ctx => ctx.Resize(imgW, imgH));
        canvas.Mutate(ctx => ctx.DrawImage(resized, new Point(imgX, imgY), 1f));

        // Sticker price-badge is pinned to the bottom-right of the product image so
        // the price reads as a retail-flyer chip rather than a caption below the card.
        if (hasSticker && hasPrice)
        {
            DrawStickerBadge(canvas, FormatPrice(product), priceFont!, imgX, imgY, imgW, imgH, inner, style);
        }

        if (panelH == 0)
        {
            return;
        }

        int panelY = imgY + imgH + ImgBottomPad + PriceGap;
        int currentY = panelY + PanelPadV;

        if (hasName)
        {
            DrawStyledText(canvas, product.Name, effectiveNameFont!, inner.X, currentY, inner.Width, style, isPrice: false);
            currentY += (int)nameH + textGap;
        }

        if (priceInPanel)
        {
            if (hasPill)
            {
                DrawPriceBadge(canvas, FormatPrice(product), priceFont!, inner.X, currentY, inner.Width, style);
            }

            DrawStyledText(canvas, FormatPrice(product), priceFont!, inner.X, currentY, inner.Width, style, isPrice: true);
        }
    }

    private static void DrawTextOnly(
        Image<Rgba32> canvas,
        CatalogProductApiItem product,
        bool showProductNames,
        bool showPrices,
        Rectangle inner,
        Font? nameFont,
        Font? priceFont,
        TextStyleOptions style)
    {
        // Sticker badge anchors to a product image; with no image, fall back to Pill
        // so the price still reads as a badge rather than disappearing.
        if ((style.PriceBadge ?? "None") == "Sticker")
        {
            style = style with { PriceBadge = "Pill" };
        }

        string? line1 = showProductNames && nameFont != null ? product.Name : null;
        string? line2 = showPrices && priceFont != null ? FormatPrice(product) : null;

        if (line1 == null && line2 == null)
        {
            return;
        }

        Font? effectiveNameFont = nameFont;
        if (line1 != null && line2 == null)
        {
            effectiveNameFont = UpsizeNameFont(nameFont!, priceFont, line1, inner.Width);
        }

        float h1 = line1 != null ? MeasureTextHeight(effectiveNameFont!, line1) : 0f;
        float h2 = line2 != null ? MeasureTextHeight(priceFont!, line2) : 0f;
        float gap = line1 != null && line2 != null ? PriceGap : 0f;
        float totalH = h1 + gap + h2;
        float startY = inner.Y + ((inner.Height - totalH) / 2f);

        if (line1 != null)
        {
            DrawStyledText(canvas, line1, effectiveNameFont!, inner.X, (int)startY, inner.Width, style, isPrice: false);
        }

        if (line2 != null)
        {
            float priceY = line1 != null ? startY + h1 + gap : startY;
            DrawStyledText(canvas, line2, priceFont!, inner.X, (int)priceY, inner.Width, style, isPrice: true);
        }
    }

    // When the price line is hidden, scale the name up toward the price-font size so
    // the name doesn't look undersized alone. Shrink if the rendered string would
    // overflow the cell width (the "allocated space for the image").
    private static Font UpsizeNameFont(Font nameFont, Font? priceFont, string text, int maxWidth)
    {
        const int SidePad = 8;
        float targetSize = priceFont?.Size ?? nameFont.Size * 2.5f;
        if (targetSize <= nameFont.Size)
        {
            return nameFont;
        }

        var candidate = new Font(nameFont, targetSize);
        float width = TextMeasurer.MeasureSize(text, new TextOptions(candidate)).Width;
        float avail = Math.Max(1, maxWidth - SidePad);
        if (width > avail)
        {
            targetSize *= avail / width;
        }

        return targetSize > nameFont.Size ? new Font(nameFont, targetSize) : nameFont;
    }

    // ── Font resolution ───────────────────────────────────────────────────────
    private static (Font? Name, Font? Price) ResolveFonts(TextStyleOptions style)
    {
        float nameSize = (style.FontSize ?? "Medium") switch
        {
            "Small" => 22f,
            "Large" => 32f,
            _ => 18f,
        };
        float priceSize = (style.FontSize ?? "Medium") switch
        {
            "Small" => 40f,
            "Large" => 60f,
            _ => 54f,
        };

        var collection = new FontCollection();
        FontFamily? family = LoadEmbeddedFamily(collection, style.FontFamily ?? "Modern");

        if (family is null)
        {
            // Fall back to system fonts
            string[] candidates = ["Arial", "Liberation Sans", "DejaVu Sans", "FreeSans", "Helvetica"];
            foreach (string name in candidates)
            {
                if (SystemFonts.TryGet(name, out FontFamily sysFamily))
                {
                    return (sysFamily.CreateFont(nameSize, FontStyle.Regular),
                            sysFamily.CreateFont(priceSize, FontStyle.Bold));
                }
            }

            FontFamily? first = SystemFonts.Families.FirstOrDefault();
            if (first is { } f)
            {
                return (f.CreateFont(nameSize, FontStyle.Regular), f.CreateFont(priceSize, FontStyle.Bold));
            }

            return (null, null);
        }

        // For "Elegant" and "Bold" we only have one weight embedded — use it for both
        bool hasBold = (style.FontFamily ?? "Modern") is "Modern" or "Friendly";
        FontStyle priceStyle = hasBold ? FontStyle.Bold : FontStyle.Regular;

        return (family.Value.CreateFont(nameSize, FontStyle.Regular),
                family.Value.CreateFont(priceSize, priceStyle));
    }

    private static FontFamily? LoadEmbeddedFamily(FontCollection collection, string fontChoice)
    {
        var assembly = Assembly.GetExecutingAssembly();
        string ns = "MerchStoryAPI.ImageGeneration.Fonts.";

        (string regular, string? bold) = fontChoice switch
        {
            "Elegant" => ($"{ns}PlayfairDisplay-Regular.ttf", null),
            "Bold" => ($"{ns}Montserrat-Bold.ttf", null),
            "Friendly" => ($"{ns}Lato-Regular.ttf", null),
            _ => ($"{ns}Inter-Regular.ttf", $"{ns}Inter-Bold.ttf"),  // Modern (default)
        };

        using Stream? regStream = assembly.GetManifestResourceStream(regular);
        if (regStream is null)
        {
            return null;
        }

        FontFamily family = collection.Add(regStream);

        if (bold is not null)
        {
            using Stream? boldStream = assembly.GetManifestResourceStream(bold);
            if (boldStream is not null)
            {
                collection.Add(boldStream);
            }
        }

        return family;
    }

    // ── Price badge drawing ───────────────────────────────────────────────────
    private static void DrawPriceBadge(
        Image<Rgba32> canvas,
        string text,
        Font font,
        int areaX,
        int areaY,
        int areaW,
        TextStyleOptions style)
    {
        var opts = new TextOptions(font);
        float textW = TextMeasurer.MeasureSize(text, opts).Width;

        // Use the font's advance (line) height rather than tight glyph bounds so the
        // pill fully encloses ascenders/descenders with equal padding on every side.
        float lineH = TextMeasurer.MeasureAdvance(text, opts).Height;

        const int PadH = 28;
        const int PadV = 10;
        float badgeW = textW + (PadH * 2);
        float badgeH = lineH + (PadV * 2);
        float badgeX = areaX + ((areaW - badgeW) / 2f);

        // Text is drawn with VerticalAlignment=Top at areaY, so the line box spans
        // [areaY, areaY + lineH]; center the pill on that range.
        float badgeY = areaY - PadV;

        // Badge fill is the contrast of the price text color so text is always legible.
        Color textColor = ParseHexColor(style.PriceColor ?? style.NameColor ?? "#1e1e1e");
        Color fillColor = ContrastColor(textColor);

        // Render pill on a separate layer with opaque fill, then composite at desired opacity.
        // This avoids double-alpha darkening at the cap/rect overlap joints.
        float r = badgeH / 2f;
        int bw = (int)Math.Ceiling(badgeW) + 2;
        int bh = (int)Math.Ceiling(badgeH) + 2;
        using var layer = new Image<Rgba32>(bw, bh, Color.Transparent);

        var localLeft = new EllipsePolygon(r, r, r);
        var localCenter = new RectangularPolygon(r, 0, badgeW - (2 * r), badgeH);
        var localRight = new EllipsePolygon(badgeW - r, r, r);

        layer.Mutate(ctx => ctx
            .Fill(fillColor, localLeft)
            .Fill(fillColor, localCenter)
            .Fill(fillColor, localRight));

        // Softer composite (110/255 ≈ 43%) so the pill reads as a translucent plate
        // rather than an opaque stamp — this was the "ugly chunky badge" look.
        canvas.Mutate(ctx => ctx.DrawImage(layer, new Point((int)badgeX, (int)badgeY), 110f / 255f));
    }

    // ── Sticker badge drawing ─────────────────────────────────────────────────
    // Retail-flyer style chip: opaque rounded rectangle pinned to the bottom-right
    // corner of the product image with a subtle drop shadow. Unlike the Pill badge
    // (translucent, below the image), the Sticker is fully opaque and overlays the
    // image edge so it reads as a price tag applied to the product itself.
    private static void DrawStickerBadge(
        Image<Rgba32> canvas,
        string text,
        Font font,
        int imgX,
        int imgY,
        int imgW,
        int imgH,
        Rectangle inner,
        TextStyleOptions style)
    {
        var opts = new TextOptions(font);
        float textW = TextMeasurer.MeasureSize(text, opts).Width;
        float lineH = TextMeasurer.MeasureAdvance(text, opts).Height;

        // Tighter padding than the Pill so the chip reads as a sticker, not a plate.
        const int PadH = 22;
        const int PadV = 8;
        float badgeW = textW + (PadH * 2);
        float badgeH = lineH + (PadV * 2);

        // Retail-flyer stickers are consistently white — this lets the chip read as
        // an applied price tag regardless of what color the user picks for the text.
        // EnsureReadableOn only intervenes when the user's color is too close to white
        // to stay legible (e.g. they pick white itself), flipping text to dark in that
        // edge case. Otherwise the text renders in exactly the picked color.
        Color textColor = ParseHexColor(style.PriceColor ?? style.NameColor ?? "#1e1e1e");
        Color fillColor = Color.FromRgba(255, 255, 255, 255);
        textColor = EnsureReadableOn(fillColor, textColor);

        // Position: anchor the sticker's bottom-right to the image's bottom-right with
        // a small outward overhang so the chip "sits on" the image edge rather than
        // entirely inside it. Then clamp to the cell's inner rectangle so it never
        // escapes its cell (important for small Showcase side-column cells).
        const int OverhangX = 8;
        const int OverhangY = 6;
        int badgeX = imgX + imgW - (int)badgeW + OverhangX;
        int badgeY = imgY + imgH - (int)badgeH + OverhangY;
        badgeX = Math.Min(badgeX, (inner.X + inner.Width) - (int)badgeW);
        badgeY = Math.Min(badgeY, (inner.Y + inner.Height) - (int)badgeH);
        badgeX = Math.Max(badgeX, inner.X);
        badgeY = Math.Max(badgeY, inner.Y);

        // Soft-rounded corners (radius = h/4) — not a full capsule like the Pill.
        float radius = Math.Max(4f, badgeH / 4f);

        // Render on a separate layer so the rounded shape is built from overlapping
        // primitives once, then composited cleanly (avoids seams between the rects
        // and corner ellipses at high DPI).
        const int LayerMargin = 8;
        int layerW = (int)Math.Ceiling(badgeW) + (LayerMargin * 2);
        int layerH = (int)Math.Ceiling(badgeH) + (LayerMargin * 2);
        using var layer = new Image<Rgba32>(layerW, layerH, Color.Transparent);

        // Drop shadow first (offset copy of the same shape), then the fill on top.
        var shadowColor = Color.FromRgba(0, 0, 0, 64);
        FillRoundedRect(layer, LayerMargin + 3, LayerMargin + 4, badgeW, badgeH, radius, shadowColor);
        FillRoundedRect(layer, LayerMargin, LayerMargin, badgeW, badgeH, radius, fillColor);

        // Price text centered inside the chip. Using VerticalAlignment=Center with
        // Origin at the chip's center accounts for font ascender/descender metrics.
        var textOpts = new RichTextOptions(font)
        {
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            Origin = new System.Numerics.Vector2(LayerMargin + (badgeW / 2f), LayerMargin + (badgeH / 2f)),
        };
        layer.Mutate(ctx => ctx.DrawText(textOpts, text, new SolidBrush(textColor)));

        canvas.Mutate(ctx => ctx.DrawImage(layer, new Point(badgeX - LayerMargin, badgeY - LayerMargin), 1f));
    }

    private static void FillRoundedRect(
        Image<Rgba32> target,
        float x,
        float y,
        float w,
        float h,
        float r,
        Color color)
    {
        // Rounded rect = horizontal bar + vertical bar + 4 corner circles.
        // The two bars overlap in the middle; the circles fill the corners.
        var horizontal = new RectangularPolygon(x, y + r, w, h - (2 * r));
        var vertical = new RectangularPolygon(x + r, y, w - (2 * r), h);
        var tl = new EllipsePolygon(x + r, y + r, r);
        var tr = new EllipsePolygon((x + w) - r, y + r, r);
        var bl = new EllipsePolygon(x + r, (y + h) - r, r);
        var br = new EllipsePolygon((x + w) - r, (y + h) - r, r);

        target.Mutate(ctx => ctx
            .Fill(color, horizontal)
            .Fill(color, vertical)
            .Fill(color, tl)
            .Fill(color, tr)
            .Fill(color, bl)
            .Fill(color, br));
    }

    // If the user's price/name color is too close to the sticker fill (e.g. white
    // on white), swap to black/white so the price stays legible.
    private static Color EnsureReadableOn(Color bg, Color fg)
    {
        var bgPx = bg.ToPixel<Rgba32>();
        var fgPx = fg.ToPixel<Rgba32>();
        float bgL = ((0.299f * bgPx.R) + (0.587f * bgPx.G) + (0.114f * bgPx.B)) / 255f;
        float fgL = ((0.299f * fgPx.R) + (0.587f * fgPx.G) + (0.114f * fgPx.B)) / 255f;
        if (Math.Abs(bgL - fgL) < 0.35f)
        {
            return bgL > 0.5f ? Color.FromRgba(30, 30, 30, 255) : Color.FromRgba(255, 255, 255, 255);
        }

        return fg;
    }

    // ── Styled text drawing ───────────────────────────────────────────────────
    private static void DrawStyledText(
        Image<Rgba32> canvas,
        string text,
        Font font,
        int areaX,
        int areaY,
        int areaW,
        TextStyleOptions style,
        bool isPrice)
    {
        string rawColor = isPrice && style.PriceColor is not null
            ? style.PriceColor
            : (style.NameColor ?? "#1e1e1e");

        Color primary = ParseHexColor(rawColor);
        string colorMode = style.ColorMode ?? "Solid";
        string effect = style.TextEffect ?? "Shadow";

        if (colorMode == "Rainbow")
        {
            DrawRainbowText(canvas, text, font, areaX, areaY, areaW, effect);
            return;
        }

        Brush brush = colorMode == "Gradient"
            ? BuildGradientBrush(style.NameColor ?? "#1e1e1e", style.GradientEndColor ?? "#6366F1", areaX, areaW)
            : new SolidBrush(primary);

        var opts = new RichTextOptions(font)
        {
            HorizontalAlignment = HorizontalAlignment.Center,
            Origin = new System.Numerics.Vector2(areaX + (areaW / 2f), areaY),
        };

        switch (effect)
        {
            case "Shadow":
                var shadowOpts = new RichTextOptions(font)
                {
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Origin = new System.Numerics.Vector2(areaX + (areaW / 2f) + 2, areaY + 2),
                };
                canvas.Mutate(ctx => ctx.DrawText(shadowOpts, text, new SolidBrush(Color.FromRgba(0, 0, 0, 100))));
                canvas.Mutate(ctx => ctx.DrawText(opts, text, brush));
                break;

            case "Outline":
                // Softened outline: contrast color at 85% alpha reads as an outline
                // rather than a harsh black stamp, especially against saturated fills.
                Rgba32 outlinePx = ContrastColor(primary).ToPixel<Rgba32>();
                Color outlineColor = Color.FromRgba(outlinePx.R, outlinePx.G, outlinePx.B, 217);

                // Stroke-first then fill-on-top: drawing stroke+fill in a single call
                // puts the stroke half-inside the glyph edge, which eats into the fill
                // and looks chunky. Drawing the stroke first at 2x thickness and then
                // overlaying the fill hides the inner half of the stroke, leaving only
                // a clean outer halo. Clamp keeps the visible stroke between 1.25–1.5 px
                // so 54 pt prices don't get a disproportionately thick halo that closes
                // over the counters of "0" / "e" glyphs.
                float strokeW = Math.Clamp(font.Size * 0.035f, 1.25f, 1.5f);
                var strokePen = new SolidPen(new PenOptions(outlineColor, strokeW * 2f)
                {
                    JointStyle = JointStyle.Round,
                    EndCapStyle = EndCapStyle.Round,
                });
                canvas.Mutate(ctx => ctx.DrawText(opts, text, new SolidBrush(outlineColor), strokePen));
                canvas.Mutate(ctx => ctx.DrawText(opts, text, brush));
                break;

            default:
                canvas.Mutate(ctx => ctx.DrawText(opts, text, brush));
                break;
        }
    }

    private static void DrawRainbowText(
        Image<Rgba32> canvas,
        string text,
        Font font,
        int areaX,
        int areaY,
        int areaW,
        string effect)
    {
        if (text.Length == 0)
        {
            return;
        }

        // Measure each character width to place them individually
        var opts = new TextOptions(font);
        float totalWidth = TextMeasurer.MeasureSize(text, opts).Width;
        float startX = areaX + ((areaW - totalWidth) / 2f);
        float currentX = startX;

        for (int i = 0; i < text.Length; i++)
        {
            float hue = (float)i / text.Length * 360f;
            Color charColor = HslToColor(hue, 0.8f, 0.45f);
            string ch = text[i].ToString();

            float charW = TextMeasurer.MeasureSize(ch, opts).Width;

            var charOpts = new RichTextOptions(font)
            {
                HorizontalAlignment = HorizontalAlignment.Left,
                Origin = new System.Numerics.Vector2(currentX, areaY),
            };

            Brush charBrush = new SolidBrush(charColor);

            if (effect == "Shadow")
            {
                var shadowOpts = new RichTextOptions(font)
                {
                    HorizontalAlignment = HorizontalAlignment.Left,
                    Origin = new System.Numerics.Vector2(currentX + 2, areaY + 2),
                };
                canvas.Mutate(ctx => ctx.DrawText(shadowOpts, ch, new SolidBrush(Color.FromRgba(0, 0, 0, 100))));
            }
            else if (effect == "Outline")
            {
                Rgba32 rainbowPx = ContrastColor(charColor).ToPixel<Rgba32>();
                Color charOutline = Color.FromRgba(rainbowPx.R, rainbowPx.G, rainbowPx.B, 217);
                float rainbowStroke = Math.Clamp(font.Size * 0.035f, 1.25f, 1.5f);
                var rainbowPen = new SolidPen(new PenOptions(charOutline, rainbowStroke * 2f)
                {
                    JointStyle = JointStyle.Round,
                    EndCapStyle = EndCapStyle.Round,
                });
                canvas.Mutate(ctx => ctx.DrawText(charOpts, ch, new SolidBrush(charOutline), rainbowPen));
                canvas.Mutate(ctx => ctx.DrawText(charOpts, ch, charBrush));
                currentX += charW;
                continue;
            }

            canvas.Mutate(ctx => ctx.DrawText(charOpts, ch, charBrush));
            currentX += charW;
        }
    }

    // ── Brush helpers ─────────────────────────────────────────────────────────
    private static Brush BuildGradientBrush(string startHex, string endHex, int areaX, int areaW)
    {
        Color start = ParseHexColor(startHex);
        Color end = ParseHexColor(endHex);
        var point1 = new System.Numerics.Vector2(areaX, 0);
        var point2 = new System.Numerics.Vector2(areaX + areaW, 0);
        return new LinearGradientBrush(
            point1,
            point2,
            GradientRepetitionMode.None,
            new ColorStop(0f, start),
            new ColorStop(1f, end));
    }

    private static Color ContrastColor(Color c)
    {
        var px = c.ToPixel<Rgba32>();
        float luminance = ((0.299f * px.R) + (0.587f * px.G) + (0.114f * px.B)) / 255f;
        return luminance > 0.5f ? Color.FromRgba(30, 30, 30, 255) : Color.FromRgba(255, 255, 255, 255);
    }

    private static Color ParseHexColor(string hex)
    {
        hex = hex.TrimStart('#');
        if (hex.Length == 6 &&
            byte.TryParse(hex[0..2], System.Globalization.NumberStyles.HexNumber, null, out byte r) &&
            byte.TryParse(hex[2..4], System.Globalization.NumberStyles.HexNumber, null, out byte g) &&
            byte.TryParse(hex[4..6], System.Globalization.NumberStyles.HexNumber, null, out byte b))
        {
            return Color.FromRgb(r, g, b);
        }

        return Color.FromRgb(30, 30, 30);
    }

    private static Color HslToColor(float h, float s, float l)
    {
        float c = (1f - Math.Abs((2f * l) - 1f)) * s;
        float x = c * (1f - Math.Abs(((h / 60f) % 2f) - 1f));
        float m = l - (c / 2f);

        float r, g, b;
        if (h < 60)
        {
            r = c;
            g = x;
            b = 0;
        }
        else if (h < 120)
        {
            r = x;
            g = c;
            b = 0;
        }
        else if (h < 180)
        {
            r = 0;
            g = c;
            b = x;
        }
        else if (h < 240)
        {
            r = 0;
            g = x;
            b = c;
        }
        else if (h < 300)
        {
            r = x;
            g = 0;
            b = c;
        }
        else
        {
            r = c;
            g = 0;
            b = x;
        }

        return Color.FromRgb(
            (byte)((r + m) * 255),
            (byte)((g + m) * 255),
            (byte)((b + m) * 255));
    }

    // ── Text measurement ──────────────────────────────────────────────────────
    private static float MeasureTextHeight(Font font, string text)
    {
        var opts = new TextOptions(font);
        return TextMeasurer.MeasureSize(text, opts).Height;
    }

    // ── Misc ──────────────────────────────────────────────────────────────────
    private static string FormatPrice(CatalogProductApiItem product) =>
        MerchStoryImageGeneration.Services.CurrencyFormatter.Format(product.Price, product.Currency);

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
}
