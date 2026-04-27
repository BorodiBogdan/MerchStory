namespace MerchStoryAPI.Geocoding;

public interface IGeocodingService
{
    Task<GeocodeResult?> GeocodeAsync(string city, string countryCode, CancellationToken ct);
}

public record GeocodeResult(double Latitude, double Longitude);
