using System.Globalization;
using System.Text;
using MerchStoryImageGeneration.Models;

namespace MerchStoryImageGeneration.Services;

internal sealed class WallpaperImageService : ImageGenerationServiceBase, IWallpaperImageService
{
    public WallpaperImageService(IImageProvider provider)
        : base(provider)
    {
    }

    public Task<ImageGenerationResult> GenerateWallpaperAsync(
        WallpaperImageRequest request,
        CancellationToken cancellationToken = default)
        => this.GenerateAsync(BuildPrompt(request), request.InlineImages, cancellationToken: cancellationToken);

    private static string BuildPrompt(WallpaperImageRequest r)
    {
        const string systemContext =
            "You are an expert Graphic Designer specializing in retail catalogue layouts. " +
            "Your task is to generate a professional marketing background template — a backdrop image onto which real product photos will be composited in post-production. " +
            "The hero area must be simple and clean — a calm, solid or very softly toned color that complements the brand. No busy patterns, no abstract art, no objects. " +
            "TYPOGRAPHY: Only render text that is explicitly listed in the prompt. Do not add any extra text, taglines, or decorative copy. Use modern, clean, sans-serif fonts with premium spacing.";

        var sb = new StringBuilder();
        sb.AppendLine(systemContext);

        // --- STRUCTURAL FORMAT ---
        sb.AppendLine($"\n### CANVAS FORMAT:");
        sb.AppendLine($"- Intended Aspect Ratio: {r.Format} (Structure your composition to fit this layout).");

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
        const string heroStyle = "This is the product placement zone for a retail catalogue. Use a calm, simple color — solid or with a very gentle, barely noticeable shift in tone if it helps the composition, but nothing dramatic. No patterns, no textures, no shapes, no lighting effects, no abstract elements. Think of a clean studio sweep backdrop. Completely empty of any objects, people, or props — real products will be composited here later.";

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
            sb.AppendLine("- VISUAL STYLE: Use a premium, neutral studio aesthetic.");
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

        // This constraint is unconditional — the wallpaper must always be a clean backdrop for product placement
        sb.AppendLine("\n### NON-NEGOTIABLE CONSTRAINTS:");
        sb.AppendLine("- HERO ZONE: Must be a plain, minimal backdrop — flat color or very subtle tone only. No gradients, no textures, no patterns, no decorative elements. Real products will be placed here in post-production; anything in this zone makes it unusable.");
        sb.AppendLine("- TEXT: Do NOT invent, add, or decorate with any text that was not explicitly listed above. Only render the exact strings provided — nothing more, no taglines, no decorative labels, no filler copy.");

        // --- DYNAMIC FINAL REINFORCEMENT ---
        const string heroCheck = "must be a simple, calm color — clean and minimal. No patterns, no textures, no shapes, no dramatic effects. Completely empty of objects. Real products will be placed here in post-production.";

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
