using QRCoder;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace MerchStoryAPI.Print;

public sealed record PdfRenderOptions(
    string PaperSize,
    string Orientation,
    string? QrSlugUrl,
    string? FooterText,
    double QrX = 1.0,
    double QrY = 1.0,
    int QrSizePt = 80,
    bool QrTransparent = false);

public sealed class PdfRenderer
{
    static PdfRenderer()
    {
        // QuestPDF requires a license to be set before any document is generated.
        // Community license is free for revenue under $1M USD/year.
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public byte[] Render(byte[] imageBytes, PdfRenderOptions options)
    {
        PageSize pageSize = ResolvePageSize(options.PaperSize, options.Orientation);
        byte[]? qrPng = options.QrSlugUrl is not null
            ? GenerateQrPng(options.QrSlugUrl, options.QrTransparent)
            : null;

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(pageSize);
                page.Margin(0);
                page.Background().Image(imageBytes).FitUnproportionally();

                if (qrPng is not null)
                {
                    // Transparent QR sits directly on the artwork — no white card.
                    // Position is absolute via top-left padding so the user can drag
                    // the QR anywhere on the page from the client.
                    int qrSizePt = options.QrSizePt;
                    float pageW = pageSize.Width;
                    float pageH = pageSize.Height;
                    float maxX = Math.Max(0f, pageW - qrSizePt);
                    float maxY = Math.Max(0f, pageH - qrSizePt);
                    float xPt = (float)Math.Clamp(options.QrX, 0.0, 1.0) * maxX;
                    float yPt = (float)Math.Clamp(options.QrY, 0.0, 1.0) * maxY;

                    page.Foreground()
                        .AlignTop()
                        .AlignLeft()
                        .PaddingLeft(xPt)
                        .PaddingTop(yPt)
                        .Width(qrSizePt)
                        .Height(qrSizePt)
                        .Image(qrPng);
                }

                if (!string.IsNullOrWhiteSpace(options.FooterText))
                {
                    page.Foreground()
                        .AlignBottom()
                        .AlignLeft()
                        .PaddingLeft(8)
                        .PaddingBottom(8)
                        .Background(Colors.White)
                        .Padding(6)
                        .Text(options.FooterText)
                        .FontSize(10)
                        .FontColor(Colors.Black);
                }
            });
        }).GeneratePdf();
    }

    private static PageSize ResolvePageSize(string paperSize, string orientation)
    {
        PageSize basis = paperSize.ToUpperInvariant() switch
        {
            "A3" => PageSizes.A3,
            "A5" => PageSizes.A5,
            "A6" => PageSizes.A6,
            _ => PageSizes.A4,
        };

        return string.Equals(orientation, "landscape", StringComparison.OrdinalIgnoreCase)
            ? basis.Landscape()
            : basis.Portrait();
    }

    private static byte[] GenerateQrPng(string url, bool transparent)
    {
        using var qrGenerator = new QRCodeGenerator();
        using QRCodeData qrData = qrGenerator.CreateQrCode(url, QRCodeGenerator.ECCLevel.Q);
        var pngQr = new PngByteQRCode(qrData);

        // Light pixels are fully transparent in transparent mode, opaque white
        // otherwise. Dark modules stay opaque black either way.
        byte lightAlpha = transparent ? (byte)0 : (byte)255;
        return pngQr.GetGraphic(20, [0, 0, 0, 255], [255, 255, 255, lightAlpha]);
    }
}
