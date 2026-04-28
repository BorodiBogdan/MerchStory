using System.Security.Claims;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryAPI.Wallet;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using SixLabors.ImageSharp;

namespace MerchStoryAPI.Print;

public static class PrintRoutes
{
    private const int PrintCost = 1;

    // Pixel dimensions (short × long edge) needed for 300 DPI print quality.
    private static readonly Dictionary<string, (int Short, int Long)> RequiredPixels300Dpi = new(StringComparer.OrdinalIgnoreCase)
    {
        ["A6"] = (1240, 1748),
        ["A5"] = (1748, 2480),
        ["A4"] = (2480, 3508),
        ["A3"] = (3508, 4961),
    };

    private static readonly HashSet<string> AllowedPaperSizes = new(StringComparer.OrdinalIgnoreCase)
    {
        "A6", "A5", "A4", "A3",
    };

    public static void MapPrintEndpoints(this WebApplication app)
    {
        RouteGroupBuilder authed = app.MapGroup("/print").RequireAuthorization();

        authed.MapPost("/render", async (
            RenderPrintRequest req,
            ClaimsPrincipal principal,
            AppDbContext db,
            WalletService wallet,
            QrLinkService qrLinks,
            PdfRenderer renderer,
            IUpscaler upscaler,
            IConfiguration config,
            ILogger<PrintJob> logger,
            CancellationToken ct) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            string paperSize = (req.PaperSize ?? string.Empty).ToUpperInvariant();
            if (!AllowedPaperSizes.Contains(paperSize))
            {
                return Results.BadRequest(new { detail = "Unsupported paper size. Use A6, A5, A4, or A3." });
            }

            const string orientation = "portrait";
            const string qualityTier = "premium";

            GeneratedImage? source = await db.GeneratedImages
                .SingleOrDefaultAsync(g => g.Id == req.GeneratedImageId && g.UserId == userId, ct);
            if (source is null)
            {
                return Results.NotFound(new { detail = "Generated image not found." });
            }

            byte[] imageBytes = Convert.FromBase64String(source.ImageBase64);
            int upscaleFactor = RequiredScale(imageBytes, paperSize);
            bool needsUpscale = upscaleFactor > 1;

            DeductResult? deduction = null;
            if (needsUpscale)
            {
                deduction = await wallet.TryDeductAsync(
                    userId,
                    PrintCost,
                    $"Print {paperSize}",
                    null,
                    ct);
                if (!deduction.Succeeded)
                {
                    return Results.Json(
                        new { detail = deduction.Error ?? "Insufficient coins." },
                        statusCode: StatusCodes.Status402PaymentRequired);
                }
            }

            PrintLink? printLink = null;
            if (!string.IsNullOrWhiteSpace(req.QrTargetUrl))
            {
                try
                {
                    printLink = await qrLinks.CreateAsync(userId, req.QrTargetUrl!, ct);
                }
                catch (ArgumentException ex)
                {
                    if (deduction is not null)
                    {
                        await wallet.GrantAsync(userId, PrintCost, "Refund: invalid QR URL", ct);
                    }

                    return Results.BadRequest(new { detail = ex.Message });
                }
            }

            PrintJob job = new()
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                SourceGeneratedImageId = source.Id,
                Status = "rendering",
                PaperSize = paperSize,
                Orientation = orientation,
                QualityTier = qualityTier,
                PrintLinkId = printLink?.Id,
                CreatedAt = DateTime.UtcNow,
            };
            db.PrintJobs.Add(job);
            await db.SaveChangesAsync(ct);

            try
            {
                if (needsUpscale)
                {
                    imageBytes = await upscaler.UpscaleAsync(imageBytes, upscaleFactor, ct);
                }

                string? qrSlugUrl = null;
                if (printLink is not null)
                {
                    string publicBase = config["Print:PublicBaseUrl"] ?? string.Empty;
                    qrSlugUrl = string.IsNullOrWhiteSpace(publicBase)
                        ? $"/p/{printLink.Slug}"
                        : $"{publicBase.TrimEnd('/')}/p/{printLink.Slug}";
                }

                byte[] pdf = renderer.Render(imageBytes, new PdfRenderOptions(
                    paperSize,
                    orientation,
                    qrSlugUrl,
                    FooterText: null));

                job.PdfBase64 = Convert.ToBase64String(pdf);
                job.Status = "ready";
                job.CompletedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Print render failed for job {JobId}", job.Id);

                job.Status = "failed";
                job.ErrorMessage = ex.Message.Length > 500 ? ex.Message[..500] : ex.Message;
                job.CompletedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);

                if (deduction is not null)
                {
                    await wallet.GrantAsync(userId, PrintCost, "Refund: print render failed", ct);
                }

                return Results.Problem("Failed to render print.", statusCode: StatusCodes.Status500InternalServerError);
            }

            return Results.Ok(new RenderPrintResponse(
                job.Id,
                job.Status,
                printLink?.Slug,
                deduction?.NewBalance,
                needsUpscale));
        });

        authed.MapGet("/{id:guid}", async (
            Guid id,
            ClaimsPrincipal principal,
            AppDbContext db,
            CancellationToken ct) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            PrintJob? job = await db.PrintJobs
                .SingleOrDefaultAsync(p => p.Id == id && p.UserId == userId, ct);
            if (job is null)
            {
                return Results.NotFound();
            }

            return Results.Ok(new PrintJobResponse(
                job.Id,
                job.Status,
                job.PaperSize,
                job.Orientation,
                job.QualityTier,
                job.PdfBase64,
                job.ErrorMessage,
                job.CreatedAt,
                job.CompletedAt));
        });

        // Public redirect — no auth so a stranger scanning the QR can resolve it.
        app.MapGet("/p/{slug}", async (
            string slug,
            QrLinkService qrLinks,
            CancellationToken ct) =>
        {
            PrintLink? link = await qrLinks.ResolveAsync(slug, ct);
            if (link is null)
            {
                return Results.NotFound();
            }

            return Results.Redirect(link.TargetUrl, permanent: false);
        });
    }

    private static string? GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

    // Returns the smallest available Real-ESRGAN scale (1, 2, or 4) needed to
    // hit ~300 DPI on both edges for the chosen paper size. 1 means the source
    // is already print-ready and no upscale (or coin charge) is required.
    private static int RequiredScale(byte[] imageBytes, string paperSize)
    {
        if (!RequiredPixels300Dpi.TryGetValue(paperSize, out (int Short, int Long) needed))
        {
            return 2;
        }

        try
        {
            ImageInfo info = Image.Identify(imageBytes);
            int shortEdge = Math.Min(info.Width, info.Height);
            int longEdge = Math.Max(info.Width, info.Height);

            double needed_ = Math.Max(
                (double)needed.Short / Math.Max(shortEdge, 1),
                (double)needed.Long / Math.Max(longEdge, 1));

            if (needed_ <= 1.0)
            {
                return 1;
            }

            if (needed_ <= 2.0)
            {
                return 2;
            }

            return 4;
        }
        catch
        {
            return 2;
        }
    }
}

internal sealed record RenderPrintRequest(
    Guid GeneratedImageId,
    string PaperSize,
    string? QrTargetUrl);

internal sealed record RenderPrintResponse(
    Guid JobId,
    string Status,
    string? QrSlug,
    int? NewBalance,
    bool Upscaled);

internal sealed record PrintJobResponse(
    Guid Id,
    string Status,
    string PaperSize,
    string Orientation,
    string QualityTier,
    string? PdfBase64,
    string? ErrorMessage,
    DateTime CreatedAt,
    DateTime? CompletedAt);
