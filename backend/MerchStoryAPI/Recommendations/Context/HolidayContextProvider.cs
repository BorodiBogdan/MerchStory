using MerchStoryAPI.Models;
using MerchStoryImageGeneration.Models.Recommendations;

namespace MerchStoryAPI.Recommendations.Context;

// Surfaces upcoming holidays within a 14-day window. All API/DB coordination
// lives in HolidayCache; this provider only does the windowing and severity
// scoring. Severity scales with proximity: ≤3 days = high, ≤7 = medium, else low.
//
// We pull both the current and next year so the window naturally covers the
// December → January boundary without hand-rolling year math.
public class HolidayContextProvider : IContextProvider
{
    private const int LookaheadDays = 14;

    private readonly HolidayCache cache;

    public HolidayContextProvider(HolidayCache cache)
    {
        this.cache = cache;
    }

    public string SourceName => "holiday";

    public async Task<IReadOnlyList<ContextSignal>> GetSignalsAsync(ShopProfile shop, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(shop.CountryCode))
        {
            return Array.Empty<ContextSignal>();
        }

        DateTime today = DateTime.UtcNow.Date;
        DateTime windowEnd = today.AddDays(LookaheadDays);

        List<Holiday> all = new();
        all.AddRange(await this.cache.GetHolidaysAsync(shop.CountryCode, today.Year, ct));
        if (windowEnd.Year != today.Year)
        {
            all.AddRange(await this.cache.GetHolidaysAsync(shop.CountryCode, windowEnd.Year, ct));
        }

        List<ContextSignal> signals = new();
        foreach (Holiday holiday in all)
        {
            DateTime date = holiday.Date.Date;
            if (date < today || date > windowEnd)
            {
                continue;
            }

            int daysAway = (int)(date - today).TotalDays;
            string severity = daysAway switch
            {
                <= 3 => "high",
                <= 7 => "medium",
                _ => "low",
            };

            string englishName = string.IsNullOrWhiteSpace(holiday.Name) ? holiday.LocalName : holiday.Name;
            string localName = string.IsNullOrWhiteSpace(holiday.LocalName) ? englishName : holiday.LocalName;
            string title = string.Equals(englishName, localName, StringComparison.OrdinalIgnoreCase)
                ? $"{englishName} in {daysAway} day{(daysAway == 1 ? string.Empty : "s")}"
                : $"{englishName} ({localName}) in {daysAway} day{(daysAway == 1 ? string.Empty : "s")}";

            signals.Add(new ContextSignal(
                Source: "holiday",
                Title: title,
                Summary: $"{date:MMM d} — public holiday in {shop.CountryCode}.",
                Severity: severity,
                RelevantOnDate: date));
        }

        return signals.OrderBy(s => s.RelevantOnDate).ToArray();
    }
}
