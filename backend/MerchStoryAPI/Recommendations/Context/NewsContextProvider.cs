using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using MerchStoryAPI.Models;
using MerchStoryImageGeneration.Models.Recommendations;

namespace MerchStoryAPI.Recommendations.Context;

// Pulls top stories from GDELT 2.0 DOC API filtered by sourcecountry. Free,
// documented, no key. We treat all news as "low" severity and limit to a
// handful of articles — the Strategist uses these as ambient context, not as
// strong drivers (compared to weather/holidays which have clear retail action).
//
// GDELT country codes are mostly FIPS 10-4 and don't always match ISO; we
// translate the markets we ship in v1 plus a few common ones. Unknown codes
// produce no signals — better than a bad geo filter.
//
// Unlike holidays, news is genuinely live: cache freshness > 24h is useless.
// We hit the API per recommendation generation; the daily-row cache at the
// route level prevents re-fetching within the same day.
public class NewsContextProvider : IContextProvider
{
    private const string Endpoint = "https://api.gdeltproject.org/api/v2/doc/doc";
    private const int MaxRecordsDefault = 10;
    private const int SignalsToReturn = 5;

    private static readonly Dictionary<string, string> IsoToGdelt = new(StringComparer.OrdinalIgnoreCase)
    {
        ["RO"] = "RO",
        ["MD"] = "MD",
        ["HU"] = "HU",
        ["BG"] = "BU",
        ["US"] = "US",
        ["GB"] = "UK",
        ["DE"] = "GM",
        ["FR"] = "FR",
        ["IT"] = "IT",
        ["ES"] = "SP",
    };

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly HttpClient httpClient;
    private readonly ILogger<NewsContextProvider> logger;
    private readonly int maxRecords;

    public NewsContextProvider(
        IHttpClientFactory httpFactory,
        IConfiguration configuration,
        ILogger<NewsContextProvider> logger)
    {
        this.httpClient = httpFactory.CreateClient();
        this.httpClient.Timeout = TimeSpan.FromSeconds(15);
        this.logger = logger;
        this.maxRecords = configuration.GetValue("Recommendations:News:MaxRecords", MaxRecordsDefault);
    }

    public string SourceName => "news";

    public async Task<IReadOnlyList<ContextSignal>> GetSignalsAsync(ShopProfile shop, CancellationToken ct)
    {
        if (!IsoToGdelt.TryGetValue(shop.CountryCode, out string? gdeltCountry))
        {
            return Array.Empty<ContextSignal>();
        }

        string query = Uri.EscapeDataString($"sourcecountry:{gdeltCountry}");
        string url = $"{Endpoint}?query={query}&mode=ArtList&format=json" +
                     $"&maxrecords={this.maxRecords}&timespan=3days&sort=hybridrel";

        try
        {
            using HttpResponseMessage response = await this.httpClient.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode)
            {
                this.logger.LogWarning(
                    "GDELT returned {StatusCode} for country {CountryCode}",
                    response.StatusCode,
                    shop.CountryCode);
                return Array.Empty<ContextSignal>();
            }

            string body = await response.Content.ReadAsStringAsync(ct);

            // GDELT occasionally responds with HTML on overload — guard the parse.
            if (string.IsNullOrWhiteSpace(body) || !body.TrimStart().StartsWith('{'))
            {
                return Array.Empty<ContextSignal>();
            }

            GdeltResponse? parsed = JsonSerializer.Deserialize<GdeltResponse>(body, JsonOpts);
            if (parsed?.Articles is null || parsed.Articles.Length == 0)
            {
                return Array.Empty<ContextSignal>();
            }

            return parsed.Articles
                .Take(SignalsToReturn)
                .Where(a => !string.IsNullOrWhiteSpace(a.Title))
                .Select(a => new ContextSignal(
                    Source: "news",
                    Title: TruncateTitle(a.Title!),
                    Summary: BuildSummary(a),
                    Severity: "low",
                    RelevantOnDate: ParseGdeltDate(a.SeenDate)))
                .ToArray();
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            this.logger.LogWarning(ex, "GDELT fetch failed for country {CountryCode}", shop.CountryCode);
            return Array.Empty<ContextSignal>();
        }
    }

    private static string TruncateTitle(string title)
        => title.Length > 140 ? title[..137] + "..." : title;

    private static string BuildSummary(GdeltArticle article)
    {
        string when = ParseGdeltDate(article.SeenDate) is { } date ? date.ToString("MMM d") : "recently";
        return string.IsNullOrWhiteSpace(article.Domain)
            ? $"Surfaced {when}."
            : $"{article.Domain} · {when}.";
    }

    // GDELT seendate format: "20260424T143000Z"
    private static DateTime? ParseGdeltDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        if (DateTime.TryParseExact(
                raw,
                "yyyyMMddTHHmmssZ",
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out DateTime parsed))
        {
            return parsed;
        }

        return null;
    }

    private record GdeltResponse([property: JsonPropertyName("articles")] GdeltArticle[]? Articles);

    private record GdeltArticle(
        [property: JsonPropertyName("title")] string? Title,
        [property: JsonPropertyName("url")] string? Url,
        [property: JsonPropertyName("domain")] string? Domain,
        [property: JsonPropertyName("seendate")] string? SeenDate);
}
