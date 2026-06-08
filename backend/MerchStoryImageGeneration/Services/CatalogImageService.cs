using MerchStoryImageGeneration.Models;

namespace MerchStoryImageGeneration.Services;

internal sealed class CatalogImageService : ImageGenerationServiceBase, ICatalogImageService
{
    private const string SystemContext =
        "You are a talented art director who designs Instagram and Facebook ad campaigns for everyday shops and small businesses. " +
        "Your work looks COOL and modern and has broad, mainstream appeal — it sells to ordinary people of every kind, " +
        "not just an elite or luxury niche. It is polished, confident, and stylish without being cold, snobby, or exclusive. " +
        "Crucially, it never looks like cheap, generic AI-generated garbage: no clipart, no stock-graphic blandness, no clutter, " +
        "no plastic over-rendered look. Clean, well-composed, genuinely good-looking design that a regular person scrolling " +
        "their feed would find attractive and trustworthy and want to buy from. " +
        "Every image should be striking enough to stop a viewer's thumb mid-scroll. " +
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

    private static string BackgroundStyleHint(string style) =>
        string.Equals(style, "Realistic", StringComparison.OrdinalIgnoreCase)
            ? "Background style: a GOOD-LOOKING REAL-WORLD SETTING — staged like a stylish but down-to-earth product photoshoot " +
              "with broad mainstream appeal. Nice natural light, pleasant ambient fill, clean considered staging — an attractive everyday moment, " +
              "not a busy shelf or cluttered storefront. Materials feel real and tactile: natural wood, linen, ceramic, fresh paper, soft fabric, " +
              "sunlit surfaces — never plastic shine, never cheap glossy reflections. Props are simple, relatable, and tonally aligned with the scene. " +
              "Cool and appealing to ordinary people, not sterile, not elite, not luxury-exclusive. "
            : "Background style: CLEAN, COOL GRAPHIC DESIGN with broad mainstream appeal — the kind of stylish, modern social post " +
              "that looks great to everyone, not just a luxury niche. Confident color blocks or smooth gradients, simple modern accents, " +
              "comfortable negative space, clear good-looking typography. " +
              "No real-world environment, no shelves, no store fixtures, no physical props. " +
              "The backdrop reads as deliberate, attractive design — modern and approachable, never cold, never elite, never clipart, " +
              "never cheap AI-looking, never decorative-for-decoration's-sake. ";

    private static string CreativeDirectionBlock() =>
        "🎨 CREATIVE DIRECTION — non-negotiable aesthetic standard for every pixel of this image:\n\n" +
        "COMPOSITION: rule-of-thirds or intentional asymmetric balance. Generous negative space — let the design breathe. " +
        "One clear hero / focal hierarchy; the eye should know exactly where to land first, second, third. Never cram the canvas. " +
        "Avoid dead-center symmetry unless the composition explicitly calls for it.\n\n" +
        "TYPOGRAPHY: clean, confident hierarchy — but DO NOT invent any headline, tagline, slogan, or marketing copy. " +
        "🚫 NO MADE-UP TEXT: never write phrases like \"Premium Snacking Delights\", \"Discover Your Perfect Crunch\", " +
        "\"Now Available\", \"Shop Now\", or any other invented headline/subtitle/CTA. The image is NOT allowed to contain " +
        "marketing sentences you came up with. The ONLY text permitted is: the brand name / slogan and contact details from the " +
        "brand identity block (only if provided, only where appropriate), and the product names and prices exactly as instructed. " +
        "If no slogan was provided, there is NO headline — let the products and layout carry the design with empty space instead. " +
        "When text does appear, use tight deliberate kerning, a modern geometric sans-serif (Helvetica / Inter / Aktiv-Grotesk feel). " +
        "Flat typography only — no decorative outlines, no gradients on text, no drop shadows on text, no chrome / metallic effects, " +
        "no clipart letterforms, no comic-book bubbles. Letters are crisp and confidently placed.\n\n" +
        "LIGHTING & DEPTH: soft, directional, sculpted illumination — magazine-quality. A subtle gradient of light across the scene " +
        "for depth. Never flat fluorescent lighting, never harsh on-camera flash look, never the over-evenly-lit AI-render look.\n\n" +
        "COLOR DISCIPLINE: use whatever colors make the design look coolest — there is no fixed color count. " +
        "Commit to a confident, striking palette with real attitude: colors that pop, contrast with purpose, and feel art-directed by someone with serious taste. " +
        "Avoid the muddy AI-pastel-everywhere look, avoid rainbow chaos, avoid jarring complementary clashes.\n\n" +
        "TEXTURE & MATERIAL: subtle grain, matte paper feel, soft fabric weave, or a delicate gradient — adds richness over flat backgrounds. " +
        "Never plastic-glossy, never airbrushed, never the smooth-3D-render look (unless the product itself is glossy / 3D — then match the product, not the backdrop).\n\n" +
        "MOOD: confident, appealing, and cool, with broad mainstream taste — attractive to ordinary people of every kind, " +
        "not aimed at an elite or luxury niche. Stylish but approachable. " +
        "Never \"salesy\", never crowded with decoration, never carnival-loud, never cold or snobby.\n\n" +
        "🚫 ANTI-AI / ANTI-GENERIC GUARDRAILS — these are the hallmarks of forgettable AI catalog imagery. None may appear:\n" +
        "- No random sparkles, stars, twinkles, glitters, light flares, lens flares, sun rays, or god-rays.\n" +
        "- No generic glow effects, neon halos, or auras around objects/text.\n" +
        "- No rainbow gradients, holographic gradients, or oversaturated sunset gradients applied randomly.\n" +
        "- No clipart-style icons, cartoon swooshes, or doodle accents.\n" +
        "- No cheesy ribbon banners, scroll banners, or pennant strings.\n" +
        "- No \"SALE!\" / \"NEW!\" / \"%\" starbursts, comic-book bursts, splash badges, or explosion shapes.\n" +
        "- No fake bokeh circles, blurred light orbs, or particle effects.\n" +
        "- No plastic-toy surfaces, fake-3D bevels, or chrome shine on text.\n" +
        "- No busy clutter, no \"more is more\" — restraint over decoration, every time.\n\n" +
        "REFERENCE MOODBOARD (depending on brand fit): clean, cool, broadly-loved consumer brand campaigns — " +
        "the kind of stylish, well-designed social posts and print catalogs that mainstream brands like IKEA, Muji, Trader Joe's, " +
        "Spotify, or a popular local cafe would run. Modern and good-looking, with wide everyday appeal — not luxury, not elite, " +
        "not exclusive, and never cheap AI-looking clipart.\n\n";

    private static string FormatGuidance(string format) =>
        format switch
        {
            "Poster" => "Format guidance: render this in A4 poster format (1:√2 ≈ 1:1.414, vertical). " +
                            "Do not add any extra text beyond what was explicitly stated in the request — no taglines, no decorative copy, no filler.\n\n",

            "Square 1:1" => "Format guidance: this is the Instagram FEED primary ratio (1:1). " +
                            "Centered or rule-of-thirds composition. Keep all critical text and product hero inside a generous safe margin (≥6% from each edge). " +
                            "The image works equally well at thumbnail size in a grid.\n\n",

            "Portrait 4:5" => "Format guidance: this is Instagram's MAXIMUM-HEIGHT feed ratio (4:5) — the highest-engagement feed format. " +
                              "Use vertical hierarchy: a confident headline anchored in the upper third, the product hero in the middle, " +
                              "supporting info (price, brand mark, contact) in the lower third. Take advantage of the extra vertical real estate.\n\n",

            "Story 9:16" => "Format guidance: this is the Instagram/Facebook STORIES & REELS ratio (9:16). " +
                            "Reserve the top ~14% (profile + UI overlay zone) and the bottom ~14% (CTA / sticker / swipe-up zone) of the canvas — " +
                            "keep all critical text and the product hero inside the central ~70% safe zone. " +
                            "Vertical, full-screen, designed to be experienced thumb-up on a phone.\n\n",

            _ => string.Empty,
        };

    // "None" (or empty) means the user wants no fixed color direction — let the AI choose.
    private static bool IsNoTheme(string? theme) =>
        string.IsNullOrWhiteSpace(theme) || string.Equals(theme, "None", StringComparison.OrdinalIgnoreCase);

    private static string ColorThemeGuidance(string theme, string? brandColors, string backgroundStyle)
    {
        if (IsNoTheme(theme))
        {
            bool socialPost = !string.Equals(backgroundStyle, "Realistic", StringComparison.OrdinalIgnoreCase);
            if (socialPost)
            {
                return "Color-theme art direction (auto — no fixed theme, YOU choose, and it must look COOL and SELL): " +
                       "do NOT fill the canvas with a single flat color, and do NOT leave the products floating on a plain, empty, or generic backdrop. " +
                       "Study the provided product photos and pull a cohesive palette straight from them — sample each product's own dominant and accent colors, then build a bold, high-impact backdrop around them so it feels purpose-made for THESE exact products. Use as few or as many colors as the design needs — one striking color, or a dozen — whatever looks coolest; there is no color-count limit here. " +
                       "Make the backdrop visually striking and energetic: dynamic overlapping color blocks, bold diagonal or asymmetric cuts, oversized graphic shapes, halftone or risograph-style print texture, confident retail-poster layouts with real visual punch. " +
                       "Think a standout streetwear drop, a music-festival poster, or a viral brand campaign — eye-catching and full of attitude, NOT minimal, NOT timid, NOT plain. " +
                       "Use FLAT solid-color technique to achieve it (this keeps it crisp and print-quality). " +
                       "🚫 Avoid every hallmark of cheap AI imagery: NO gradients (including duotone washes, holographic, rainbow, or sunset gradients), NO glows, halos, auras, neon, light flares, sparkles, or bokeh, NO soft blurred light, NO over-rendered glossy 3D look. " +
                       "The backdrop must look deliberately art-directed and human-designed — bold and cool, never a flat fill, never empty, never generic, never AI-looking.\n\n";
            }

            return "Color-theme art direction (auto — no fixed theme, YOU choose to best flatter the products): " +
                   "sample the products' own colors from the provided photos and build a harmonious, complementary scheme and real-world setting around them, " +
                   "so the staged scene feels cohesive and intentional — never generic, never a plain empty backdrop. " +
                   "Keep it a believable photographic setting with natural light and real materials — no gradients, glows, halos, neon, or other artificial AI-looking effects.\n\n";
        }

        if (string.Equals(theme, "Brand Colors", StringComparison.OrdinalIgnoreCase))
        {
            string palette = string.IsNullOrWhiteSpace(brandColors)
                ? string.Empty
                : $" The brand palette is: {brandColors} — build the composition on exactly these colors.";
            return "Color-theme art direction (Brand Colors): lean confidently into the brand palette as the dominant compositional structure — " +
                   "use brand colors as large flat color blocks (a backdrop panel, a typography wash, an accent third) or as refined accent details. " +
                   "Never dilute the brand into a generic rainbow; the palette IS the brand voice." + palette + "\n\n";
        }

        if (string.Equals(theme, "Vibrant", StringComparison.OrdinalIgnoreCase))
        {
            return "Color-theme art direction (Vibrant): saturated, confident pop — but disciplined. Pick a 3-color palette (one dominant, one supporting, one accent), " +
                   "intentional contrast, no chaos. Bold but composed — think a Glossier campaign, not a carnival. " +
                   "Saturation serves hierarchy; it never replaces it.\n\n";
        }

        if (string.Equals(theme, "Monochrome", StringComparison.OrdinalIgnoreCase))
        {
            return "Color-theme art direction (Monochrome): tonal layered grayscale — rich blacks, deep contrast, soft mid-grays, paper-white highlights. " +
                   "One single tiny restrained accent of color is permissible (a small price chip, a brand logo accent), but otherwise tonal throughout. " +
                   "Think editorial black-and-white photography or a Helmut Lang campaign.\n\n";
        }

        if (string.Equals(theme, "Dark", StringComparison.OrdinalIgnoreCase))
        {
            return "Color-theme art direction (Dark): moody, cinematic, low-key lighting. Backdrop in deep navy, charcoal, espresso, oxblood, " +
                   "or near-black. Products feel premium and lit from a single soft directional source against the darkness. " +
                   "Typography in warm off-white or muted gold. Think a luxury whisky ad or a high-end skincare night campaign.\n\n";
        }

        if (string.Equals(theme, "Pop Art", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(theme, "Pop-Art", StringComparison.OrdinalIgnoreCase))
        {
            return "Color-theme art direction (Pop Art): Lichtenstein- and Warhol-inspired — flat blocks of bold color, halftone or risograph texture, " +
                   "decisive geometry, thick confident shapes. Limited 3-color palette per composition. Editorial, not childish. " +
                   "Think a contemporary risograph print campaign or a museum-shop poster.\n\n";
        }

        return "Color-theme art direction (default editorial): a neutral premium palette — warm off-white or soft bone backdrop, deep ink or charcoal type, " +
               "and one signal-color accent drawn from the brand or the product itself. Restrained, magazine-quality, confidently quiet.\n\n";
    }

    private static string FinalQualityBar() =>
        "FINAL BAR: this image must look like the lead post of a cool, well-designed brand with broad mainstream appeal — " +
        "genuinely good-looking, confidently restrained, attractive to ordinary people of every kind, and instantly more polished " +
        "than 99% of small-business social-media content (while never looking like cheap, generic AI output). " +
        "If a viewer scrolling through their feed wouldn't stop on this image, the design has failed.";

    private static string BuildPrompt(CatalogImageRequest r)
    {
        string symbol = CurrencyFormatter.SymbolFor(r.Currency);
        string nameList = string.Join(", ", r.Products.Select(p => p.Name));
        string namedWithPrices = string.Join(", ", r.Products.Select(p =>
            $"{p.Name} ({CurrencyFormatter.Format(p.Price, r.Currency)})"));
        string priceList = string.Join(", ", r.Products.Select(p =>
            CurrencyFormatter.Format(p.Price, r.Currency)));

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

        string productsClause = (r.ShowProductNames, r.ShowPrices) switch
        {
            (true, true) => $"Products: {namedWithPrices}. Render each product's name as flat typography near its product. ",
            (true, false) => $"Products: {nameList}. Render each product's name as flat typography near its product. ",
            (false, true) => $"Products (in order): {nameList}. Show only the prices ({priceList}) — one price per product, in the same order — and do NOT render any product name labels, captions, or product-name typography anywhere in the image. ",
            (false, false) => $"Products (in order, for context only): {nameList}. Do NOT render any product name labels, captions, or product-name typography anywhere in the image. ",
        };

        string priceClause = r.ShowPrices
            ? $"Display prices prominently using the {r.Currency} currency (symbol: {symbol})."
            : "Do not show prices.";

        return
            $"{SystemContext}\n\n" +
            LanguageInstruction.For(r.Language) +
            BrandContextBlock(r.BrandContext) +
            logoNote +
            $"Create a stunning, scroll-stopping product catalog ad image in {r.Format} format. " +
            (IsNoTheme(r.ColorTheme) ? "\n\n" : $"Color theme: {r.ColorTheme}.\n\n") +
            FormatGuidance(r.Format) +
            ColorThemeGuidance(r.ColorTheme, r.BrandColors, r.BackgroundStyle) +
            CreativeDirectionBlock() +
            productsClause +
            imageNote +
            priceClause + " " +
            BackgroundStyleHint(r.BackgroundStyle) + "\n\n" +
            FinalQualityBar();
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

        string nameSuppression = r.ShowProductNames
            ? "PRODUCT NAME TEXT — DO render each product's name as flat, clearly readable typography near (but outside the quiet zone of) its corresponding product. " +
              "One name per product, paired unambiguously with its product. Flat typography only — no decorative outline, frame, or stroke around the name text.\n\n"
            : "PRODUCT NAME TEXT — DO NOT render any product name labels, captions, headings, or product-name typography in the image. " +
              "The product silhouettes and the scene speak for themselves; no name text appears anywhere in the rendered output. " +
              "The product names listed in the marker assignments above are STRUCTURAL only (used to associate each product with its outline color) — they are NOT to appear as visible text.\n\n";

        return
            $"IMPORTANT!!!!!: " +
            "🚫 ZERO BOUNDING BOXES: MATCHING PRODUCT OUTLINE ONLY 🚫\n" +
            "The outline MUST be ONE continuous closed curve that traces the product's EXACT organic contour—following" +
            "IT SHOULD BE EXACTLY THE PRODUCT SIZE AND STICKED TO IT, NO SPACE BETWEEN THE OUTLINE AND THE PRODUCT" +
            "every curve, handle, cap, neck, and physical feature. UNDER NO CIRCUMSTANCES are you to draw a bounding box, " +
            "square, rectangle, or any rectilinear frame around the product. Do NOT encapsulate the product inside any shape. " +
            "Do NOT draw BOTH a silhouette and a frame. Just the exact shape of the product itself—that is all! " +
            "Absolutely NO encapsulating outer boxes are allowed, especially not ones using the assigned outline color. " +
            "If the product is a bottle, the outline is shaped exactly like the bottle. Nothing else.\n\n" +
            "🚫 OUTLINES ARE EXCLUSIVE TO PRODUCTS — NOWHERE ELSE 🚫\n" +
            "These exact silhouette outlines are the ONLY borders, strokes, rings, or edge-traces permitted anywhere " +
            "in the entire generated image. Everything else must be rendered FLAT. You must strictly avoid adding decorative " +
            "outlines of any kind to the following:\n" +
            "- Price labels & currency: Typography must be flat (no text outline/stroke/glow). Prices may sit on a filled pill/tag, but that background shape must be a flat fill with NO decorative border/ring, and it MUST NOT use the outline's reserved marker color.\n" +
            "- Text (Names, Headlines, CTAs, Contact info): Flat typography only. No text strokes, no surrounding frames.\n" +
            "- Logos & Brand marks: Reproduce as-is with NO added frames or boxes.\n" +
            "- Layout & UI: NO visible grid cells, panel edges, section dividers, or overall canvas borders.\n\n" +
            "If your design instinct is to stroke a price badge with a border, or frame a headline—DO NOT. " +
            "A filled chip behind a price is fine; an outline around it is forbidden. Outlines belong to products ONLY.\n\n" +
            "⚙️ EXACT TECHNICAL SPECS FOR THE SILHOUETTE ⚙️\n" +
            "Each outline must be a crisp, solid, flat, uniformly-colored line EXACTLY 4 pixels thick. " +
            "NO gradients, NO glows, NO drop shadows, NO soft edges, NO luminosity effects, NO neon halos, NO fades. " +
            "Just a plain solid line of the exact assigned hex color along its entire length. " +
            "The line must hug the product edge tightly and form a fully closed " +
            "loop with zero gaps. Outlines must NOT overlap each other, text, or logos. Do NOT add any blending modes " +
            "or color grading to it. Treat it as a flat, dead-simple printed line stamped directly onto the scene.\n" +
            "🟩 MANDATORY QUIET ZONE (80PX SAFETY BUFFER) 🟩\n" +
            "Immediately surrounding every product outline, you MUST maintain a 'QUIET ZONE': a strip of " +
            "clean, uniform scene background. This zone must be at least 80 pixels wide on all sides of the " +
            "outline. This area is strictly reserved for the scene background—no text, no prices, and no " +
            "decorative elements.\n\n" +
            "⚠️ TECHNICAL REQUIREMENT: PRICE & UI PLACEMENT\n" +
            "Keep all prices, badges, and labels in the vicinity of the product for context, but ensure they " +
            "begin strictly OUTSIDE the 80px quiet zone. This 80px gap is a mandatory safety margin; any " +
            "element placed closer than 80px risks being partially deleted or causing visual artifacts " +
            "during the final composition.\n\n" +
            "WHEN I SAY 80PX I MEAN THE DISTANCE, WE SHOULD HAVE A VISIBLE DISTANCE, DO NOT RENDER TEXT THAT SAYS 40PX, OR RULERS OR ANYTHING RELATED TO THAT" +
            "💡 WHY THE 80PX DISTANCE IS CRITICAL:\n" +
            "After generation, the system automatically removes the product outline plus a 40px perimeter " +
            "around it. We use an 80px quiet zone to ensure that prices and essential text are never " +
            "accidentally clipped. If a price badge sits inside this zone, the 'eraser' will catch it, " +
            "resulting in broken text or messy colored rings around the final product.\n\n" +
            "{SystemContext}\n\n" +
            LanguageInstruction.For(r.Language) +
            BrandContextBlock(r.BrandContext) +
            logoNote +
            productRefNote +
            nameSuppression +
            $"Create a stunning, scroll-stopping product catalog ad image in {r.Format} format. " +
            (IsNoTheme(r.ColorTheme) ? string.Empty : $"Color theme: {r.ColorTheme}. ") + priceLine + "\n\n" +
            FormatGuidance(r.Format) +
            ColorThemeGuidance(r.ColorTheme, r.BrandColors, r.BackgroundStyle) +
            CreativeDirectionBlock() +
            BackgroundStyleHint(r.BackgroundStyle) + "\n" +
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
            "🛑 RESERVED 'DO-NOT-TOUCH' ZONES:\n" +
            "Treat the outlined product regions AND their immediate 80px surroundings as strictly reserved. " +
            "Anything placed inside or overlapping this 80px footprint will be DESTROYED or corrupted " +
            "during the final paste-in process. To keep the erase clean, keep the quiet zone boring.\n" +
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
            FinalQualityBar() + " " +
            "Achieve this WITHOUT violating any of the structural rules above — the outline, quiet-zone, clearance, drop-shadow, and reserved-marker-color rules ALWAYS take precedence over aesthetic ambition.";
    }

    private static string BrandContextBlock(MerchStoryImageGeneration.Models.BrandContext? ctx)
    {
        if (ctx is null)
        {
            return string.Empty;
        }

        // Text that MAY be rendered on the image when relevant (brand identity + contact).
        var renderable = new List<string>();
        if (!string.IsNullOrWhiteSpace(ctx.BrandName))
        {
            renderable.Add($"- Brand name: {ctx.BrandName}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.Slogan))
        {
            renderable.Add($"- Slogan: {ctx.Slogan}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.PhoneNumber))
        {
            renderable.Add($"- Phone: {ctx.PhoneNumber}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.Email))
        {
            renderable.Add($"- Email: {ctx.Email}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.Addresses))
        {
            renderable.Add($"- Address: {ctx.Addresses}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.InstagramHandle))
        {
            renderable.Add($"- Instagram: {ctx.InstagramHandle}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.FacebookHandle))
        {
            renderable.Add($"- Facebook: {ctx.FacebookHandle}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.TikTokHandle))
        {
            renderable.Add($"- TikTok: {ctx.TikTokHandle}");
        }

        // Signals that steer the DESIGN ONLY and must never appear as written text.
        // Brand colors are intentionally NOT included here: for catalogs the palette is
        // driven solely by the "Brand Colors" color theme (see ColorThemeGuidance).
        var designOnly = new List<string>();
        if (!string.IsNullOrWhiteSpace(ctx.BusinessDomain))
        {
            designOnly.Add($"- Business domain: {ctx.BusinessDomain}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.ShopType))
        {
            designOnly.Add($"- Shop type: {ctx.ShopType}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.TargetAudience))
        {
            designOnly.Add($"- Target audience: {ctx.TargetAudience}");
        }

        if (!string.IsNullOrWhiteSpace(ctx.Competitors))
        {
            designOnly.Add($"- Competitors: {ctx.Competitors}");
        }

        if (renderable.Count == 0 && designOnly.Count == 0)
        {
            return string.Empty;
        }

        var sb = new System.Text.StringBuilder();

        if (renderable.Count > 0)
        {
            sb.Append(
                "Brand identity (this is the ONLY information that is ever allowed to appear as written text in the image, " +
                "and ONLY where it naturally belongs — e.g. brand name / slogan in a header, contact details in a footer; " +
                "do not force every field in, and never invent extra copy):\n");
            sb.Append(string.Join("\n", renderable));
            sb.Append("\n\n");
        }

        if (designOnly.Count > 0)
        {
            sb.Append(
                "Design-only signals — use these PURELY to inform aesthetic choices (palette, mood, styling, props, " +
                "composition, photographic treatment). They describe the business; they are NOT marketing copy. " +
                "NONE of these words or values may be written, printed, labeled, or rendered as text ANYWHERE in the image:\n");
            sb.Append(string.Join("\n", designOnly));
            sb.Append("\n\n");
        }

        sb.Append(
            "TEXT DISCIPLINE: the only text permitted in the image is — the brand identity fields listed above (used " +
            "sparingly and only where appropriate), the product names and prices exactly as instructed elsewhere in this prompt, " +
            "and nothing else. Do NOT invent taglines, descriptions, marketing slogans, category labels, or any words derived " +
            "from the design-only signals. If you are unsure whether a piece of text is allowed, leave it out.\n\n");

        return sb.ToString();
    }
}
