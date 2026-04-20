using MerchStoryImageGeneration.Models;

namespace MerchStoryImageGeneration.Services;

internal sealed class AnnouncementImageService : ImageGenerationServiceBase, IAnnouncementImageService
{
    public AnnouncementImageService(IImageProvider provider)
        : base(provider)
    {
    }

    public Task<ImageGenerationResult> GenerateAnnouncementImageAsync(
        AnnouncementImageRequest request,
        CancellationToken cancellationToken = default)
        => this.GenerateAsync(BuildPrompt(request), BuildInlineImages(request), cancellationToken);

    private static List<string>? BuildInlineImages(AnnouncementImageRequest r)
    {
        var images = new List<string>();
        if (!string.IsNullOrWhiteSpace(r.LogoBase64))
        {
            images.Add(r.LogoBase64);
        }

        if (r.PostType == "Promotion" && r.ProductImages != null)
        {
            images.AddRange(r.ProductImages);
        }

        return images.Count > 0 ? images : null;
    }

    private static string BuildPrompt(AnnouncementImageRequest r) => r.PostType switch
    {
        "Job Post" => BuildJobPostPrompt(r),
        "Promotion" => BuildPromotionPrompt(r),
        _ => BuildAnnouncementPrompt(r),
    };

    // ── Announcement (covers both event news and informational tip-cards) ────────
    private static string BuildAnnouncementPrompt(AnnouncementImageRequest r) =>
        "You are a professional social media graphic designer for small retail businesses. " +
        "Produce clean, modern announcement graphics that communicate news or useful information clearly. " +
        "Never add watermarks, placeholders, or generic stock imagery.\n\n" +
        BrandContextBlock(r.BrandContext) +
        LogoBlock(r.LogoBase64) +
        $"Create a {r.Tone.ToLowerInvariant()} announcement social media graphic in {r.Format} format. " +
        $"Announcement content: \"{r.Content}\". " +
        "Read the content and pick the right treatment: " +
        "if it describes an event or news (opening hours, new arrival, upcoming event), " +
        "use a bold headline that dominates the layout, with supporting date/time/location details if mentioned. " +
        "If it describes a tip, fact, or educational piece of information, " +
        "treat it as a tip card / info card — short punchy headline capturing the key insight, " +
        "supporting body copy that elaborates briefly, and room for a simple icon or illustration. " +
        "In both cases: clean background that does not compete with the text, " +
        "clear hierarchy, and this is NOT a sale or promotion — do not add discount language or urgency CTAs.";

    // ── Job Post ─────────────────────────────────────────────────────────────────
    private static string BuildJobPostPrompt(AnnouncementImageRequest r)
    {
        var hasStructured = !string.IsNullOrWhiteSpace(r.JobTitle)
                            && !string.IsNullOrWhiteSpace(r.JobSchedule);

        if (!hasStructured)
        {
            // Backward-compatible fallback: legacy free-text prompt.
            return "You are a professional social media graphic designer specializing in recruitment visuals for small retail businesses. " +
                   "Produce modern, welcoming hiring graphics that attract qualified candidates. " +
                   "Never add watermarks, placeholders, or generic stock imagery.\n\n" +
                   BrandContextBlock(r.BrandContext) +
                   LogoBlock(r.LogoBase64) +
                   $"Create a {r.Tone.ToLowerInvariant()} job-posting social media graphic in {r.Format} format. " +
                   $"Job details: \"{r.Content}\". " +
                   "Design requirements: a prominent \"We're Hiring\" or \"Join Our Team\" hook as the hero headline; " +
                   "the role title clearly visible as a secondary headline; " +
                   "a short, friendly CTA (e.g. \"Apply Today\" or \"DM us to apply\"); " +
                   "professional yet approachable tone — avoid corporate coldness; " +
                   "clean layout with good whitespace so the role stands out immediately.";
        }

        var jobDetailLines = new List<string>
        {
            $"- Job title: {r.JobTitle}",
            $"- Work schedule: {r.JobSchedule}",
        };
        if (!string.IsNullOrWhiteSpace(r.JobSalary))
        {
            jobDetailLines.Add($"- Salary: {r.JobSalary}");
        }

        var jobDetailsBlock = "Job details:\n" + string.Join("\n", jobDetailLines) + "\n\n";

        var cleanRequirements = r.JobRequirements?
            .Where(req => !string.IsNullOrWhiteSpace(req))
            .Select(req => req.Trim())
            .ToList();

        var requirementsBlock = cleanRequirements is { Count: > 0 }
            ? "Requirements (render these as a clearly visible bulleted 'Requirements:' list on the graphic, one item per line):\n"
              + string.Join("\n", cleanRequirements.Select(req => $"- {req}"))
              + "\n\n"
            : string.Empty;

        var directionBlock = string.IsNullOrWhiteSpace(r.Content)
            ? string.Empty
            : $"Additional direction from the user: \"{r.Content}\".\n\n";

        var isWithPerson = string.Equals(r.JobImageStyle, "with-person", StringComparison.OrdinalIgnoreCase);

        var styleBlock = isWithPerson
            ? "Visual style: WITH PERSON. " +
              "The hero of the graphic must be a realistic, respectful depiction of a person actively performing the advertised role " +
              "(matching the job title above — e.g. a barista pulling espresso for a barista role, a mechanic under a hood for a mechanic role). " +
              "Overlay the job title, work schedule, and salary (if provided) in a clearly readable panel or banner over the image — " +
              "the text must remain legible against the photo (use a semi-transparent panel or strong contrast). " +
              "Keep the 'We're Hiring' / 'Join Our Team' hook visible. "
            : "Visual style: TEXT ONLY. " +
              "Do NOT include any people, faces, or human figures. " +
              "Use a clean typographic / graphic layout where the job details are the hero: " +
              "a prominent 'We're Hiring' or 'Join Our Team' hook, the job title as a large secondary headline, " +
              "and the work schedule and salary (if provided) as clearly grouped supporting text. " +
              "Rely on brand colors, shapes, and iconography — never stock photos of people. ";

        // STRICT: no invented CTAs. Only render application instructions if the user explicitly asked for them.
        var ctaRule =
            "Call-to-action policy: this is an informational announcement. " +
            "Do NOT invent or add any call-to-action, application instruction, contact method, or phrases like " +
            "'Apply Today', 'Apply Now', 'DM us to apply', 'Click the link', 'Follow the link', 'Send an email', " +
            "'Call us', 'Visit our website', 'Scan the QR', or similar. " +
            "ONLY include an application instruction if the user's 'Additional direction' above explicitly requests one " +
            "(for example: 'apply by email at jobs@example.com') — and in that case, render exactly what the user asked for, nothing more. " +
            "If no such direction is provided, leave the graphic free of any apply-instruction text. ";

        return "You are a professional social media graphic designer specializing in recruitment visuals for small retail businesses. " +
               "Produce modern, welcoming hiring graphics that attract qualified candidates. " +
               "Never add watermarks, placeholders, or generic stock imagery.\n\n" +
               BrandContextBlock(r.BrandContext) +
               LogoBlock(r.LogoBase64) +
               $"Create a {r.Tone.ToLowerInvariant()} job-posting social media graphic in {r.Format} format.\n\n" +
               jobDetailsBlock +
               requirementsBlock +
               directionBlock +
               styleBlock +
               ctaRule +
               "Professional yet approachable tone — avoid corporate coldness. " +
               "Clean layout with good whitespace so the role stands out immediately.";
    }

    // ── Promotion ────────────────────────────────────────────────────────────────
    private static string BuildPromotionPrompt(AnnouncementImageRequest r)
    {
        bool hasProductPhotos = r.ProductImages is { Count: > 0 };

        return "You are a professional social media graphic designer for small retail businesses. " +
               "Produce high-impact promotional sale graphics that drive immediate purchases. " +
               "Never add watermarks, placeholders, or generic stock imagery.\n\n" +
               BrandContextBlock(r.BrandContext) +
               LogoBlock(r.LogoBase64) +
               $"Create a {r.Tone.ToLowerInvariant()} promotional sale graphic in {r.Format} format. " +
               $"Promotion details: \"{r.Content}\". " +
               "Design requirements: the discount or offer (e.g. \"20% OFF\") must be the largest, " +
               "most eye-catching element on the graphic — treat it as the hero; " +
               "urgency language (\"Limited Time\", \"This Weekend Only\", \"While Stocks Last\") if relevant; " +
               "a clear CTA (\"Shop Now\", \"Visit Us Today\"); " +
               (hasProductPhotos
                   ? $"{r.ProductImages!.Count} product reference photo(s) are attached — " +
                     "incorporate the actual product(s) shown as the visual centrepiece of the graphic, " +
                     "styled attractively; do not invent substitute products; "
                   : "no product photos provided — use bold typography, graphic shapes, and brand colours as the visual focus; ") +
               "overall feel: exciting, urgent, impossible to scroll past.";
    }

    // ── Logo block ────────────────────────────────────────────────────────────────
    private static string LogoBlock(string? logoBase64) =>
        string.IsNullOrWhiteSpace(logoBase64)
            ? string.Empty
            : "Brand logo: a logo image has been provided as an inline image. " +
              "Place it in a natural brand position (e.g. top corner or header area). " +
              "ABSOLUTE RULE: reproduce the logo pixel-perfect — do NOT recolor, restyle, " +
              "redraw, reinterpret, regenerate, crop, or alter it in any way for any reason, " +
              "including matching brand colors or the overall image style. " +
              "The logo is always used EXACTLY as provided. " +
              "If the logo already contains the brand name, do NOT add the brand name again as separate text.\n\n";

    // ── Shared brand context block ────────────────────────────────────────────────
    private static string BrandContextBlock(BrandContext? ctx)
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
