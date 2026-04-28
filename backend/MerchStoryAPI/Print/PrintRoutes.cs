using System.Security.Claims;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryAPI.Wallet;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.Print;

public static class PrintRoutes
{
    private static readonly HashSet<string> AllowedPaperSizes = new(StringComparer.OrdinalIgnoreCase)
    {
        "A6", "A5", "A4", "A3",
    };

    private static readonly HashSet<string> AllowedOrientations = new(StringComparer.OrdinalIgnoreCase)
    {
        "portrait", "landscape",
    };

    private static readonly HashSet<string> AllowedQualityTiers = new(StringComparer.OrdinalIgnoreCase)
    {
        "standard", "premium",
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

            string orientation = (req.Orientation ?? "portrait").ToLowerInvariant();
            if (!AllowedOrientations.Contains(orientation))
            {
                return Results.BadRequest(new { detail = "Orientation must be 'portrait' or 'landscape'." });
            }

            string qualityTier = (req.QualityTier ?? "standard").ToLowerInvariant();
            if (!AllowedQualityTiers.Contains(qualityTier))
            {
                return Results.BadRequest(new { detail = "Quality tier must be 'standard' or 'premium'." });
            }

            GeneratedImage? source = await db.GeneratedImages
                .SingleOrDefaultAsync(g => g.Id == req.GeneratedImageId && g.UserId == userId, ct);
            if (source is null)
            {
                return Results.NotFound(new { detail = "Generated image not found." });
            }

            int premiumCost = config.GetValue("Print:PremiumCost:" + paperSize, 5);

            DeductResult? deduction = null;
            if (qualityTier == "premium")
            {
                deduction = await wallet.TryDeductAsync(
                    userId,
                    premiumCost,
                    $"Premium print {paperSize}",
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
                    if (deduction?.Succeeded == true)
                    {
                        await wallet.GrantAsync(userId, premiumCost, "Refund: invalid QR URL", ct);
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
                byte[] imageBytes = Convert.FromBase64String(source.ImageBase64);

                if (qualityTier == "premium")
                {
                    int scale = paperSize == "A3" ? 4 : 2;
                    imageBytes = await upscaler.UpscaleAsync(imageBytes, scale, ct);
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

                if (deduction?.Succeeded == true)
                {
                    await wallet.GrantAsync(userId, premiumCost, "Refund: print render failed", ct);
                }

                return Results.Problem("Failed to render print.", statusCode: StatusCodes.Status500InternalServerError);
            }

            return Results.Ok(new RenderPrintResponse(
                job.Id,
                job.Status,
                printLink?.Slug,
                deduction?.NewBalance));
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
}

internal sealed record RenderPrintRequest(
    Guid GeneratedImageId,
    string PaperSize,
    string? Orientation,
    string? QualityTier,
    string? QrTargetUrl);

internal sealed record RenderPrintResponse(
    Guid JobId,
    string Status,
    string? QrSlug,
    int? NewBalance);

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
