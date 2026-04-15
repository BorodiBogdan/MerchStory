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

    public static ImageGenerationResult Composite(CatalogOnWallpaperApiRequest request)
    {
        var (canvasW, canvasH) = CanvasSize(request.Format);

        byte[] wallpaperBytes = DecodeBase64Image(request.WallpaperBase64);
        using var canvas = Image.Load<Rgba32>(wallpaperBytes);
        canvas.Mutate(ctx => ctx.Resize(new ResizeOptions
        {
            Size = new Size(canvasW, canvasH),
            Mode = ResizeMode.Pad,
        }));

        var products = request.Products ?? [];
        var productImages = new List<Image<Rgba32>?>(products.Count);
        foreach (var p in products)
        {
            productImages.Add(!string.IsNullOrWhiteSpace(p.ImageBase64)
                ? Image.Load<Rgba32>(DecodeBase64Image(p.ImageBase64))
                : null);
        }

        var textStyle = request.TextStyle ?? new TextStyleOptions();

        try
        {
            var cells = ComputeCells(request.Layout, products.Count, canvasW, canvasH, request.PlacementZone);
            var (nameFont, priceFont) = ResolveFonts(textStyle);

            for (int i = 0; i < products.Count && i < cells.Count; i++)
            {
                DrawCard(canvas, cells[i], products[i], productImages[i], request.ShowPrices, nameFont, priceFont, textStyle);
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

    // ── Canvas size ───────────────────────────────────────────────────────────
    private static (int W, int H) CanvasSize(string format) => format switch
    {
        "Portrait" => (1080, 1350),
        "Story" => (1080, 1920),
        _ => (1080, 1080),
    };

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
            DrawProductImageCentered(canvas, productImg, inner, product, showPrices, nameFont, priceFont, style);
        }
        else
        {
            DrawTextOnly(canvas, product, showPrices, inner, nameFont, priceFont, style);
        }
    }

    private static void DrawProductImageCentered(
        Image<Rgba32> canvas,
        Image<Rgba32> productImg,
        Rectangle inner,
        CatalogProductApiItem product,
        bool showPrices,
        Font? nameFont,
        Font? priceFont,
        TextStyleOptions style)
    {
        const int TextGap = 10;
        const int PanelPadV = 8;

        bool hasName = nameFont != null && !string.IsNullOrWhiteSpace(product.Name);
        bool hasPrice = showPrices && priceFont != null;

        // Use reference strings for height so ALL cards in the same row measure identical values
        // and therefore share the same panelY — this keeps prices colinear across a row.
        float nameH = hasName ? MeasureTextHeight(nameFont!, "Ag") : 0f;
        float priceH = hasPrice ? MeasureTextHeight(priceFont!, "$0.00") : 0f;

        const int ImgBottomPad = 8;

        // Panel height is deterministic (depends only on fonts, not on product data)
        int panelH = 0;
        if (hasName || hasPrice)
        {
            panelH = PanelPadV * 2;
            if (hasName)
            {
                panelH += (int)nameH + TextGap;
            }

            if (hasPrice)
            {
                panelH += (int)priceH + TextGap;
            }

            panelH -= TextGap;
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

        if (panelH == 0)
        {
            return;
        }

        int panelY = imgY + imgH + ImgBottomPad + PriceGap;
        int currentY = panelY + PanelPadV;

        if (hasName)
        {
            DrawStyledText(canvas, product.Name, nameFont!, inner.X, currentY, inner.Width, style, isPrice: false);
            currentY += (int)nameH + TextGap;
        }

        if (hasPrice)
        {
            if ((style.PriceBadge ?? "None") == "Pill")
            {
                DrawPriceBadge(canvas, FormatPrice(product.Price), priceFont!, inner.X, currentY, inner.Width, style);
            }

            DrawStyledText(canvas, FormatPrice(product.Price), priceFont!, inner.X, currentY, inner.Width, style, isPrice: true);
        }
    }

    private static void DrawTextOnly(
        Image<Rgba32> canvas,
        CatalogProductApiItem product,
        bool showPrices,
        Rectangle inner,
        Font? nameFont,
        Font? priceFont,
        TextStyleOptions style)
    {
        if (nameFont == null)
        {
            return;
        }

        string line1 = product.Name;
        string? line2 = showPrices ? FormatPrice(product.Price) : null;

        float h1 = MeasureTextHeight(nameFont, line1);
        float h2 = line2 != null && priceFont != null
            ? MeasureTextHeight(priceFont, line2) + PriceGap
            : 0;
        float totalH = h1 + h2;
        float startY = inner.Y + ((inner.Height - totalH) / 2f);

        DrawStyledText(canvas, line1, nameFont, inner.X, (int)startY, inner.Width, style, isPrice: false);

        if (line2 != null && priceFont != null)
        {
            DrawStyledText(canvas, line2, priceFont, inner.X, (int)(startY + h1 + PriceGap), inner.Width, style, isPrice: true);
        }
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
        float textH = TextMeasurer.MeasureSize(text, opts).Height;

        const int PadH = 14;
        const int PadV = 6;
        float badgeW = textW + (PadH * 2);
        float badgeH = textH + (PadV * 2);
        float badgeX = areaX + ((areaW - badgeW) / 2f);
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

        canvas.Mutate(ctx => ctx.DrawImage(layer, new Point((int)badgeX, (int)badgeY), 165f / 255f));
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
                Color outlineColor = ContrastColor(primary);
                var pen = Pens.Solid(outlineColor, 1.5f);
                canvas.Mutate(ctx => ctx.DrawText(opts, text, brush, pen));
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
                var pen = Pens.Solid(ContrastColor(charColor), 1.5f);
                canvas.Mutate(ctx => ctx.DrawText(charOpts, ch, charBrush, pen));
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
    private static string FormatPrice(decimal price) => $"${price:F2}";

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
