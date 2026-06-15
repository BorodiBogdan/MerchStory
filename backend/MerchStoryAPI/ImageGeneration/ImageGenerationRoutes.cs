using System.Security.Claims;
using System.Text.Json;
using MerchStoryAPI.Auth;
using MerchStoryAPI.Data;
using MerchStoryAPI.LlmServices;
using MerchStoryAPI.Models;
using MerchStoryAPI.Storage;
using MerchStoryAPI.Wallet;
using MerchStoryImageGeneration.Models;
using MerchStoryImageGeneration.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.ImageGeneration;

public static class ImageGenerationRoutes
{
    public static void MapImageGenerationEndpoints(this WebApplication app)
    {
        app.MapPost("/generate-image/catalog", async (
            CatalogImageApiRequest request,
            ClaimsPrincipal principal,
            ICatalogImageService catalogService,
            IOPaintClient inpaintClient,
            ILLMService llmService,
            AppDbContext db,
            WalletService wallet,
            IBlobStorage blobs,
            ILogger<Program> logger) =>
        {
            if (request.Products is null || request.Products.Count == 0)
            {
                return Results.BadRequest(new { error = "At least one product is required." });
            }

            if (request.Products.Count > 8)
            {
                return Results.BadRequest(new { error = "too_many_products", max = 8 });
            }

            string[] distinctCurrencies = request.Products
                .Select(p => (p.Currency ?? "USD").Trim().ToUpperInvariant())
                .Distinct()
                .ToArray();

            if (distinctCurrencies.Length > 1)
            {
                return Results.BadRequest(new
                {
                    error = "All products in a catalog must use the same currency.",
                    currencies = distinctCurrencies,
                });
            }

            string resolvedCurrency = distinctCurrencies.Length == 1 ? distinctCurrencies[0] : "USD";

            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            string? logoBase64 = await FetchLogoIfRequestedAsync(db, blobs, userId, request.BrandContextFields);
            List<string>? textFields = StripLogoField(request.BrandContextFields);
            BrandContext? brandContext = await BuildBrandContextAsync(db, userId, textFields);

            // The "Brand Colors" color theme is the single place the shop palette is chosen;
            // resolve it here so the prompt can build on the actual hex values.
            string? brandColorsForTheme = string.Equals(request.ColorTheme, "Brand Colors", StringComparison.OrdinalIgnoreCase)
                ? await FetchBrandColorsAsync(db, userId)
                : null;

            string resolvedLanguage = await ResolveLanguageAsync(db, userId, request.Language);

            // Resolve product photos from blob storage by id, scoped to this user.
            Dictionary<Guid, string> productImages = await FetchProductImagesAsync(
                db, blobs, userId, request.Products.Select(p => p.Id));

            if (!request.PreserveProductImages)
            {
                DeductResult debit = await wallet.TryDeductAsync(userId, 1, "Catalog generation", null);
                if (!debit.Succeeded)
                {
                    return WalletFailure(debit);
                }

                WalletCharge charge = new(wallet, userId, 1, "Catalog generation", debit.NewBalance!.Value);
                return await HandleGeneration(
                    () => catalogService.GenerateCatalogImageAsync(request.ToServiceRequest(brandContext, logoBase64, resolvedCurrency, resolvedLanguage, productImages, brandColors: brandColorsForTheme)),
                    logger,
                    charge);
            }

            // Preserve mode: all products must carry a photo.
            var missingPhotos = request.Products
                .Where(p => !productImages.TryGetValue(p.Id, out string? img) || string.IsNullOrWhiteSpace(img))
                .Select(p => p.Name)
                .ToList();
            if (missingPhotos.Count > 0)
            {
                return Results.BadRequest(new
                {
                    error = "preserve_requires_all_product_images",
                    missing = missingPhotos,
                });
            }

            // Always fetch brand colors in preserve mode (even if not included in the prompt)
            // so the marker palette can avoid conflicts with the shop's palette.
            string? brandColorsForSafety = brandContext?.BrandColors ?? await FetchBrandColorsAsync(db, userId);

            // Pick marker colors that don't conflict with brand colors or the chosen color theme.
            PaletteSelectionResult palette = MarkerPaletteSelector.Select(
                request.Products.Count,
                brandColorsForSafety,
                request.ColorTheme);

            if (!palette.Satisfied)
            {
                return Results.BadRequest(new
                {
                    error = "preserve_no_safe_colors",
                    brandColors = brandContext?.BrandColors,
                    availableColors = palette.Colors.Select(c => c.Hex).ToArray(),
                    suggestedAction = "reduce_products_or_disable_preserve",
                });
            }

            var assignments = request.Products
                .Select((p, i) => new ProductMarkerAssignment(p.Name, palette.Colors[i].Hex))
                .ToList();

            // Debit only after all validation has passed. Refund happens on Gemini failure.
            DeductResult preserveDebit = await wallet.TryDeductAsync(userId, 1, "Catalog generation", null);
            if (!preserveDebit.Succeeded)
            {
                return WalletFailure(preserveDebit);
            }

            WalletCharge preserveCharge = new(wallet, userId, 1, "Catalog generation", preserveDebit.NewBalance!.Value);
            return await HandlePreserveGeneration(
                request,
                brandContext,
                logoBase64,
                resolvedCurrency,
                resolvedLanguage,
                brandColorsForTheme,
                assignments,
                productImages,
                catalogService,
                inpaintClient,
                llmService,
                logger,
                preserveCharge);
        })
        .WithName("GenerateCatalogImage")
        .RequireAuthorization()
        .RequireRateLimiting("generation-per-user");

        app.MapPost("/generate-image/wallpaper", async (
            WallpaperApiRequest request,
            ClaimsPrincipal principal,
            IWallpaperImageService wallpaperService,
            AppDbContext db,
            WalletService wallet,
            IBlobStorage blobs,
            ILogger<Program> logger) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            BrandContext? brandContext = await BuildBrandContextAsync(db, userId, request.BrandContextFields);
            string? brandLogo = null;

            if (request.IncludeLogo)
            {
                brandLogo = await FetchLogoBlobBase64Async(db, blobs, userId);
            }

            string wallpaperLanguage = await ResolveLanguageAsync(db, userId, request.Language);

            DeductResult debit = await wallet.TryDeductAsync(userId, 1, "Wallpaper generation", null);
            if (!debit.Succeeded)
            {
                return WalletFailure(debit);
            }

            WalletCharge charge = new(wallet, userId, 1, "Wallpaper generation", debit.NewBalance!.Value);
            return await HandleGeneration(
                () => wallpaperService.GenerateWallpaperAsync(request.ToServiceRequest(brandContext, brandLogo, wallpaperLanguage)),
                logger,
                charge);
        })
        .WithName("GenerateWallpaper")
        .RequireAuthorization()
        .RequireRateLimiting("generation-per-user");

        app.MapPost("/generate-image/catalog-on-wallpaper", async (
            CatalogOnWallpaperApiRequest request,
            ClaimsPrincipal principal,
            AppDbContext db,
            IBlobStorage blobs,
            ILogger<Program> logger) =>
        {
            if (request.Products is null || request.Products.Count == 0)
            {
                return Results.BadRequest(new { error = "At least one product is required." });
            }

            if (string.IsNullOrWhiteSpace(request.WallpaperBase64))
            {
                return Results.BadRequest(new { error = "Wallpaper image is required." });
            }

            string[] currencies = request.Products
                .Select(p => (p.Currency ?? "USD").Trim().ToUpperInvariant())
                .Distinct()
                .ToArray();

            if (currencies.Length > 1)
            {
                return Results.BadRequest(new
                {
                    error = "All products in a catalog must use the same currency.",
                    currencies,
                });
            }

            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            // Resolve product photos from blob storage, aligned to product order so the
            // compositor can pair each card with its image by index.
            Dictionary<Guid, string> productImages = await FetchProductImagesAsync(
                db, blobs, userId, request.Products.Select(p => p.Id));
            IReadOnlyList<string?> imagesInOrder = request.Products
                .Select(p => productImages.GetValueOrDefault(p.Id))
                .ToList();

            return await HandleGeneration(
                () => Task.FromResult(CatalogCompositor.Composite(request, imagesInOrder)),
                logger);
        })
        .WithName("GenerateCatalogOnWallpaper")
        .RequireAuthorization();

        app.MapPost("/generate-image/announcement", async (
            AnnouncementImageApiRequest request,
            ClaimsPrincipal principal,
            IAnnouncementImageService announcementService,
            AppDbContext db,
            WalletService wallet,
            IBlobStorage blobs,
            ILogger<Program> logger) =>
        {
            bool isJobPost = string.Equals(request.PostType, "Job Post", StringComparison.OrdinalIgnoreCase);

            if (isJobPost)
            {
                if (string.IsNullOrWhiteSpace(request.JobTitle))
                {
                    return Results.BadRequest(new { error = "Job title is required for job posts." });
                }

                if (string.IsNullOrWhiteSpace(request.JobSchedule))
                {
                    return Results.BadRequest(new { error = "Work schedule is required for job posts." });
                }

                if (!string.IsNullOrWhiteSpace(request.JobImageStyle)
                    && !string.Equals(request.JobImageStyle, "with-person", StringComparison.OrdinalIgnoreCase)
                    && !string.Equals(request.JobImageStyle, "text-only", StringComparison.OrdinalIgnoreCase))
                {
                    return Results.BadRequest(new { error = "Job image style must be 'with-person' or 'text-only'." });
                }
            }
            else if (string.IsNullOrWhiteSpace(request.Content))
            {
                return Results.BadRequest(new { error = "Content must not be empty." });
            }

            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            string? logoBase64 = await FetchLogoIfRequestedAsync(db, blobs, userId, request.BrandContextFields);
            List<string>? textFields = StripLogoField(request.BrandContextFields);
            BrandContext? brandContext = await BuildBrandContextAsync(db, userId, textFields);
            string announcementLanguage = await ResolveLanguageAsync(db, userId, request.Language);

            // Promotion posts can include product photos; resolve them from blob storage
            // by id (scoped to the user), preserving the requested order.
            List<string>? productImages = null;
            if (request.ProductImageIds is { Count: > 0 } requestedIds)
            {
                Dictionary<Guid, string> resolved = await FetchProductImagesAsync(db, blobs, userId, requestedIds);
                productImages = requestedIds
                    .Where(resolved.ContainsKey)
                    .Select(id => resolved[id])
                    .ToList();
            }

            DeductResult debit = await wallet.TryDeductAsync(userId, 1, "Announcement generation", null);
            if (!debit.Succeeded)
            {
                return WalletFailure(debit);
            }

            WalletCharge charge = new(wallet, userId, 1, "Announcement generation", debit.NewBalance!.Value);
            return await HandleGeneration(
                () => announcementService.GenerateAnnouncementImageAsync(request.ToServiceRequest(brandContext, logoBase64, announcementLanguage, productImages)),
                logger,
                charge);
        })
        .WithName("GenerateAnnouncementImage")
        .RequireAuthorization()
        .RequireRateLimiting("generation-per-user");
    }

    private static IResult WalletFailure(DeductResult result)
    {
        // TryDeductAsync returns "User not found." when the JWT subject doesn't match a row;
        // every other failure means insufficient balance.
        if (string.Equals(result.Error, "User not found.", StringComparison.Ordinal))
        {
            return Results.Unauthorized();
        }

        return Results.Problem(
            title: "Insufficient credits",
            detail: "You don't have enough credits to perform this action.",
            statusCode: StatusCodes.Status402PaymentRequired);
    }

    private static async Task<string> ResolveLanguageAsync(AppDbContext db, string? userId, string? requestedLanguage)
    {
        if (!string.IsNullOrWhiteSpace(requestedLanguage))
        {
            return requestedLanguage!.Trim().ToUpperInvariant();
        }

        if (userId is null)
        {
            return "EN";
        }

        AppLanguage lang = await db.ShopProfiles
            .Where(s => s.UserId == userId)
            .Select(s => s.GenerationLanguage)
            .FirstOrDefaultAsync();

        return lang.ToString();
    }

    private static string? GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

    private static List<string>? StripLogoField(List<string>? fields) =>
        fields is null
            ? null
            : fields
                .Where(f => !f.Equals("logoBase64", StringComparison.OrdinalIgnoreCase))
                .ToList() is { Count: > 0 } result
                    ? result
                    : null;

    private static async Task<string?> FetchBrandColorsAsync(AppDbContext db, string? userId)
    {
        if (userId is null)
        {
            return null;
        }

        string? brandColorsJson = await db.ShopProfiles
            .Where(s => s.UserId == userId)
            .Select(s => s.BrandColorsJson)
            .FirstOrDefaultAsync();

        if (string.IsNullOrEmpty(brandColorsJson))
        {
            return null;
        }

        BrandColorDto[]? colors = JsonSerializer.Deserialize<BrandColorDto[]>(brandColorsJson);
        if (colors is null || colors.Length == 0)
        {
            return null;
        }

        return string.Join(", ", colors.Select(c => c.Hex));
    }

    private static async Task<string?> FetchLogoIfRequestedAsync(
        AppDbContext db,
        IBlobStorage blobs,
        string? userId,
        List<string>? fields)
    {
        if (userId is null || fields is null)
        {
            return null;
        }

        if (!fields.Any(f => f.Equals("logoBase64", StringComparison.OrdinalIgnoreCase)))
        {
            return null;
        }

        string? blobKey = await db.ShopProfiles
            .Where(s => s.UserId == userId)
            .Select(s => s.LogoBlobKey)
            .FirstOrDefaultAsync();

        if (string.IsNullOrEmpty(blobKey))
        {
            return null;
        }

        // The Gemini-style image-generation services accept inlined base64 strings.
        // Download the bytes once and encode here so callers stay storage-agnostic.
        byte[] bytes = await blobs.DownloadAsync(blobKey);
        return Convert.ToBase64String(bytes);
    }

    // Resolves product ids to base64-encoded image bytes, pulled from blob storage.
    // Scoped to the caller's own products, so the client supplies ids rather than the
    // image bytes themselves. Products the user doesn't own, or that have no stored
    // image, are simply absent from the result. Mirrors FetchLogoIfRequestedAsync.
    private static async Task<Dictionary<Guid, string>> FetchProductImagesAsync(
        AppDbContext db,
        IBlobStorage blobs,
        string userId,
        IEnumerable<Guid> productIds)
    {
        List<Guid> ids = productIds.Distinct().ToList();
        if (ids.Count == 0)
        {
            return new Dictionary<Guid, string>();
        }

        var rows = await db.Products
            .Where(p => p.UserId == userId && ids.Contains(p.Id) && p.ImageBlobKey != null)
            .Select(p => new { p.Id, BlobKey = p.ImageBlobKey! })
            .ToListAsync();

        // Downloads are independent I/O — fetch them concurrently. The product cap (8)
        // keeps the fan-out small.
        (Guid Id, string B64)[] downloads = await Task.WhenAll(rows.Select(async r =>
            (r.Id, Convert.ToBase64String(await blobs.DownloadAsync(r.BlobKey)))));

        return downloads.ToDictionary(x => x.Id, x => x.B64);
    }

    private static async Task<string?> FetchLogoBlobBase64Async(
        AppDbContext db,
        IBlobStorage blobs,
        string? userId)
    {
        if (userId is null)
        {
            return null;
        }

        string? blobKey = await db.ShopProfiles
            .Where(s => s.UserId == userId)
            .Select(s => s.LogoBlobKey)
            .FirstOrDefaultAsync();

        if (string.IsNullOrEmpty(blobKey))
        {
            return null;
        }

        byte[] bytes = await blobs.DownloadAsync(blobKey);
        return Convert.ToBase64String(bytes);
    }

    private static async Task<BrandContext?> BuildBrandContextAsync(
        AppDbContext db,
        string? userId,
        List<string>? selectedFields)
    {
        if (userId is null || selectedFields is null || selectedFields.Count == 0)
        {
            return null;
        }

        ShopProfile? profile = await db.ShopProfiles
            .AsNoTracking()
            .SingleOrDefaultAsync(s => s.UserId == userId);

        if (profile is null)
        {
            return null;
        }

        var fields = new HashSet<string>(selectedFields, StringComparer.OrdinalIgnoreCase);

        string? brandColors = null;
        if (fields.Contains("brandColors") && !string.IsNullOrEmpty(profile.BrandColorsJson))
        {
            BrandColorDto[]? colors = JsonSerializer.Deserialize<BrandColorDto[]>(profile.BrandColorsJson);
            if (colors is { Length: > 0 })
            {
                brandColors = string.Join(", ", colors.Select(c => $"{c.Hex} ({c.Percentage}%)"));
            }
        }

        string? addresses = null;
        if (fields.Contains("addresses") && !string.IsNullOrEmpty(profile.Addresses))
        {
            string[]? addrs = JsonSerializer.Deserialize<string[]>(profile.Addresses);
            if (addrs is { Length: > 0 })
            {
                addresses = string.Join("; ", addrs);
            }
        }

        return new BrandContext(
            BrandName: fields.Contains("brandName") ? profile.BrandName : null,
            Slogan: fields.Contains("slogan") ? profile.Slogan : null,
            BrandColors: brandColors,
            BusinessDomain: fields.Contains("businessDomain") ? profile.BusinessDomain : null,
            ShopType: fields.Contains("shopType") ? profile.ShopType : null,
            TargetAudience: fields.Contains("targetAudience") ? profile.TargetAudience : null,
            Competitors: fields.Contains("competitors") ? profile.Competitors : null,
            PhoneNumber: fields.Contains("phoneNumber") ? profile.PhoneNumber : null,
            Email: fields.Contains("email") ? profile.Email : null,
            Addresses: addresses,
            InstagramHandle: fields.Contains("instagramHandle") ? profile.InstagramHandle : null,
            FacebookHandle: fields.Contains("facebookHandle") ? profile.FacebookHandle : null,
            TikTokHandle: fields.Contains("tikTokHandle") ? profile.TikTokHandle : null);
    }

    private static async Task<IResult> HandleGeneration(
        Func<Task<ImageGenerationResult>> generate,
        ILogger logger,
        WalletCharge? charge = null)
    {
        try
        {
            ImageGenerationResult result = await generate();
            string base64 = Convert.ToBase64String(result.ImageData);
            return Results.Ok(new { imageBase64 = base64, mimeType = result.MimeType, balance = charge?.NewBalance });
        }
        catch (InvalidOperationException ex)
            when (ex.Message.Contains("not configured", StringComparison.OrdinalIgnoreCase))
        {
            await RefundAsync(charge, "not configured", logger);
            logger.LogError("{Message}", ex.Message);
            return Results.Problem("Image generation is not configured.", statusCode: 503);
        }
        catch (Exception ex)
        {
            await RefundAsync(charge, "generation failed", logger);
            logger.LogError(ex, "Image generation failed.");
            return Results.Problem("Image generation failed.", statusCode: 502);
        }
    }

    // Refund failures must not surface as 500s — the user already saw a 502/503 from the
    // generation failure. We log so failed refunds can be reconciled manually.
    private static async Task RefundAsync(WalletCharge? charge, string reason, ILogger logger)
    {
        if (charge is null)
        {
            return;
        }

        try
        {
            await charge.Wallet.GrantAsync(
                charge.UserId,
                charge.Amount,
                $"Refund: {charge.Description} ({reason})");
            logger.LogInformation(
                "Refunded {Amount} credits to user {UserId}: {Reason}",
                charge.Amount,
                charge.UserId,
                reason);
        }
        catch (Exception ex)
        {
            logger.LogError(
                ex,
                "Failed to refund {Amount} credits to user {UserId} for {Description} ({Reason})",
                charge.Amount,
                charge.UserId,
                charge.Description,
                reason);
        }
    }

    private static async Task<IResult> HandlePreserveGeneration(
        CatalogImageApiRequest request,
        BrandContext? brandContext,
        string? logoBase64,
        string resolvedCurrency,
        string resolvedLanguage,
        string? brandColorsForTheme,
        IReadOnlyList<ProductMarkerAssignment> assignments,
        IReadOnlyDictionary<Guid, string> productImages,
        ICatalogImageService catalogService,
        IOPaintClient inpaintClient,
        ILLMService llmService,
        ILogger logger,
        WalletCharge? charge = null)
    {
        try
        {
            CatalogImageRequest preserveRequest = request.ToServiceRequest(
                brandContext,
                logoBase64,
                resolvedCurrency,
                resolvedLanguage,
                productImages,
                assignments,
                brandColorsForTheme);

            ImageGenerationResult rawResult = await catalogService.GenerateCatalogImageAsync(preserveRequest);
            IReadOnlyList<CatalogProductItem> products = preserveRequest.Products;

            const int maxTrials = 3;
            CompositeResult composite = null!;
            for (int trial = 1; trial <= maxTrials; trial++)
            {
                composite = await ProductPlaceholderCompositor.CompositeAsync(
                    rawResult.ImageData,
                    products,
                    assignments,
                    inpaintClient,
                    logger);

                string judgingPrompt =
                    "This is a product catalog where real product photos were composited into AI-generated placeholder slots. " +
                    "Answer YES if every product looks acceptable — no major distortion or stretching, no obvious leftover coloured " +
                    "outlines, halos, or marker bleed around products, no glaring paste seams, and products roughly fit the scene. " +
                    "Be lenient: minor imperfections are fine, only reject clear visible problems. " +
                    "Reply with exactly one word: YES or NO. Nothing else.";
                string compositeForJudging = Convert.ToBase64String(composite.Image.ImageData);

                bool approved;
                try
                {
                    string verdict = await llmService.GenerateAsync(
                        judgingPrompt,
                        new[] { (string?)compositeForJudging });
                    approved = verdict.TrimStart().StartsWith("YES", StringComparison.OrdinalIgnoreCase);
                    logger.LogInformation(
                        "Composite judging trial {Trial}/{Max}: approved={Approved} verdict='{Verdict}'",
                        trial,
                        maxTrials,
                        approved,
                        verdict);
                }
                catch (Exception ex)
                {
                    // The judge is a quality gate, not a hard dependency — if it fails,
                    // accept the composite rather than discarding work the user already paid for.
                    logger.LogWarning(
                        ex,
                        "Composite judging failed at trial {Trial}/{Max}; accepting composite.",
                        trial,
                        maxTrials);
                    approved = true;
                }

                if (approved)
                {
                    break;
                }

                if (trial == maxTrials)
                {
                    logger.LogWarning(
                        "Composite rejected by judge after {Max} trials; returning last composite.",
                        maxTrials);
                }
            }

            // Always log a composite summary + per-color detection + per-region inpaint stats.
            // This runs on every request, not only on fallback, so we can see exactly what
            // happened for any given generation (detection hits, inpaint target/replaced counts,
            // and how much marker colour remains on the final canvas).
            logger.LogInformation(
                "Preserve composite: detected={Detected}/{Expected} fallback={Fallback} globalStragglersReplaced={Stragglers} finalMarkerPixels={FinalMarker}",
                composite.DetectedRegions,
                composite.ExpectedRegions,
                composite.FallbackReason?.ToString() ?? "None",
                composite.GlobalStragglersReplaced,
                composite.FinalMarkerPixelCount);

            if (composite.Diagnostics is not null)
            {
                foreach (ColorDiagnostic diag in composite.Diagnostics)
                {
                    logger.LogInformation(
                        "  detect '{Product}' marker={Marker} tightPx={Tight} loosePx={Loose} comps={Comps} passedShape={Passed} detected={Detected} reject='{Reason}'",
                        diag.ProductName,
                        diag.MarkerHex,
                        diag.TightPixelCount,
                        diag.LoosePixelCount,
                        diag.ComponentCount,
                        diag.ComponentsPassedShape,
                        diag.Detected,
                        diag.RejectReason ?? "n/a");
                }
            }

            // If detection found no regions at all, return the raw Gemini image as-is
            // (with a warning) instead of regenerating. This lets the user inspect what
            // Gemini actually drew and diagnose why detection failed.
            if (composite.FallbackReason == FallbackReason.NoRegions)
            {
                logger.LogWarning(
                    "Preserve mode detected zero regions. Returning raw Gemini image for diagnosis. " +
                    "Expected {Expected} products, detected {Detected}. Missing: {Missing}",
                    composite.ExpectedRegions,
                    composite.DetectedRegions,
                    string.Join(", ", composite.MissingProductNames));

                if (composite.Diagnostics is not null)
                {
                    foreach (ColorDiagnostic diag in composite.Diagnostics)
                    {
                        logger.LogWarning(
                            "Preserve diagnostic — product='{Product}' marker={Marker} tightPixels={Tight} loosePixels={Loose} components={Components} passedShape={Passed} detected={Detected} reject='{Reason}'",
                            diag.ProductName,
                            diag.MarkerHex,
                            diag.TightPixelCount,
                            diag.LoosePixelCount,
                            diag.ComponentCount,
                            diag.ComponentsPassedShape,
                            diag.Detected,
                            diag.RejectReason ?? "n/a");
                    }
                }

                string rawBase64 = Convert.ToBase64String(rawResult.ImageData);
                return Results.Ok(new
                {
                    imageBase64 = rawBase64,
                    mimeType = rawResult.MimeType,
                    warning = "preserve_detection_failed_returning_raw",
                    missingProducts = composite.MissingProductNames,
                    balance = charge?.NewBalance,
                    diagnostics = composite.Diagnostics?.Select(d => new
                    {
                        d.ProductName,
                        d.MarkerHex,
                        d.TightPixelCount,
                        d.LoosePixelCount,
                        d.ComponentCount,
                        d.ComponentsPassedShape,
                        d.Detected,
                        d.RejectReason,
                    }),
                });
            }

            string compositeBase64 = Convert.ToBase64String(composite.Image.ImageData);
            string? warning = composite.FallbackReason switch
            {
                FallbackReason.PartialPreserve => "preserve_partial_missing_products",
                FallbackReason.ExtraRegionsDiscarded => "preserve_extra_regions_discarded",
                _ => null,
            };

            return Results.Ok(new
            {
                imageBase64 = compositeBase64,
                mimeType = composite.Image.MimeType,
                warning,
                missingProducts = composite.MissingProductNames.Count > 0
                    ? composite.MissingProductNames
                    : null,
                balance = charge?.NewBalance,
            });
        }
        catch (InvalidOperationException ex)
            when (ex.Message.Contains("not configured", StringComparison.OrdinalIgnoreCase))
        {
            await RefundAsync(charge, "not configured", logger);
            logger.LogError("{Message}", ex.Message);
            return Results.Problem("Image generation is not configured.", statusCode: 503);
        }
        catch (Exception ex)
        {
            await RefundAsync(charge, "preserve generation failed", logger);
            logger.LogError(ex, "Preserve-mode catalog generation failed.");
            return Results.Problem("Image generation failed.", statusCode: 502);
        }
    }

    private sealed record WalletCharge(
        WalletService Wallet,
        string UserId,
        int Amount,
        string Description,
        int NewBalance);
}

// ── API-layer DTOs ────────────────────────────────────────────────────────────
// The client sends the product Id; the backend resolves the image from blob storage
// server-side (see FetchProductImagesAsync), so image bytes never travel on the wire.
internal sealed record CatalogProductApiItem(Guid Id, string Name, decimal Price, string Currency = "USD");

// Offer payload mirrors the frontend's CatalogOfferConfig (productIds are product GUIDs).
internal sealed record CatalogFreebieApi(Guid ProductId, string Type = "item");

internal sealed record CatalogOfferGroupApi(
    string Kind,
    List<Guid>? ProductIds,
    decimal Percent,
    List<CatalogFreebieApi>? Freebies,
    decimal? BundlePrice = null,
    decimal? BundleOriginalPrice = null);

internal sealed record CatalogOfferApi(bool IsOffer, List<CatalogOfferGroupApi>? Groups);

internal sealed record CatalogImageApiRequest(
    List<CatalogProductApiItem>? Products,
    string ColorTheme,
    string Format,
    bool ShowPrices,
    List<string>? BrandContextFields,
    string? Currency = null,
    string? Language = null,
    bool PreserveProductImages = false,
    string BackgroundStyle = "SocialPost",
    CatalogOfferApi? Offer = null,
    string? ImageModel = null,
    bool ShowStockDisclaimer = false,
    bool ShowDiscountPercentage = true)
{
    public CatalogImageRequest ToServiceRequest(
        BrandContext? brandContext,
        string? logoBase64,
        string currency,
        string language,
        IReadOnlyDictionary<Guid, string> productImages,
        IReadOnlyList<ProductMarkerAssignment>? markerAssignments = null,
        string? brandColors = null)
    {
        var resolved = this.Products!
            .Select(p => (p.Id, Item: new CatalogProductItem(p.Name, p.Price, productImages.GetValueOrDefault(p.Id))))
            .ToList();
        var itemById = new Dictionary<Guid, CatalogProductItem>();
        foreach (var (id, item) in resolved)
        {
            itemById[id] = item;
        }

        return new(
            resolved.Select(x => x.Item).ToList(),
            this.ColorTheme,
            this.Format,
            this.ShowPrices,
            brandContext,
            logoBase64,
            currency,
            language,
            this.PreserveProductImages,
            markerAssignments,
            this.BackgroundStyle,
            brandColors,
            this.BuildOffer(itemById),
            this.ImageModel,
            this.ShowStockDisclaimer,
            this.ShowDiscountPercentage);
    }

    // Resolve the wire offer (product GUIDs) into a service offer that carries the
    // resolved product line-items. Offers are ignored in preserve mode and unknown
    // product ids / empty groups are dropped.
    private CatalogOffer? BuildOffer(IReadOnlyDictionary<Guid, CatalogProductItem> itemById)
    {
        if (this.PreserveProductImages || this.Offer is null || !this.Offer.IsOffer || this.Offer.Groups is null)
        {
            return null;
        }

        var groups = new List<CatalogOfferGroupItem>();
        foreach (CatalogOfferGroupApi g in this.Offer.Groups)
        {
            List<CatalogProductItem> items = (g.ProductIds ?? new List<Guid>())
                .Where(itemById.ContainsKey)
                .Select(id => itemById[id])
                .ToList();
            if (items.Count == 0)
            {
                continue;
            }

            CatalogOfferKind kind = string.Equals(g.Kind, "bundle", StringComparison.OrdinalIgnoreCase)
                ? CatalogOfferKind.Bundle
                : CatalogOfferKind.Group;

            List<CatalogOfferFreebie> freebies = (g.Freebies ?? new List<CatalogFreebieApi>())
                .Where(f => itemById.ContainsKey(f.ProductId))
                .Select(f =>
                {
                    FreeItemKind freeKind = string.Equals(f.Type, "range", StringComparison.OrdinalIgnoreCase)
                        ? FreeItemKind.Range
                        : FreeItemKind.Item;
                    return new CatalogOfferFreebie(itemById[f.ProductId].Name, freeKind);
                })
                .ToList();

            groups.Add(new CatalogOfferGroupItem(kind, items, g.Percent, freebies, g.BundlePrice, g.BundleOriginalPrice));
        }

        return groups.Count > 0 ? new CatalogOffer(groups) : null;
    }
}

internal sealed record WallpaperApiRequest(string Prompt, string Format, bool IncludeLogo, List<string>? BrandContextFields, string? Language = null, string? ImageModel = null)
{
    public WallpaperImageRequest ToServiceRequest(BrandContext? brandContext, string? brandLogo, string language) =>
        new(
            Format: this.Format,
            UserPrompt: this.Prompt,
            InlineImages: string.IsNullOrWhiteSpace(brandLogo) ? null : [brandLogo],
            BrandContext: brandContext,
            Language: language,
            ImageModel: this.ImageModel);
}

internal sealed record PlacementZone(
    double X,
    double Y,
    double Width,
    double Height);

internal sealed record CatalogOnWallpaperApiRequest(
    List<CatalogProductApiItem>? Products,
    string WallpaperBase64,
    string Layout,
    bool ShowPrices,
    bool ShowProductNames = true,
    TextStyleOptions? TextStyle = null,
    PlacementZone? PlacementZone = null);

internal sealed record AnnouncementImageApiRequest(
    string PostType,
    string Content,
    string Tone,
    string Format,
    List<string>? BrandContextFields,
    List<Guid>? ProductImageIds = null,
    string? JobTitle = null,
    string? JobSchedule = null,
    string? JobSalary = null,
    string? JobImageStyle = null,
    List<string>? JobRequirements = null,
    string? Language = null,
    string? ImageModel = null)
{
    public AnnouncementImageRequest ToServiceRequest(
        BrandContext? brandContext,
        string? logoBase64,
        string language,
        IReadOnlyList<string>? productImages) =>
        new(
            this.PostType,
            this.Content ?? string.Empty,
            this.Tone,
            this.Format,
            brandContext,
            productImages,
            logoBase64,
            this.JobTitle,
            this.JobSchedule,
            this.JobSalary,
            this.JobImageStyle,
            this.JobRequirements,
            language,
            this.ImageModel);
}
