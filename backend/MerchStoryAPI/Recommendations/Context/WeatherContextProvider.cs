using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using MerchStoryAPI.Models;
using MerchStoryImageGeneration.Models.Recommendations;

namespace MerchStoryAPI.Recommendations.Context;

// Pulls a 7-day forecast from Open-Meteo (free, no key, just lat/lon) and
// flags actionable patterns: heatwaves, cold snaps, heavy-rain weekends,
// storms. Promotes only meaningful deviations — a mild "21°C and sunny" day
// produces no signal (we're not here to narrate the weather, only to flag
// shifts a retailer should react to).
public class WeatherContextProvider : IContextProvider
{
    private const string Endpoint = "https://api.open-meteo.com/v1/forecast";

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly HttpClient httpClient;
    private readonly ILogger<WeatherContextProvider> logger;

    public WeatherContextProvider(IHttpClientFactory httpFactory, ILogger<WeatherContextProvider> logger)
    {
        this.httpClient = httpFactory.CreateClient();
        this.httpClient.Timeout = TimeSpan.FromSeconds(10);
        this.logger = logger;
    }

    public string SourceName => "weather";

    public async Task<IReadOnlyList<ContextSignal>> GetSignalsAsync(ShopProfile shop, CancellationToken ct)
    {
        if (shop.Latitude is null || shop.Longitude is null)
        {
            return Array.Empty<ContextSignal>();
        }

        string url = $"{Endpoint}" +
            $"?latitude={shop.Latitude.Value.ToString(CultureInfo.InvariantCulture)}" +
            $"&longitude={shop.Longitude.Value.ToString(CultureInfo.InvariantCulture)}" +
            "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode" +
            "&timezone=auto&forecast_days=7";

        using HttpResponseMessage response = await this.httpClient.GetAsync(url, ct);
        if (!response.IsSuccessStatusCode)
        {
            this.logger.LogWarning("Open-Meteo returned {StatusCode}", response.StatusCode);
            return Array.Empty<ContextSignal>();
        }

        string body = await response.Content.ReadAsStringAsync(ct);
        Forecast? forecast = JsonSerializer.Deserialize<Forecast>(body, JsonOpts);
        if (forecast?.Daily is null || forecast.Daily.Time.Length == 0)
        {
            return Array.Empty<ContextSignal>();
        }

        return BuildSignals(forecast.Daily);
    }

    private static IReadOnlyList<ContextSignal> BuildSignals(DailyForecast daily)
    {
        List<ContextSignal> signals = new();

        // Heatwave: 3+ consecutive days with max ≥30°C
        int consecutiveHot = 0;
        DateTime? heatwaveStart = null;
        for (int i = 0; i < daily.Time.Length; i++)
        {
            if (daily.TemperatureMax[i] >= 30)
            {
                if (consecutiveHot == 0)
                {
                    heatwaveStart = ParseDay(daily.Time[i]);
                }

                consecutiveHot++;
                if (consecutiveHot == 3 && heatwaveStart is not null)
                {
                    signals.Add(new ContextSignal(
                        Source: "weather",
                        Title: $"Heatwave starting {heatwaveStart:MMM d}",
                        Summary: $"3+ days of ≥30°C peaks — push hydration, cooling foods, no-cook meal kits.",
                        Severity: "high",
                        RelevantOnDate: heatwaveStart));
                    break;
                }
            }
            else
            {
                consecutiveHot = 0;
                heatwaveStart = null;
            }
        }

        // Cold snap: 3+ consecutive days with max <0°C
        int consecutiveCold = 0;
        DateTime? coldStart = null;
        for (int i = 0; i < daily.Time.Length; i++)
        {
            if (daily.TemperatureMax[i] < 0)
            {
                if (consecutiveCold == 0)
                {
                    coldStart = ParseDay(daily.Time[i]);
                }

                consecutiveCold++;
                if (consecutiveCold == 3 && coldStart is not null)
                {
                    signals.Add(new ContextSignal(
                        Source: "weather",
                        Title: $"Cold snap starting {coldStart:MMM d}",
                        Summary: "3+ days below freezing — promote warming foods, hot drinks, comfort cooking ingredients.",
                        Severity: "high",
                        RelevantOnDate: coldStart));
                    break;
                }
            }
            else
            {
                consecutiveCold = 0;
                coldStart = null;
            }
        }

        // Heavy rain or storms (any single day with precipitation probability ≥70%)
        for (int i = 0; i < daily.Time.Length; i++)
        {
            if (daily.PrecipitationProbabilityMax[i] >= 70)
            {
                DateTime day = ParseDay(daily.Time[i]);
                bool isWeekend = day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
                bool isStorm = IsStormCode(daily.WeatherCode[i]);
                int probability = daily.PrecipitationProbabilityMax[i];

                string title = isStorm
                    ? $"Storm risk on {day:dddd MMM d}"
                    : $"Heavy rain on {day:dddd MMM d}";

                string summary = isStorm
                    ? "Storm conditions forecast — pre-storm pantry stockup messaging works well 24-48h ahead."
                    : isWeekend
                        ? $"~{probability}% rain probability — cozy weekend / stay-in promo."
                        : $"~{probability}% rain probability — comfort-purchase nudge.";

                signals.Add(new ContextSignal(
                    Source: "weather",
                    Title: title,
                    Summary: summary,
                    Severity: isStorm ? "high" : "medium",
                    RelevantOnDate: day));
                break; // First wet day is enough for a signal
            }
        }

        return signals;
    }

    private static DateTime ParseDay(string iso)
        => DateTime.SpecifyKind(DateTime.Parse(iso, CultureInfo.InvariantCulture), DateTimeKind.Utc);

    // WMO weather codes for thunderstorm / heavy showers
    // https://open-meteo.com/en/docs (codes 95, 96, 99 = thunderstorm; 82 = violent showers)
    private static bool IsStormCode(int code) => code is 82 or 95 or 96 or 99;

    private record Forecast([property: JsonPropertyName("daily")] DailyForecast? Daily);

    private record DailyForecast(
        [property: JsonPropertyName("time")] string[] Time,
        [property: JsonPropertyName("temperature_2m_max")] double[] TemperatureMax,
        [property: JsonPropertyName("temperature_2m_min")] double[] TemperatureMin,
        [property: JsonPropertyName("precipitation_probability_max")] int[] PrecipitationProbabilityMax,
        [property: JsonPropertyName("weathercode")] int[] WeatherCode);
}
