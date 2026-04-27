namespace MerchStoryImageGeneration.Models.Recommendations;

// One environmental signal that can drive a promo angle.
//
// Source vocabulary (lowercase, matches IdeaTone where applicable):
//   "weather" | "holiday" | "news" | "trend"
//
// Severity drives Strategist prioritisation: "high" signals (extreme weather,
// imminent national holiday) win over "low" signals (mild forecast, general
// news). RelevantOnDate is optional — set for time-boxed signals like a
// specific holiday or forecast day; null for broad trends.
public record ContextSignal(
    string Source,
    string Title,
    string Summary,
    string Severity,
    DateTime? RelevantOnDate);
