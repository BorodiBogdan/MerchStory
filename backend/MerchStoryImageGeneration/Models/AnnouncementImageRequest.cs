namespace MerchStoryImageGeneration.Models;

public sealed record AnnouncementImageRequest(
    string PostType,  // "Announcement" | "Job Post" | "Info" | "Promotion"
    string Content,
    string Tone,      // "Professional" | "Friendly" | "Bold" | "Playful"
    string Format);   // "Square 1:1" | "Portrait 4:5" | "Story 9:16"
