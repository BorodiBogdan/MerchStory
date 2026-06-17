namespace MerchStoryImageGeneration.Services;

public static class LanguageInstruction
{
    public static string For(string? language)
    {
        string normalized = (language ?? "EN").Trim().ToUpperInvariant();
        return normalized switch
        {
            "RO" => "All user-visible text in the generated image (headlines, captions, labels, call-to-action, prices) MUST be written in Romanian. Use correct Romanian diacritics where they belong (ă, â, î, ș, ț — and their uppercase forms). Do not mix languages.\n\n",
            _ => "All user-visible text in the generated image (headlines, captions, labels, call-to-action, prices) MUST be written in English. Do not mix languages.\n\n",
        };
    }
}

public static class StockDisclaimerInstruction
{
    public static string For(string? language)
    {
        string normalized = (language ?? "EN").Trim().ToUpperInvariant();
        return normalized switch
        {
            "RO" => "STOCK DISCLAIMER — DO render this exact short disclaimer once, as a footer line along the bottom of the image: \"În limita stocului disponibil\". " +
                    "It belongs at the bottom, but it MUST be clearly legible: render it at a comfortable, readable fine-print size with strong contrast against its background — like the legal footer line on a real supermarket flyer, NOT tiny, cramped, or squeezed into a corner where it can't be read. " +
                    "This specific line is explicitly ALLOWED and required — it is an exception to the no-made-up-text rule. Keep it flat and clean; it sits calmly at the bottom and does not compete with the products or prices for the main focus, but it stays easy to read.\n\n",
            _ => "STOCK DISCLAIMER — DO render this exact short disclaimer once, as a footer line along the bottom of the image: \"While stocks last\". " +
                 "It belongs at the bottom, but it MUST be clearly legible: render it at a comfortable, readable fine-print size with strong contrast against its background — like the legal footer line on a real supermarket flyer, NOT tiny, cramped, or squeezed into a corner where it can't be read. " +
                 "This specific line is explicitly ALLOWED and required — it is an exception to the no-made-up-text rule. Keep it flat and clean; it sits calmly at the bottom and does not compete with the products or prices for the main focus, but it stays easy to read.\n\n",
        };
    }
}

public static class OfferBannerInstruction
{
    public static string For(string? language)
    {
        string normalized = (language ?? "EN").Trim().ToUpperInvariant();
        return normalized switch
        {
            "RO" => "OFFER BANNER — DO render a single large, bold headline reading \"OFERTĂ\" (or \"OFERTE\" when several deals are shown) as a prominent banner, the way a real retail catalog announces its deals. " +
                    "Make it big and confident — a hero band at the top or another prominent empty area — set in a flat solid color block or panel that fits the palette. " +
                    "This specific headline word is explicitly ALLOWED and required — it is an exception to the no-made-up-text rule — but do NOT add any other invented marketing copy, taglines, or extra words around it. " +
                    "Keep the typography flat and crisp, and place the banner so it never overlaps, crosses, or crowds the products or their prices.\n\n",
            _ => "OFFER BANNER — DO render a single large, bold headline reading \"OFFER\" (or \"OFFERS\"/\"SPECIAL OFFER\" when it reads better) as a prominent banner, the way a real retail catalog announces its deals. " +
                 "Make it big and confident — a hero band at the top or another prominent empty area — set in a flat solid color block or panel that fits the palette. " +
                 "This specific headline word is explicitly ALLOWED and required — it is an exception to the no-made-up-text rule — but do NOT add any other invented marketing copy, taglines, or extra words around it. " +
                 "Keep the typography flat and crisp, and place the banner so it never overlaps, crosses, or crowds the products or their prices.\n\n",
        };
    }
}

public static class CurrencyFormatter
{
    public static string SymbolFor(string? currency)
    {
        string normalized = (currency ?? "USD").Trim().ToUpperInvariant();
        return normalized switch
        {
            "EUR" => "€",
            "RON" => "Lei",
            _ => "$",
        };
    }

    public static string Format(decimal amount, string? currency)
    {
        string normalized = (currency ?? "USD").Trim().ToUpperInvariant();
        string symbol = SymbolFor(normalized);
        return normalized switch
        {
            "RON" => $"{amount:F2} {symbol}",
            _ => $"{symbol}{amount:F2}",
        };
    }
}
