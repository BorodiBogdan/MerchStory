using System.Text.Json;
using System.Text.Json.Serialization;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using Microsoft.EntityFrameworkCore;

namespace MerchStoryAPI.Recommendations.Context;

// DB-first holiday lookup. On miss we hit Nager.Date once per (country, year)
// and persist the entire year's holidays. Subsequent requests for the same
// pair never touch the network. We don't cache empty results — a transient
// API failure shouldn't poison the cache for a year.
public class HolidayCache
{
    private const string EndpointBase = "https://date.nager.at/api/v3/PublicHolidays";

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly AppDbContext db;
    private readonly HttpClient httpClient;
    private readonly ILogger<HolidayCache> logger;

    public HolidayCache(AppDbContext db, IHttpClientFactory httpFactory, ILogger<HolidayCache> logger)
    {
        this.db = db;
        this.httpClient = httpFactory.CreateClient();
        this.httpClient.Timeout = TimeSpan.FromSeconds(10);
        this.logger = logger;
    }

    public async Task<IReadOnlyList<Holiday>> GetHolidaysAsync(string countryCode, int year, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(countryCode))
        {
            return Array.Empty<Holiday>();
        }

        string normalized = countryCode.ToUpperInvariant();

        bool cached = await this.db.Holidays
            .AnyAsync(h => h.CountryCode == normalized && h.Year == year, ct);
        if (cached)
        {
            return await this.db.Holidays
                .Where(h => h.CountryCode == normalized && h.Year == year)
                .OrderBy(h => h.Date)
                .ToListAsync(ct);
        }

        IReadOnlyList<NagerHoliday> fetched = await this.FetchFromApiAsync(year, normalized, ct);
        if (fetched.Count == 0)
        {
            return Array.Empty<Holiday>();
        }

        List<Holiday> entities = fetched
            .Where(h => !string.IsNullOrWhiteSpace(h.LocalName) || !string.IsNullOrWhiteSpace(h.Name))
            .Select(h => new Holiday
            {
                Id = Guid.NewGuid(),
                CountryCode = normalized,
                Year = year,
                Date = DateTime.SpecifyKind(h.Date, DateTimeKind.Utc),
                LocalName = h.LocalName ?? h.Name ?? string.Empty,
                Name = h.Name ?? h.LocalName ?? string.Empty,
            })
            .ToList();

        this.db.Holidays.AddRange(entities);
        try
        {
            await this.db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
        {
            // Concurrent write from a parallel request — the unique index protects
            // against duplicates. Drop our changes and read what's now in the DB.
            this.logger.LogDebug(ex, "Concurrent insert for holidays {CountryCode}/{Year}, re-reading.", normalized, year);
            foreach (Holiday e in entities)
            {
                this.db.Entry(e).State = EntityState.Detached;
            }

            return await this.db.Holidays
                .Where(h => h.CountryCode == normalized && h.Year == year)
                .OrderBy(h => h.Date)
                .ToListAsync(ct);
        }

        return entities.OrderBy(h => h.Date).ToList();
    }

    private async Task<IReadOnlyList<NagerHoliday>> FetchFromApiAsync(int year, string countryCode, CancellationToken ct)
    {
        string url = $"{EndpointBase}/{year}/{countryCode}";
        try
        {
            using HttpResponseMessage response = await this.httpClient.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode)
            {
                this.logger.LogWarning(
                    "Nager.Date returned {StatusCode} for {Year}/{CountryCode}",
                    response.StatusCode,
                    year,
                    countryCode);
                return Array.Empty<NagerHoliday>();
            }

            string body = await response.Content.ReadAsStringAsync(ct);
            return JsonSerializer.Deserialize<NagerHoliday[]>(body, JsonOpts)
                ?? Array.Empty<NagerHoliday>();
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            this.logger.LogWarning(ex, "Nager.Date fetch failed for {Year}/{CountryCode}", year, countryCode);
            return Array.Empty<NagerHoliday>();
        }
    }

    private record NagerHoliday(
        [property: JsonPropertyName("date")] DateTime Date,
        [property: JsonPropertyName("localName")] string? LocalName,
        [property: JsonPropertyName("name")] string? Name);
}
