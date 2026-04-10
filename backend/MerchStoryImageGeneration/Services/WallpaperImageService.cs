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
            "You are an expert Graphic Designer and Product Photographer. " +
            "Create a professional social media marketing template image. " +
            "TYPOGRAPHY: If text is requested, use modern, clean, sans-serif fonts with premium spacing.";

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
        sb.AppendLine("\n### LAYOUT STRUCTURE:");
        if (hasHeader && hasFooter)
        {
            sb.AppendLine("- HEADER (Top 15%): Reserved for branding text and logos.");
            sb.AppendLine("- HERO AREA (Middle 70%): Must be a CLEAN, EMPTY STAGE with no text/logos.");
            sb.AppendLine("- FOOTER (Bottom 15%): Reserved for contact/social text.");
        }
        else if (hasHeader && !hasFooter)
        {
            sb.AppendLine("- HEADER (Top 15%): Reserved for branding text and logos.");
            sb.AppendLine("- HERO AREA (Bottom 85%): Must be a CLEAN, EMPTY STAGE with no text. Do not reserve space for a footer.");
        }
        else if (!hasHeader && hasFooter)
        {
            sb.AppendLine("- HERO AREA (Top 85%): Must be a CLEAN, EMPTY STAGE with no text. Do not reserve space for a header.");
            sb.AppendLine("- FOOTER (Bottom 15%): Reserved for contact/social text.");
        }
        else
        {
            sb.AppendLine("- FULL CANVAS (100%): The entire image must be a CLEAN, EMPTY STAGE. Do not reserve margins for text.");
        }

        // --- HEADER TEXT & LOGOS ---
        if (hasHeader)
        {
            sb.AppendLine("\n### HEADER CONTENT:");

            // Strict Logo Instruction
            if (hasImages)
            {
                sb.AppendLine("- BRAND LOGO: Incorporate the provided reference image(s) into the header design. CRITICAL: You must reproduce the logo exactly as provided. Do NOT alter its shape, colors, typography, or details in any way. Keep it completely unmodified.");
            }

            if (bc != null)
            {
                if (!string.IsNullOrWhiteSpace(bc.BrandName))
                {
                    sb.AppendLine($"- Display Brand Name: \"{bc.BrandName}\"");
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

        if (!string.IsNullOrWhiteSpace(r.UserPrompt))
        {
            sb.AppendLine($"- CUSTOM STYLE OVERRIDE: {r.UserPrompt}");
        }
        else
        {
            sb.AppendLine("- VISUAL STYLE: Use a premium, neutral studio aesthetic.");
        }

        if (bc != null)
        {
            if (!string.IsNullOrWhiteSpace(bc.BrandColors))
            {
                sb.AppendLine($"- COLOR PALETTE: Apply the {bc.BrandColors} color scheme seamlessly.");
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

        // --- DYNAMIC FINAL REINFORCEMENT ---
        sb.AppendLine("\n### FINAL QUALITY CHECK:");
        if (hasHeader && hasFooter)
        {
            sb.AppendLine("- Ensure the middle 70% is perfectly lit and completely empty.");
        }
        else if (hasHeader && !hasFooter)
        {
            sb.AppendLine("- Ensure the bottom 85% is perfectly lit and completely empty. Absolutely no text at the bottom.");
        }
        else if (!hasHeader && hasFooter)
        {
            sb.AppendLine("- Ensure the top 85% is perfectly lit and completely empty. Absolutely no text at the top.");
        }
        else
        {
            sb.AppendLine("- Ensure the ENTIRE canvas is perfectly lit and completely empty.");
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
