namespace MerchStoryImageGeneration.Models.Recommendations;

// One previously-generated idea retrieved for the anti-repetition RAG block.
// Title + summary are enough for the LLM to understand "we already pitched
// this theme, find a new angle".
public record PreviousIdeaHit(
    string Title,
    string Summary,
    DateTime GeneratedAtUtc);
