using System.Globalization;
using System.Text.Json;

namespace MerchStoryAPI.Geocoding;

public class NominatimGeocodingService : IGeocodingService
{
    private const string Endpoint = "https://nominatim.openstreetmap.org/search";

    private readonly HttpClient httpClient;
    private readonly ILogger<NominatimGeocodingService> logger;
    private readonly string userAgent;

    public NominatimGeocodingService(
        IHttpClientFactory httpFactory,
        IConfiguration configuration,
        ILogger<NominatimGeocodingService> logger)
    {
        this.httpClient = httpFactory.CreateClient();
        this.httpClient.Timeout = TimeSpan.FromSeconds(10);
        this.logger = logger;
        this.userAgent = configuration["Recommendations:Geocoding:UserAgent"]
            ?? "MerchStory/1.0";
    }

    public async Task<GeocodeResult?> GeocodeAsync(string city, string countryCode, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(city) || string.IsNullOrWhiteSpace(countryCode))
        {
            return null;
        }

        string url = $"{Endpoint}" +
            $"?city={Uri.EscapeDataString(city.Trim())}" +
            $"&countrycodes={Uri.EscapeDataString(countryCode.Trim().ToLowerInvariant())}" +
            "&format=json&limit=1";

        try
        {
            using HttpRequestMessage req = new(HttpMethod.Get, url);

            // Nominatim usage policy requires an identifying User-Agent.
            req.Headers.Add("User-Agent", this.userAgent);

            using HttpResponseMessage response = await this.httpClient.SendAsync(req, ct);
            if (!response.IsSuccessStatusCode)
            {
                this.logger.LogWarning(
                    "Nominatim returned {StatusCode} for city={City} country={CountryCode}",
                    response.StatusCode,
                    city,
                    countryCode);
                return null;
            }

            string json = await response.Content.ReadAsStringAsync(ct);
            using JsonDocument doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array || doc.RootElement.GetArrayLength() == 0)
            {
                return null;
            }

            JsonElement first = doc.RootElement[0];
            if (!first.TryGetProperty("lat", out JsonElement latEl) ||
                !first.TryGetProperty("lon", out JsonElement lonEl))
            {
                return null;
            }

            string? latStr = latEl.GetString();
            string? lonStr = lonEl.GetString();
            if (latStr is null || lonStr is null ||
                !double.TryParse(latStr, NumberStyles.Float, CultureInfo.InvariantCulture, out double lat) ||
                !double.TryParse(lonStr, NumberStyles.Float, CultureInfo.InvariantCulture, out double lon))
            {
                return null;
            }

            return new GeocodeResult(lat, lon);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            this.logger.LogWarning(
                ex, "Geocoding failed for city={City} country={CountryCode}", city, countryCode);
            return null;
        }
    }
}
