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
            "RO" => "STOCK DISCLAIMER — DO render this exact short disclaimer once, somewhere small and unobtrusive (for example a slim footer strip or a corner): \"În limita stocului disponibil\". " +
                    "This specific line is explicitly ALLOWED and required — it is an exception to the no-made-up-text rule. Keep it small, flat, and legible; it must never compete with the products or prices.\n\n",
            _ => "STOCK DISCLAIMER — DO render this exact short disclaimer once, somewhere small and unobtrusive (for example a slim footer strip or a corner): \"While stocks last\". " +
                 "This specific line is explicitly ALLOWED and required — it is an exception to the no-made-up-text rule. Keep it small, flat, and legible; it must never compete with the products or prices.\n\n",
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
