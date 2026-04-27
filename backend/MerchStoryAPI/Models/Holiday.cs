namespace MerchStoryAPI.Models;

// Cached public holidays. Populated lazily by HolidayCache: on first request
// for a (country, year) we hit Nager.Date once and persist the result, then
// serve subsequent requests from the DB. Holidays don't change once published,
// so there's no refresh policy beyond "cache once per year per country."
public class Holiday
{
    public Guid Id { get; set; }

    public string CountryCode { get; set; } = string.Empty;

    public int Year { get; set; }

    public DateTime Date { get; set; }

    public string LocalName { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;
}
