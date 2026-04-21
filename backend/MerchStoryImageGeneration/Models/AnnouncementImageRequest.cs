namespace MerchStoryImageGeneration.Models;

public sealed record AnnouncementImageRequest(
    string PostType,  // "Announcement" | "Job Post" | "Info" | "Promotion"
    string Content,
    string Tone,      // "Professional" | "Friendly" | "Bold" | "Playful"
    string Format,    // "Square 1:1" | "Portrait 4:5" | "Story 9:16"
    BrandContext? BrandContext = null,
    IReadOnlyList<string>? ProductImages = null,  // base64 product photos; used by Promotion
    string? LogoBase64 = null,                    // brand logo inline image
    string? JobTitle = null,                      // Job Post only
    string? JobSchedule = null,                   // Job Post only — work schedule / programme
    string? JobSalary = null,                     // Job Post only — optional
    string? JobImageStyle = null,                 // Job Post only — "with-person" | "text-only"
    IReadOnlyList<string>? JobRequirements = null, // Job Post only — e.g. ["Driver's license", "Communication skills"]
    string Language = "EN");                        // "EN" | "RO" — language of generated copy
