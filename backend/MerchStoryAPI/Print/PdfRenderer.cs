using QRCoder;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace MerchStoryAPI.Print;

public sealed record PdfRenderOptions(
    string PaperSize,
    string Orientation,
    string? QrSlugUrl,
    string? FooterText);

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
        byte[]? qrPng = options.QrSlugUrl is not null ? GenerateQrPng(options.QrSlugUrl) : null;

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(pageSize);
                page.Margin(0);
                page.Background().Image(imageBytes).FitArea();

                if (qrPng is not null)
                {
                    // Bottom-right QR badge floats above the image without disturbing
                    // its full-bleed layout. White card behind the QR keeps it readable
                    // regardless of what the underlying image looks like.
                    page.Foreground()
                        .AlignBottom()
                        .AlignRight()
                        .PaddingRight(8)
                        .PaddingBottom(8)
                        .Background(Colors.White)
                        .Padding(6)
                        .Width(80)
                        .Height(80)
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

    private static byte[] GenerateQrPng(string url)
    {
        using var qrGenerator = new QRCodeGenerator();
        using QRCodeData qrData = qrGenerator.CreateQrCode(url, QRCodeGenerator.ECCLevel.Q);
        var pngQr = new PngByteQRCode(qrData);
        return pngQr.GetGraphic(20);
    }
}
