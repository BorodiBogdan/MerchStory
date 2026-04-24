using MerchStoryImageGeneration.Models;

namespace MerchStoryImageGeneration.Services;

internal sealed class CatalogImageService : ImageGenerationServiceBase, ICatalogImageService
{
    private const string SystemContext =
        "You are a professional retail graphic designer specializing in product catalog ads. " +
        "Always produce clean, commercial-quality imagery with clear product focus. " +
        "Never add watermarks, placeholders, or lorem ipsum text.";

    public CatalogImageService(IImageProvider provider)
        : base(provider)
    {
    }

    public Task<ImageGenerationResult> GenerateCatalogImageAsync(
        CatalogImageRequest request,
        CancellationToken cancellationToken = default)
    {
        var images = new List<string?>();
        if (!string.IsNullOrWhiteSpace(request.LogoBase64))
        {
            images.Add(request.LogoBase64);
        }

        images.AddRange(request.Products
            .Select(p => p.ImageBase64)
            .Where(img => !string.IsNullOrWhiteSpace(img)));

        string prompt = request.PreserveProductImages
            ? BuildOutlinePrompt(request)
            : BuildPrompt(request);

        return this.GenerateAsync(
            prompt,
            images.Count > 0 ? images : null,
            cancellationToken);
    }

    private static string BuildPrompt(CatalogImageRequest r)
    {
        string symbol = CurrencyFormatter.SymbolFor(r.Currency);
        var names = string.Join(", ", r.Products.Select(p =>
            r.ShowPrices ? $"{p.Name} ({CurrencyFormatter.Format(p.Price, r.Currency)})" : p.Name));

        string logoNote = !string.IsNullOrWhiteSpace(r.LogoBase64)
            ? "Brand logo: a logo image has been provided as the first inline image. " +
              "Place it in a natural brand position (e.g. top corner or header area). " +
              "ABSOLUTE RULE: reproduce the logo pixel-perfect — do NOT recolor, restyle, " +
              "redraw, reinterpret, regenerate, crop, or alter it in any way for any reason, " +
              "including matching brand colors or the overall image style. " +
              "The logo is always used EXACTLY as provided. " +
              "If the logo already contains the brand name, do NOT add the brand name again as separate text.\n\n"
            : string.Empty;

        string imageNote = r.Products.Any(p => !string.IsNullOrWhiteSpace(p.ImageBase64))
            ? "Use the provided product photos as the basis for the visuals. "
            : string.Empty;

        return
            $"{SystemContext}\n\n" +
            LanguageInstruction.For(r.Language) +
            BrandContextBlock(r.BrandContext) +
            logoNote +
            $"Create a professional product catalog ad image in {r.Format} format. " +
            $"Layout style: {r.Layout}. Color theme: {r.ColorTheme}. Products: {names}. " +
            imageNote +
            (r.ShowPrices
                ? $"Display prices prominently using the {r.Currency} currency (symbol: {symbol})."
                : "Do not show prices.") +
            " Make it look like a high-quality retail advertisement.";
    }

    private static string BuildOutlinePrompt(CatalogImageRequest r)
    {
        string symbol = CurrencyFormatter.SymbolFor(r.Currency);
        var priceLine = r.ShowPrices
            ? $"Display prices prominently using the {r.Currency} currency (symbol: {symbol})."
            : "Do not show prices.";

        string logoNote = !string.IsNullOrWhiteSpace(r.LogoBase64)
            ? "Brand logo: a logo image has been provided as the first inline image. " +
              "Place it in a natural brand position (e.g. top corner or header area). " +
              "ABSOLUTE RULE: reproduce the logo pixel-perfect — do NOT recolor, restyle, " +
              "redraw, reinterpret, regenerate, crop, or alter it in any way for any reason, " +
              "including matching brand colors or the overall image style. " +
              "The logo is always used EXACTLY as provided. " +
              "If the logo already contains the brand name, do NOT add the brand name again as separate text.\n\n"
            : string.Empty;

        var assignments = r.MarkerAssignments ?? [];
        var productLines = new List<string>(capacity: r.Products.Count);
        for (int i = 0; i < r.Products.Count; i++)
        {
            var product = r.Products[i];
            string hex = i < assignments.Count ? assignments[i].MarkerHex : "#FF00FF";
            string priceSuffix = r.ShowPrices
                ? $" (price {CurrencyFormatter.Format(product.Price, r.Currency)})"
                : string.Empty;
            productLines.Add($"- Product \"{product.Name}\"{priceSuffix} → outline in pure color {hex}");
        }

        string productBlock = string.Join("\n", productLines);
        string reservedHexList = string.Join(", ", assignments.Select(a => a.MarkerHex));

        bool isSaturatedTheme = string.Equals(r.ColorTheme, "Vibrant", StringComparison.OrdinalIgnoreCase)
            || string.Equals(r.ColorTheme, "Pop Art", StringComparison.OrdinalIgnoreCase)
            || string.Equals(r.ColorTheme, "Pop-Art", StringComparison.OrdinalIgnoreCase);

        string saturatedThemeNote = isSaturatedTheme
            ? "The backdrop and decorative elements may use bright, saturated colors — but none of them may be any of the reserved marker colors listed above.\n\n"
            : string.Empty;

        int productImageCount = r.Products.Count(p => !string.IsNullOrWhiteSpace(p.ImageBase64));
        string productRefNote = productImageCount > 0
            ? $"You have been given {productImageCount} product reference image(s) as inline images after the logo (if any). " +
              "CRITICAL PRODUCT FIDELITY RULE: render each product in the scene as a FAITHFUL, PIXEL-ACCURATE reproduction of its reference image. " +
              "Preserve EXACTLY — without reinterpretation, stylization, or creative substitution — the product's: " +
              "packaging shape and silhouette, label layout and typography, logo placement, color scheme, text content, patterns, graphics, mascots, illustrations, and distinctive markings.\n\n" +
              "🎯 ORIENTATION & POSE LOCK — THE PRODUCT'S FACE AND POSE MUST MATCH THE REFERENCE 🎯\n" +
              "Render each product with the same face, pose, perspective, and presentation as its reference image:\n" +
              "- If the reference is a flat, head-on product shot, render it flat and head-on — do NOT add a three-quarter angle, tilt, skew, or depth-of-field effect.\n" +
              "- Do NOT flip the product horizontally or vertically (mirror image forbidden).\n" +
              "- Do NOT change the product's front face, branding side, or perspective.\n" +
              "- Do NOT add perspective warping, tilt, skew, or stylized rotation.\n\n" +
              "ALLOWED — 90° ORIENTATION SWITCH IF LAYOUT REQUIRES IT:\n" +
              "You MAY rotate a product by exactly 0° or 90° (including 180° or 270°) — i.e., in multiples of a quarter turn — if the layout benefits visibly. " +
              "For example, a wide horizontal chocolate bar may be rotated to stand vertically if the column layout requires a tall slot; a tall bottle may be rotated horizontal if it fits a horizontal row better. " +
              "Only whole 90° increments are allowed. NO arbitrary angles (30°, 45°, 15°, etc.). NO tilts. NO perspective rotations. Just straight 0°/90°/180°/270°.\n\n" +
              "After any rotation, the product's silhouette shape must still match the reference (just rotated). The outline you draw around it must trace that rotated silhouette.\n\n" +
              "Do NOT invent different flavors, do NOT change the brand, do NOT modify any written text, do NOT redesign the packaging, do NOT swap colors, do NOT omit or add graphic elements. " +
              "Treat the reference image as the single source of truth. " +
              "The product appearing in your output must be interchangeable with the reference — a viewer seeing both side by side should not be able to tell them apart in terms of shape, orientation, or content. " +
              "This is essential because the real reference image will be composited over your rendering afterward; any deviation in shape, position, orientation, or aspect ratio will cause a visible misalignment where the composited product stretches, crops, or falls off-center.\n\n"
            : string.Empty;

        return
            $"{SystemContext}\n\n" +
            LanguageInstruction.For(r.Language) +
            BrandContextBlock(r.BrandContext) +
            logoNote +
            productRefNote +
            $"Create a professional product catalog ad image in {r.Format} format. " +
            $"Layout style: {r.Layout}. Color theme: {r.ColorTheme}. " + priceLine + "\n\n" +
            "Render the products, scene, backdrop, props, brand elements, logo, and pricing badges naturally — " +
            "with rich ambient lighting across the scene for atmosphere.\n\n" +
            "🚫 NO DROP SHADOWS OR GROUND REFLECTIONS UNDER PRODUCTS 🚫\n" +
            "Do NOT draw cast shadows, drop shadows, ground shadows, reflections, puddles, mirror glare, " +
            "glossy floor reflections, or any darkened/tinted patch on the surface directly below or around each product. " +
            "The area directly under and immediately around each outlined product must be clean, uniform scene background — " +
            "no darkening, no tint, no reflection, no highlight fading to darker tones. " +
            "Scene-wide ambient light and lighting on OTHER scene elements (props, backdrop, signage) is fine — " +
            "the rule applies only to the product-ground contact zone.\n\n" +
            "Draw one tight silhouette outline around each product, using the assigned colors below (one unique color per product):\n" +
            productBlock + "\n\n" +
            "🚫 THE OUTLINE IS A SILHOUETTE, NOT A RECTANGLE OR BOUNDING BOX 🚫\n" +
            "The outline is ONE continuous closed curve that traces the product's actual contour — following every curve, " +
            "handle, cap, neck, corner, and non-rectangular feature of the product. It is NEVER a rectangle, square, box frame, " +
            "panel border, bounding rectangle, or any rectilinear shape around the product. Do NOT draw BOTH a silhouette " +
            "outline AND a rectangle/frame around the product — draw ONLY the silhouette. There must be exactly ONE outline " +
            "per product, and that outline must be the silhouette contour — no second rectangular frame, no outer box, no panel border, nothing else.\n\n" +
            "🚫 OUTLINES EXIST ONLY ON PRODUCTS — NOWHERE ELSE IN THE ENTIRE IMAGE 🚫\n" +
            "The silhouette outlines described above are the ONLY outlines, borders, frames, strokes, rings, or edge-traces " +
            "that appear anywhere in the entire generated image. Everything else is rendered FLAT, with NO decorative outline " +
            "of any kind. Specifically, the following elements must have absolutely NO outline, border, frame, stroke, edge-trace, " +
            "ring, shadow-line, glow-line, or any other decorative edge treatment:\n" +
            "- Price labels, price numbers, currency symbols — the typography itself is flat (no text outline, text stroke, or glow). Prices MAY sit on a filled pill, chip, tag-shape, or colored panel, but that shape itself is a flat fill with NO decorative outline/border/ring/stroke, and must NOT use any reserved marker color (see reserved-color rule below).\n" +
            "- Product name labels, captions, descriptions — flat typography only\n" +
            "- Headline text, title text, slogan text, brand name text, call-to-action text — flat typography only, no text outline, no text stroke, no surrounding frame\n" +
            "- Contact information (phone, email, address) — flat typography only\n" +
            "- Logo area, brand mark — reproduced as-is, no added frame\n" +
            "- Decorative elements, dividers, separator lines, icons, bullet points — none of these may carry an outline\n" +
            "- The overall image canvas — no outer border/frame around the whole composition\n" +
            "- Grid cells, product zones, or layout sections — no visible cell borders, grid lines, panel edges, or section dividers\n\n" +
            "If your usual design instinct is to stroke a price badge with a contrasting border, or to frame a headline with a " +
            "decorative line — DO NOT. A filled pill/chip behind a price is fine; a decorative outline around it is not. " +
            "Outlines belong to products, and to products only.\n\n" +
            "Each outline is a crisp, **solid, flat, uniformly-colored line exactly 4 pixels thick** — no gradient, no glow, " +
            "no shadow, no soft edge, no luminosity effect, no neon halo, no fade. Just a plain solid line of the exact " +
            "assigned hex color, edge-to-edge. The line must be the SAME pixel color along its entire length. " +
            "The outline hugs the product edge tightly (within 1–2 pixels of the product's real silhouette). " +
            "The outline must be a fully closed loop (no gaps) that traces the complete product silhouette. " +
            "Outlines must NOT overlap each other and must NOT overlap any text, logo, or brand element. " +
            "Do NOT add any effect to the outline — no drop shadow, no bloom, no outer glow, no inner shadow, " +
            "no color grading, no blending mode. Treat it as a flat printed line on top of the scene.\n\n" +
            "🟩 QUIET ZONE AROUND EACH OUTLINE 🟩\n" +
            "Immediately surrounding each product outline there must be a QUIET ZONE — a strip of clean, uniform, " +
            "low-contrast scene background at least 40 pixels wide (or roughly one price line-height, whichever is " +
            "larger) on every side of the outline. The quiet zone is flat: a single soft scene tone, no text, no " +
            "typography, no price numbers, no logos, no icons, no stars, no sparkles, no dots, no chips, no tags, " +
            "no badges, no pills, no decorative shapes, no secondary products, no patterns, no gradients, no " +
            "saturated accent colors, no darkened patches. The zone is as quiet as a passport-photo background. " +
            "Every character, label, badge, decorative element, and prop must begin OUTSIDE this quiet zone.\n\n" +
            "Why: after generation, each outline is erased by sampling the pixel immediately outside it and painting " +
            "that color over the outline. If a letter, number, badge, or accent shape sits inside the quiet zone, " +
            "the eraser will copy THAT pixel instead of clean background, stamping a visible fragment of text or " +
            "color in a ring around the product. Keep the quiet zone boring — quiet zone = clean erase.\n\n" +
            "PURPOSE: Each outlined region marks where a REAL photographic product image will be pasted AFTER this generation. " +
            "The final image will replace whatever is inside the outline with the user's actual product photo. " +
            "So anything you place on top of or crossing into an outlined region will be DESTROYED by the paste — or worse, " +
            "it will be partially visible and look broken. Treat the outlined regions as RESERVED 'do-not-touch' zones.\n\n" +
            "🚫 ABSOLUTE RULE — NOTHING APPEARS ON, OVER, OR CROSSING ANY PRODUCT 🚫\n" +
            "Each product appears COMPLETELY PLAIN — as if cut out of its reference photo and pasted onto the scene, untouched. " +
            "NOTHING — of ANY kind, with ZERO exceptions — is drawn on top of, in front of, overlapping, touching, crossing, " +
            "clipping, bleeding into, or casting onto any product or its outlined region. If something is not part of the " +
            "product's own original packaging as shown in the reference, IT DOES NOT APPEAR on or across the product. Period.\n\n" +
            "This rule is ABSOLUTE and UNIVERSAL — no listing can enumerate every possibility, so do not treat any list as the " +
            "boundary of what's forbidden. Everything you might be tempted to add — a price tag, a sticker, a water splash, a " +
            "motion effect, a light ray, a sparkle, a ribbon, a shadow of another object, a rectangle frame, a marketing flair " +
            "typical of the brand's own ads — is forbidden, along with anything else you can imagine. If the product is " +
            "conventionally advertised with signature effects (JBL speakers with water, drinks with condensation, cosmetics " +
            "with glitter, etc.), IGNORE that convention completely. The product is rendered plain, still, and isolated.\n\n" +
            "Every pixel inside each product's outline belongs to the product alone. Every pixel crossing the outline belongs " +
            "to the product alone. The surrounding scene stays entirely OUTSIDE the silhouette line — it never reaches across.\n\n" +
            "🚫 CLEARANCE RULE — EVERY NON-PRODUCT ELEMENT 🚫\n" +
            "The QUIET ZONE clearance above applies to every non-product element in the image, not only prices. " +
            "That includes: price labels, price numbers, currency symbols, product names, captions, subtitles, " +
            "headlines, contact info, brand text, logos, icons, arrows, stars, sparkles, dots, bullet points, " +
            "chips, tags, badges, pills, decorative shapes, accent blocks, color swatches, and any secondary " +
            "product or prop.\n\n" +
            "None of these may overlap, touch, sit flush against, nestle into, or sit adjacent to a product " +
            "outline. Between the bounding box of ANY such element and the outline of ANY product there must be " +
            "a visible gap at least as wide as the QUIET ZONE (≥ 40 px, or ~one price line-height, whichever is larger).\n\n" +
            "LAYOUT: each price sits directly underneath its own product, inside the same column as that product, " +
            "with the full quiet-zone gap between the outline and the top of the price. Product-price pairing must " +
            "be visually unambiguous — a viewer must not need to read numbers to know which price belongs to which product.\n\n" +
            "If space is tight, SHRINK THE PRODUCT (and its outline) to create room for the quiet zone. Never compress, " +
            "skip, or share the quiet zone. Clearance is an absolute constraint; layout works around it.\n\n" +
            "LAYOUT FAILURES: prices bunched in a shared bottom banner, a price closer to product B than to its own " +
            "product A, any chip/pill/tag-shape/badge extending into the quiet zone, any decorative accent within the quiet zone.\n\n" +
            "⚠ RESERVED MARKER COLORS — ABSOLUTE EXCLUSION RULE ⚠\n" +
            "The following hex colors: " + reservedHexList + "\n" +
            "are reserved EXCLUSIVELY for the product outlines described above. They must appear NOWHERE ELSE in the entire image. " +
            "This is a hard, non-negotiable rule.\n\n" +
            "FORBIDDEN LOCATIONS for these colors (list of places where these colors must NOT appear):\n" +
            "- Price text, price tags, price backgrounds, price numbers, currency symbols\n" +
            "- Product names, labels, captions, descriptions, any typography\n" +
            "- Headline text, subtitle text, tagline text, call-to-action text\n" +
            "- Brand name or slogan text\n" +
            "- Contact information (phone, email, address)\n" +
            "- Background, backdrop, wallpaper, floor, wall, counter, shelf\n" +
            "- Decorative shapes, bubbles, stars, hearts, sparkles, rays, confetti\n" +
            "- Dividers, separators, underlines, borders, frames (other than the product outlines)\n" +
            "- Icons, arrows, symbols, bullet points\n" +
            "- Gradients, highlights, reflections, shadows anywhere in the scene\n" +
            "- Product surfaces (the actual packaging of the products)\n" +
            "- Logo, logo background, brand mark\n" +
            "- Any text stroke, text shadow, text outline, text glow\n\n" +
            "ONLY allowed location: as the 4-pixel-thick closed contour that traces each product's silhouette (one color per product as assigned above). Nothing else.\n" +
            "If your natural composition would use one of these colors anywhere else, substitute with a visibly different hue — use a near-but-distinct alternative (e.g., instead of #FF00FF use #E040C0 or a neutral).\n\n" +
            saturatedThemeNote +
            "FINAL REMINDER: the reserved marker colors (" + reservedHexList + ") appear ONLY as product-silhouette outlines. Anywhere else they appear — text, price, background, decoration — is an error. Check your output before finalizing.\n\n" +
            "Self-check before finalizing: (1) reserved marker colors appear ONLY on product outlines; (2) the quiet zone around every outline is clean, flat scene with no typography, no badges/pills, and no decoration; (3) any price pill/chip/badge sits entirely OUTSIDE the quiet zone of every product outline.\n\n" +
            "Make it look like a high-quality retail advertisement.";
    }

    private static string BrandContextBlock(MerchStoryImageGeneration.Models.BrandContext? ctx)
    {
        if (ctx is null)
        {
            return string.Empty;
        }

        var lines = new List<string>();
        if (!string.IsNullOrWhiteSpace(ctx.BrandName))
        {
            lines.Add($"- Brand: {ctx.BrandName}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.Slogan))
        {
            lines.Add($"- Slogan: {ctx.Slogan}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.BrandColors))
        {
            lines.Add($"- Brand colors: {ctx.BrandColors}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.BusinessDomain))
        {
            lines.Add($"- Business domain: {ctx.BusinessDomain}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.ShopType))
        {
            lines.Add($"- Shop type: {ctx.ShopType}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.TargetAudience))
        {
            lines.Add($"- Target audience: {ctx.TargetAudience}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.Competitors))
        {
            lines.Add($"- Competitors: {ctx.Competitors}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.PhoneNumber))
        {
            lines.Add($"- Phone: {ctx.PhoneNumber}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.Email))
        {
            lines.Add($"- Email: {ctx.Email}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.Addresses))
        {
            lines.Add($"- Address: {ctx.Addresses}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.InstagramHandle))
        {
            lines.Add($"- Instagram: {ctx.InstagramHandle}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.FacebookHandle))
        {
            lines.Add($"- Facebook: {ctx.FacebookHandle}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.TikTokHandle))
        {
            lines.Add($"- TikTok: {ctx.TikTokHandle}");
        }

        if (lines.Count == 0)
        {
            return string.Empty;
        }

        return "Brand context:\n" + string.Join("\n", lines) + "\n\n";
    }
}
