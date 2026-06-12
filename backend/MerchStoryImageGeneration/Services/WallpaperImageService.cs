using System.Globalization;
using System.Text;
using MerchStoryImageGeneration.Models;

namespace MerchStoryImageGeneration.Services;

internal sealed class WallpaperImageService : ImageGenerationServiceBase, IWallpaperImageService
{
    private readonly IImageProviderResolver providerResolver;

    public WallpaperImageService(IImageProvider provider, IImageProviderResolver providerResolver)
        : base(provider)
    {
        this.providerResolver = providerResolver;
    }

    public Task<ImageGenerationResult> GenerateWallpaperAsync(
        WallpaperImageRequest request,
        CancellationToken cancellationToken = default)
    {
        // Like the catalog flow, let the caller switch the underlying model per
        // request (nano banana / Gemini by default, OpenAI on demand).
        IImageProvider provider = this.providerResolver.Resolve(request.ImageModel);
        return provider.GenerateAsync(BuildPrompt(request), request.InlineImages, cancellationToken);
    }

    private static string BuildPrompt(WallpaperImageRequest r)
    {
        const string systemContext =
            "You are an award-winning Art Director specializing in premium retail marketing visuals. " +
            "Your task is to generate a striking, designer-made background template — a polished backdrop onto which real product photos will be composited in post-production. " +
            "Make it genuinely cool and high-end: rich color, soft studio lighting, atmospheric depth, smooth gradients, and tasteful modern design elements (soft geometric shapes, light blooms, gentle organic forms, subtle depth-of-field) so it looks like an editorial marketing piece, NOT a flat dead color fill. Be bold. " +
            "Keep the composition cohesive and avoid chaotic, high-contrast noise right in the middle so products composited on top still read well — but do not play it safe; a beautiful, alive backdrop is the goal. " +
            "TYPOGRAPHY: Only render text that is explicitly listed in the prompt. Do not add any extra text, taglines, or decorative copy. Use modern, clean, sans-serif fonts with premium spacing.";

        var sb = new StringBuilder();
        sb.AppendLine(systemContext);
        sb.Append(LanguageInstruction.For(r.Language));

        // --- STRUCTURAL FORMAT ---
        sb.AppendLine($"\n### CANVAS FORMAT:");
        var aspectDescription = string.Equals(r.Format, "Poster", StringComparison.OrdinalIgnoreCase)
            ? "A4 (1:√2 ≈ 1:1.414, vertical print poster)"
            : r.Format;
        sb.AppendLine($"- Intended Aspect Ratio: {aspectDescription} (Structure your composition to fit this layout).");

        var bc = r.BrandContext;
        bool hasImages = r.InlineImages != null && r.InlineImages.Any();

        // --- BOOLEAN FLAGS FOR LAYOUT ---
        // A header exists if there is BrandName, Slogan, OR an InlineImage (Logo)
        bool hasHeader = (bc != null && (!string.IsNullOrWhiteSpace(bc.BrandName) || !string.IsNullOrWhiteSpace(bc.Slogan))) || hasImages;

        bool hasContact = bc != null && (!string.IsNullOrWhiteSpace(bc.Addresses) ||
                                            !string.IsNullOrWhiteSpace(bc.PhoneNumber) ||
                                            !string.IsNullOrWhiteSpace(bc.Email));

        bool hasSocials = bc != null && (!string.IsNullOrWhiteSpace(bc.InstagramHandle) ||
                                            !string.IsNullOrWhiteSpace(bc.FacebookHandle) ||
                                            !string.IsNullOrWhiteSpace(bc.TikTokHandle));

        bool hasFooter = hasContact || hasSocials;

        // --- DYNAMIC LAYOUT LOGIC ---
        const string heroStyle = "This is where products will be composited for a retail catalogue, so make it a beautiful, premium studio backdrop with real depth and life — not a plain color fill. Use rich smooth gradients, soft diffused studio lighting, gentle vignettes or light blooms, atmospheric depth, and tasteful modern design accents (soft geometric shapes, subtle bands, gentle organic forms) — concentrate the boldest detail toward the edges and corners. Keep it cohesive and avoid harsh, high-contrast clutter or literal objects, props, or people right in the center where products will sit, so the products still stand out. Otherwise be bold and make it look genuinely cool and designed.";

        sb.AppendLine("\n### LAYOUT STRUCTURE:");
        if (hasHeader && hasFooter)
        {
            sb.AppendLine("- HEADER (Top 15%): Reserved for branding text and logos.");
            sb.AppendLine($"- HERO AREA (Middle 70%): {heroStyle}");
            sb.AppendLine("- FOOTER (Bottom 15%): Reserved for contact/social text.");
        }
        else if (hasHeader && !hasFooter)
        {
            sb.AppendLine("- HEADER (Top 15%): Reserved for branding text and logos.");
            sb.AppendLine($"- HERO AREA (Bottom 85%): {heroStyle} Do not reserve space for a footer.");
        }
        else if (!hasHeader && hasFooter)
        {
            sb.AppendLine($"- HERO AREA (Top 85%): {heroStyle} Do not reserve space for a header.");
            sb.AppendLine("- FOOTER (Bottom 15%): Reserved for contact/social text.");
        }
        else
        {
            sb.AppendLine($"- FULL CANVAS (100%): {heroStyle}");
        }

        // --- HEADER TEXT & LOGOS ---
        if (hasHeader)
        {
            sb.AppendLine("\n### HEADER CONTENT:");

            // Strict Logo Instruction
            if (hasImages)
            {
                sb.AppendLine("- BRAND LOGO: Place the provided logo in the header. ABSOLUTE RULE: reproduce it pixel-perfect — do NOT recolor, reinterpret, restyle, or alter it in any way for any reason, including brand color matching. The logo is always used as-is.");
            }

            if (bc != null)
            {
                if (!string.IsNullOrWhiteSpace(bc.BrandName))
                {
                    if (hasImages)
                    {
                        sb.AppendLine(CultureInfo.InvariantCulture, $"- Brand Name \"{bc.BrandName}\": ONLY display this as separate text if the logo above does NOT already contain this name. If the logo already includes the brand name, skip adding it as a separate text element.");
                    }
                    else
                    {
                        sb.AppendLine(CultureInfo.InvariantCulture, $"- Display Brand Name: \"{bc.BrandName}\"");
                    }
                }

                if (!string.IsNullOrWhiteSpace(bc.Slogan))
                {
                    sb.AppendLine($"- Display Slogan: \"{bc.Slogan}\"");
                }
            }
        }

        // --- FOOTER TEXT ---
        if (hasFooter)
        {
            sb.AppendLine("\n### FOOTER CONTENT:");
            if (!string.IsNullOrWhiteSpace(bc!.Addresses))
            {
                sb.AppendLine($"- Display Address: \"{bc.Addresses}\"");
            }

            var contacts = new List<string>();
            if (!string.IsNullOrWhiteSpace(bc.PhoneNumber))
            {
                contacts.Add($"Tel: {bc.PhoneNumber}");
            }

            if (!string.IsNullOrWhiteSpace(bc.Email))
            {
                contacts.Add(bc.Email);
            }

            if (contacts.Any())
            {
                sb.AppendLine($"- Display Contact Info: {string.Join(" | ", contacts)}");
            }

            var socials = new List<string>();
            if (!string.IsNullOrWhiteSpace(bc.InstagramHandle))
            {
                socials.Add($"IG: {bc.InstagramHandle}");
            }

            if (!string.IsNullOrWhiteSpace(bc.FacebookHandle))
            {
                socials.Add($"FB: {bc.FacebookHandle}");
            }

            if (!string.IsNullOrWhiteSpace(bc.TikTokHandle))
            {
                socials.Add($"TikTok: {bc.TikTokHandle}");
            }

            if (socials.Any())
            {
                sb.AppendLine($"- Display Socials: {string.Join(" | ", socials)}");
            }
        }

        // --- HEADER / FOOTER STYLING ---
        // Without explicit art direction the model defaults to flat, hard-edged colored
        // stripes that read as "ugly bands". Steer it toward an integrated, premium treatment.
        if (hasHeader || hasFooter)
        {
            sb.AppendLine("\n### HEADER / FOOTER STYLING:");
            sb.AppendLine("- Treat the branding bands as part of one cohesive, premium composition — never as flat colored stripes slapped on top.");
            sb.AppendLine("- Prefer an elegant, minimal treatment: generous negative space, a refined typographic hierarchy, and a thin accent rule or subtle divider instead of a heavy solid block.");
            sb.AppendLine("- If you tint a band, use a soft, tasteful tone from the brand palette with a smooth, gradient edge that blends naturally into the hero — no harsh flat rectangle with a hard seam.");
            sb.AppendLine("- Keep the lighting, color temperature, and finish of the bands consistent with the hero so the whole piece reads as a single high-end design.");
        }

        // --- ARTISTIC DIRECTION & VIBE ---
        sb.AppendLine("\n### ARTISTIC DIRECTION & VIBE:");

        bool hasUserPrompt = !string.IsNullOrWhiteSpace(r.UserPrompt);

        if (hasUserPrompt)
        {
            sb.AppendLine(CultureInfo.InvariantCulture, $"- USER DIRECTION: {r.UserPrompt}");
            sb.AppendLine("- This user direction takes priority. Where it overlaps with any default style, color, scenery, or mood guidance below, follow the user direction instead.");
        }
        else
        {
            sb.AppendLine("- VISUAL STYLE: Premium, modern, editorial studio aesthetic — rich color, soft diffused lighting, smooth gradients, and atmospheric depth that make the backdrop feel intentionally designed and high-end.");
        }

        if (bc != null)
        {
            if (!string.IsNullOrWhiteSpace(bc.BrandColors) && !hasUserPrompt)
            {
                sb.AppendLine(CultureInfo.InvariantCulture, $"- COLOR PALETTE: Use {bc.BrandColors} to color the wallpaper background, header/footer areas, and any text elements. NEVER apply these colors to the logo — the logo must remain exactly as provided regardless of the palette.");
            }
            else if (!string.IsNullOrWhiteSpace(bc.BrandColors))
            {
                sb.AppendLine(CultureInfo.InvariantCulture, $"- BRAND COLORS (reference for the wallpaper and text, defer to user direction if it conflicts — never apply to the logo): {bc.BrandColors}.");
            }

            if (!string.IsNullOrWhiteSpace(bc.BusinessDomain) || !string.IsNullOrWhiteSpace(bc.ShopType))
            {
                sb.AppendLine($"- SCENERY THEME: Match a high-end {bc.ShopType} in the {bc.BusinessDomain} industry.");
            }

            if (!string.IsNullOrWhiteSpace(bc.TargetAudience))
            {
                sb.AppendLine($"- MOOD: Design the lighting to appeal directly to {bc.TargetAudience}.");
            }

            if (!string.IsNullOrWhiteSpace(bc.Competitors))
            {
                sb.AppendLine($"- QUALITY STANDARD: Elevate the luxury feel to compete with {bc.Competitors}. (CRITICAL: Do NOT write these competitor names anywhere in the image).");
            }
        }

        // This constraint is unconditional — the wallpaper must stay usable as a backdrop for product placement
        sb.AppendLine("\n### NON-NEGOTIABLE CONSTRAINTS:");
        sb.AppendLine("- PRODUCT ZONE: Real products are composited on top in post-production, so keep the center cohesive and free of literal objects, props, or people and free of chaotic high-contrast noise that would fight the products. Rich gradients, soft lighting, depth, vignettes, and tasteful design accents are encouraged — just keep them from overwhelming the area where products sit.");
        sb.AppendLine("- TEXT: Do NOT invent, add, or decorate with any text that was not explicitly listed above. Only render the exact strings provided — nothing more, no taglines, no decorative labels, no filler copy.");

        // --- DYNAMIC FINAL REINFORCEMENT ---
        const string heroCheck = "should look like a premium, designer-made studio backdrop — rich gradients, soft lighting, depth, and tasteful modern accents are encouraged. Just keep it cohesive (no chaotic high-contrast noise and no literal objects, props, or people right where products sit) so the products composited on top still read clearly. Real products will be placed here in post-production.";

        sb.AppendLine("\n### FINAL QUALITY CHECK:");
        if (hasHeader && hasFooter)
        {
            sb.AppendLine($"- The middle 70% {heroCheck}");
        }
        else if (hasHeader && !hasFooter)
        {
            sb.AppendLine($"- The bottom 85% {heroCheck}");
        }
        else if (!hasHeader && hasFooter)
        {
            sb.AppendLine($"- The top 85% {heroCheck}");
        }
        else
        {
            sb.AppendLine($"- The ENTIRE canvas {heroCheck}");
        }

        if (hasHeader || hasFooter)
        {
            sb.AppendLine("- All text must be sharp, correctly spelled, and strictly confined to the designated zones.");
        }
        else
        {
            sb.AppendLine("- ABSOLUTELY NO TEXT, NO LOGOS, AND NO WATERMARKS anywhere in the image.");
        }

        return sb.ToString();
    }
}
