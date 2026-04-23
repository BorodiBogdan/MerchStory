using System.Globalization;
using System.Text.RegularExpressions;

namespace MerchStoryAPI.ImageGeneration;

internal static class MarkerPaletteSelector
{
    private const double MinBrandDistance = 80.0;

    // Fixed priority order; spaced ~30° apart in hue at full saturation.
    // Risky-for-retail hues (pure yellow, pure blue, pure red, pure green, sky-blue) deliberately excluded.
    private static readonly (string Name, byte R, byte G, byte B)[] Pool =
    [
        ("Magenta",          0xFF, 0x00, 0xFF),
        ("Cyan",             0x00, 0xFF, 0xFF),
        ("Electric violet",  0x9D, 0x00, 0xFF),
        ("Hot pink",         0xFF, 0x00, 0x80),
        ("Chartreuse",       0x80, 0xFF, 0x00),
        ("Neon orange-red",  0xFF, 0x33, 0x00),
        ("Electric lime",    0xCC, 0xFF, 0x00),
        ("Teal",             0x00, 0xFF, 0xAA),
        ("Deep magenta",     0xFF, 0x00, 0xAA),
        ("Rose",             0xFF, 0x00, 0x60),
        ("Spring green",     0x00, 0xFF, 0x80),
        ("Neon blue-violet", 0x60, 0x00, 0xFF),
    ];

    // Themes whose natural palette would routinely overlap with saturated greens/teals.
    private static readonly HashSet<string> GreenUnfriendlyThemes = new(StringComparer.OrdinalIgnoreCase)
    {
        "Vibrant", "Pop Art", "Pop-Art",
    };

    private static readonly Dictionary<string, (byte R, byte G, byte B)> CommonColorNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ["red"] = (0xFF, 0x00, 0x00),
        ["crimson"] = (0xDC, 0x14, 0x3C),
        ["pink"] = (0xFF, 0x69, 0xB4),
        ["magenta"] = (0xFF, 0x00, 0xFF),
        ["purple"] = (0x80, 0x00, 0x80),
        ["violet"] = (0x8A, 0x2B, 0xE2),
        ["blue"] = (0x00, 0x00, 0xFF),
        ["navy"] = (0x00, 0x00, 0x80),
        ["cyan"] = (0x00, 0xFF, 0xFF),
        ["turquoise"] = (0x40, 0xE0, 0xD0),
        ["teal"] = (0x00, 0x80, 0x80),
        ["green"] = (0x00, 0xFF, 0x00),
        ["lime"] = (0x00, 0xFF, 0x00),
        ["olive"] = (0x80, 0x80, 0x00),
        ["yellow"] = (0xFF, 0xFF, 0x00),
        ["gold"] = (0xFF, 0xD7, 0x00),
        ["orange"] = (0xFF, 0xA5, 0x00),
        ["brown"] = (0xA5, 0x2A, 0x2A),
        ["black"] = (0x00, 0x00, 0x00),
        ["white"] = (0xFF, 0xFF, 0xFF),
        ["gray"] = (0x80, 0x80, 0x80),
        ["grey"] = (0x80, 0x80, 0x80),
    };

    public static PaletteSelectionResult Select(int productCount, string? brandColors, string? colorTheme)
    {
        var brandRgbs = ParseBrandColors(brandColors);
        var disallowedByTheme = IsGreenUnfriendly(colorTheme)
            ? new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Teal", "Electric lime", "Chartreuse", "Spring green" }
            : new HashSet<string>();

        var chosen = new List<(string Name, string Hex)>(capacity: productCount);
        var rejected = new List<string>();

        foreach (var candidate in Pool)
        {
            if (chosen.Count == productCount)
            {
                break;
            }

            if (disallowedByTheme.Contains(candidate.Name))
            {
                rejected.Add(candidate.Name);
                continue;
            }

            if (ConflictsWithBrand(candidate, brandRgbs))
            {
                rejected.Add(candidate.Name);
                continue;
            }

            chosen.Add((candidate.Name, ToHex(candidate)));
        }

        return new PaletteSelectionResult(
            Colors: chosen,
            Requested: productCount,
            Rejected: rejected);
    }

    private static List<(byte R, byte G, byte B)> ParseBrandColors(string? brandColors)
    {
        var result = new List<(byte R, byte G, byte B)>();
        if (string.IsNullOrWhiteSpace(brandColors))
        {
            return result;
        }

        var hexMatches = Regex.Matches(brandColors, "#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\\b");
        foreach (Match m in hexMatches)
        {
            var parsed = TryParseHex(m.Groups[1].Value);
            if (parsed.HasValue)
            {
                result.Add(parsed.Value);
            }
        }

        var tokens = Regex.Split(brandColors, "[^a-zA-Z]+");
        foreach (var token in tokens)
        {
            if (string.IsNullOrWhiteSpace(token))
            {
                continue;
            }

            if (CommonColorNames.TryGetValue(token, out var rgb))
            {
                result.Add(rgb);
            }
        }

        return result;
    }

    private static (byte R, byte G, byte B)? TryParseHex(string hex)
    {
        if (hex.Length == 3)
        {
            hex = $"{hex[0]}{hex[0]}{hex[1]}{hex[1]}{hex[2]}{hex[2]}";
        }

        if (hex.Length != 6)
        {
            return null;
        }

        if (!byte.TryParse(hex.AsSpan(0, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var r)
            || !byte.TryParse(hex.AsSpan(2, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var g)
            || !byte.TryParse(hex.AsSpan(4, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var b))
        {
            return null;
        }

        return (r, g, b);
    }

    private static bool ConflictsWithBrand(
        (string Name, byte R, byte G, byte B) candidate,
        IReadOnlyList<(byte R, byte G, byte B)> brandRgbs)
    {
        foreach (var brand in brandRgbs)
        {
            double dr = candidate.R - brand.R;
            double dg = candidate.G - brand.G;
            double db = candidate.B - brand.B;
            var distance = Math.Sqrt((dr * dr) + (dg * dg) + (db * db));
            if (distance < MinBrandDistance)
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsGreenUnfriendly(string? colorTheme)
    {
        return !string.IsNullOrWhiteSpace(colorTheme) && GreenUnfriendlyThemes.Contains(colorTheme);
    }

    private static string ToHex((string Name, byte R, byte G, byte B) c)
        => string.Create(7, c, (span, color) =>
        {
            span[0] = '#';
            color.R.TryFormat(span[1..], out _, "X2", CultureInfo.InvariantCulture);
            color.G.TryFormat(span[3..], out _, "X2", CultureInfo.InvariantCulture);
            color.B.TryFormat(span[5..], out _, "X2", CultureInfo.InvariantCulture);
        });
}

internal sealed record PaletteSelectionResult(
    IReadOnlyList<(string Name, string Hex)> Colors,
    int Requested,
    IReadOnlyList<string> Rejected)
{
    public bool Satisfied => this.Colors.Count >= this.Requested;
}
