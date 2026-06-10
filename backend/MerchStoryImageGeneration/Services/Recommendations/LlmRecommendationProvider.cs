using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using MerchStoryImageGeneration.Models.Recommendations;
using MerchStoryImageGeneration.Services.Recommendations.Chat;
using Microsoft.Extensions.Logging;

namespace MerchStoryImageGeneration.Services.Recommendations;

// Multi-agent recommendation provider.
//
// Pipeline (Phase 4):
//   1. Strategist (1 LLM call, lower temperature) picks N angles from the
//      shop profile + context signals. Output: structured JSON list of
//      {theme, tone, triggerSignal, rationale}.
//   2. Writers (N parallel LLM calls, higher temperature) expand each angle
//      into a full IdeaDto. Run via Task.WhenAll so wall-clock matches the
//      slowest writer rather than the sum.
//   3. // Critic deferred to v2 — see plan
//
// This class owns the prompts and the defensive JSON parsing; the actual
// chat-completion call goes through IRecommendationChatService, so the model
// backend (LM Studio / DeepSeek / Claude) is a pure config decision —
// see Recommendations:Llm:Backend and the Chat/ folder.
public class LlmRecommendationProvider : IRecommendationProvider
{
    private const string RetryAddendum =
        "\n\nIMPORTANT: your previous response was not valid JSON. Output ONLY a JSON object matching the schema, with no prose, no code fences.";

    private const string TranslationLang = "ro";

    // Lenient parse: tolerates trailing commas + // /* */ comments — both common
    // from open-weight models like Gemma 3 that don't strictly follow JSON spec.
    private static readonly JsonDocumentOptions LenientJsonOpts = new()
    {
        AllowTrailingCommas = true,
        CommentHandling = JsonCommentHandling.Skip,
    };

    private readonly IRecommendationChatService chat;
    private readonly ILogger<LlmRecommendationProvider> logger;

    public LlmRecommendationProvider(
        IRecommendationChatService chat,
        ILogger<LlmRecommendationProvider> logger)
    {
        this.chat = chat;
        this.logger = logger;
    }

    // Pipeline always emits canonical English in the IdeaDto base fields,
    // then runs a Translator stage to populate Translations["ro"]. The user's
    // current GenerationLanguage is consulted at READ time (route handler) to
    // pick which version to serve. Switching languages doesn't trigger
    // regeneration — both versions are persisted.
    public async Task<RecommendationResult> GenerateAsync(RecommendationContext context, CancellationToken ct)
    {
        Stopwatch sw = Stopwatch.StartNew();

        this.logger.LogInformation(
            "[LLM] Generate start backend={Backend} signals={SignalCount} playbookHits={PlaybookCount} previousIdeas={PreviousCount} ideasPerDay={N}",
            this.chat.Description,
            context.Signals.Count,
            context.PlaybookHits.Count,
            context.PreviousIdeas.Count,
            context.IdeasPerDay);

        Angle[] angles = await this.RunStrategistAsync(context, ct);
        long strategistMs = sw.ElapsedMilliseconds;

        if (angles.Length == 0)
        {
            this.logger.LogError("[LLM] Strategist returned 0 angles — pipeline cannot continue");
            throw new InvalidOperationException(
                "Strategist returned no usable angles. Inspect the loaded model's JSON-mode support.");
        }

        long writerStart = sw.ElapsedMilliseconds;
        IdeaDto[] englishIdeas = await Task.WhenAll(
            angles.Select((angle, idx) => this.RunWriterAsync(angle, context, idx, ct)));
        long writerMs = sw.ElapsedMilliseconds - writerStart;
        this.logger.LogInformation(
            "[LLM] Writers x{Count} done in {ElapsedMs}ms (wall-clock, parallel) titles=[{Titles}]",
            englishIdeas.Length,
            writerMs,
            string.Join(" | ", englishIdeas.Select(i => i.Title)));

        // Translator stage — always runs, populates Translations["ro"] on each
        // idea. Runs in parallel per idea; one writer's bad JSON doesn't kill
        // the batch (parser falls back to null and the projection later falls
        // through to the English base fields).
        long translatorStart = sw.ElapsedMilliseconds;
        this.logger.LogInformation(
            "[LLM] Translator start targetLang={Lang} ideas={Count}",
            TranslationLang,
            englishIdeas.Length);

        IdeaTranslation?[] translations = await Task.WhenAll(
            englishIdeas.Select((idea, idx) => this.RunTranslatorAsync(idea, TranslationLang, idx, ct)));

        long translatorMs = sw.ElapsedMilliseconds - translatorStart;
        int successCount = translations.Count(t => t is not null);
        this.logger.LogInformation(
            "[LLM] Translator done in {ElapsedMs}ms succeeded={Ok}/{Total}",
            translatorMs,
            successCount,
            translations.Length);

        IdeaDto[] localizedIdeas = englishIdeas
            .Select((idea, idx) =>
            {
                if (translations[idx] is null)
                {
                    return idea;
                }

                Dictionary<string, IdeaTranslation> dict = new(StringComparer.OrdinalIgnoreCase)
                {
                    [TranslationLang] = translations[idx]!,
                };
                return idea with { Translations = dict };
            })
            .ToArray();

        ProviderRunSnapshot snapshotShape = new(
            Provider: "llm",
            Backend: this.chat.Description,
            StrategistMs: strategistMs,
            WriterMs: writerMs,
            AngleCount: angles.Length,
            IdeaCount: localizedIdeas.Length);
        string snapshot = JsonSerializer.Serialize(snapshotShape);

        return new RecommendationResult(localizedIdeas, snapshot, Array.Empty<string>());
    }

    private static IdeaTranslation? TryParseTranslation(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        string cleaned = StripCodeFences(raw);
        JsonDocument? doc = TryParseJsonDocument(cleaned)
            ?? TryParseJsonDocument(ExtractFirstJsonObject(cleaned) ?? string.Empty)
            ?? TryParseJsonDocument(ExtractFirstJsonObject(raw) ?? string.Empty);
        if (doc is null)
        {
            return null;
        }

        try
        {
            JsonElement el = doc.RootElement;
            if (el.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            string? title = StringFromProp(el, "title");
            string? meta = StringFromProp(el, "meta");
            string? body = StringFromProp(el, "body");
            string? suggestedPost = StringFromProp(el, "suggestedPost") ?? StringFromProp(el, "suggested_post");
            string? imagePrompt = StringFromProp(el, "imagePrompt") ?? StringFromProp(el, "image_prompt");

            // Need at least the title — the rest can fall back individually
            // through the projection if we wanted, but for now require all 4
            // since a partial translation is worse than no translation (mixed
            // languages on screen looks broken).
            if (string.IsNullOrWhiteSpace(title) ||
                string.IsNullOrWhiteSpace(meta) ||
                string.IsNullOrWhiteSpace(body) ||
                string.IsNullOrWhiteSpace(suggestedPost))
            {
                return null;
            }

            return new IdeaTranslation(title!, meta!, body!, suggestedPost!, imagePrompt ?? string.Empty);
        }
        finally
        {
            doc.Dispose();
        }
    }

    private static string BuildTranslatorPrompt(IdeaDto idea, string targetLang)
    {
        string targetLangName = string.Equals(targetLang, "ro", StringComparison.OrdinalIgnoreCase)
            ? "Romanian"
            : targetLang;

        StringBuilder sb = new();
        sb.AppendLine("You are translating a small-shop promo idea card from English to " + targetLangName + ".");
        sb.AppendLine("The voice is a real shop owner texting friends — casual, simple, no marketing-speak.");
        sb.AppendLine();
        sb.AppendLine("== ENGLISH SOURCE ==");
        sb.AppendLine("title: " + idea.Title);
        sb.AppendLine("meta: " + idea.Meta);
        sb.AppendLine("body: " + idea.Body);
        sb.AppendLine("suggestedPost: " + idea.SuggestedPost);
        sb.AppendLine("imagePrompt: " + idea.ImagePrompt);
        sb.AppendLine();
        sb.AppendLine("== HOW TO TRANSLATE ==");
        sb.AppendLine("- Preserve brand names, product names, place names — don't translate them.");
        sb.AppendLine("- Preserve numbers, dates, percentages exactly.");
        sb.AppendLine("- Keep the casual tone — short sentences, everyday words.");
        sb.AppendLine("- Translate suggestedPost as something a real shop owner would actually type — not a slogan.");
        sb.AppendLine("- Translate imagePrompt as a plain visual description in " + targetLangName + ". Keep any quoted on-image text in " + targetLangName + " too.");
        sb.AppendLine();
        sb.AppendLine("AVOID Romanian marketing-speak (these scream AI):");
        sb.AppendLine("  'descoperă', 'bucură-te', 'experiență unică', 'exclusiv', 'premium', 'autentic',");
        sb.AppendLine("  'redescoperă', 'savurează', 'momente de neuitat', 'nu rata'");
        sb.AppendLine();
        sb.AppendLine("== OUTPUT ==");
        sb.AppendLine("Return ONLY a JSON object, no prose, no code fences:");
        sb.AppendLine("{");
        sb.AppendLine("  \"title\": \"<" + targetLangName + " translation of title>\",");
        sb.AppendLine("  \"meta\": \"<" + targetLangName + " translation of meta>\",");
        sb.AppendLine("  \"body\": \"<" + targetLangName + " translation of body>\",");
        sb.AppendLine("  \"suggestedPost\": \"<" + targetLangName + " translation of suggestedPost>\",");
        sb.AppendLine("  \"imagePrompt\": \"<" + targetLangName + " translation of imagePrompt>\"");
        sb.AppendLine("}");
        return sb.ToString();
    }

    // ── Static helpers (parsing + prompts) ────────────────────────────────────

    // Brace-match the first balanced {...} object in the text. Tolerates:
    //   - leading prose / preamble before the JSON
    //   - markdown ```json fences (inside or outside the matched range)
    //   - trailing prose after the closing brace
    //   - escaped quotes and braces inside string values
    // Returns null if no balanced object is found.
    private static string? ExtractFirstJsonObject(string text)
    {
        int start = text.IndexOf('{');
        if (start < 0)
        {
            return null;
        }

        int depth = 0;
        bool inString = false;
        bool escape = false;
        for (int i = start; i < text.Length; i++)
        {
            char c = text[i];
            if (escape)
            {
                escape = false;
                continue;
            }

            if (c == '\\' && inString)
            {
                escape = true;
                continue;
            }

            if (c == '"')
            {
                inString = !inString;
                continue;
            }

            if (inString)
            {
                continue;
            }

            if (c == '{')
            {
                depth++;
            }
            else if (c == '}')
            {
                depth--;
                if (depth == 0)
                {
                    return text.Substring(start, i - start + 1);
                }
            }
        }

        return null;
    }

    private static Angle[]? TryParseAngles(string raw, int target)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        // Try direct parse on stripped fences first; fall back to brace-match
        // extraction if there's prose around the JSON.
        string cleaned = StripCodeFences(raw);
        JsonDocument? doc = TryParseJsonDocument(cleaned)
            ?? TryParseJsonDocument(ExtractFirstJsonObject(cleaned) ?? string.Empty)
            ?? TryParseJsonDocument(ExtractFirstJsonObject(raw) ?? string.Empty);
        if (doc is null)
        {
            return null;
        }

        try
        {
            JsonElement root = doc.RootElement;
            if (!root.TryGetProperty("angles", out JsonElement arr) || arr.ValueKind != JsonValueKind.Array)
            {
                if (root.ValueKind == JsonValueKind.Array)
                {
                    arr = root;
                }
                else
                {
                    return null;
                }
            }

            List<Angle> angles = new();
            foreach (JsonElement el in arr.EnumerateArray())
            {
                if (el.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                string theme = StringFromProp(el, "theme") ?? string.Empty;
                string tone = NormalizeTone(StringFromProp(el, "tone"));
                string triggerSignal = StringFromProp(el, "triggerSignal") ?? StringFromProp(el, "trigger_signal") ?? string.Empty;
                string rationale = StringFromProp(el, "rationale") ?? string.Empty;

                if (string.IsNullOrWhiteSpace(theme))
                {
                    continue;
                }

                angles.Add(new Angle(theme, tone, triggerSignal, rationale));
            }

            return angles.Count == 0 ? null : angles.Take(target > 0 ? target : angles.Count).ToArray();
        }
        finally
        {
            doc.Dispose();
        }
    }

    private static IdeaDto? TryParseIdea(string raw, Angle angle, int index)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        string cleaned = StripCodeFences(raw);
        JsonDocument? doc = TryParseJsonDocument(cleaned)
            ?? TryParseJsonDocument(ExtractFirstJsonObject(cleaned) ?? string.Empty)
            ?? TryParseJsonDocument(ExtractFirstJsonObject(raw) ?? string.Empty);
        if (doc is null)
        {
            return null;
        }

        try
        {
            JsonElement el = doc.RootElement;
            if (el.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            // Some models wrap the result in {"idea": {...}} — unwrap.
            if (el.TryGetProperty("idea", out JsonElement inner) && inner.ValueKind == JsonValueKind.Object)
            {
                el = inner;
            }

            string id = StringFromProp(el, "id") ?? $"angle-{index}";
            string tone = NormalizeTone(StringFromProp(el, "tone")) ?? angle.Tone;
            string title = StringFromProp(el, "title") ?? angle.Theme;
            string meta = StringFromProp(el, "meta") ?? string.Empty;
            string body = StringFromProp(el, "body") ?? angle.Rationale;
            string suggestedPost = StringFromProp(el, "suggestedPost")
                ?? StringFromProp(el, "suggested_post")
                ?? string.Empty;
            string type = NormalizeType(StringFromProp(el, "type"));
            string imagePrompt = StringFromProp(el, "imagePrompt")
                ?? StringFromProp(el, "image_prompt")
                ?? string.Empty;

            return new IdeaDto(id, tone, title, meta, body, suggestedPost, type, imagePrompt);
        }
        finally
        {
            doc.Dispose();
        }
    }

    // Attempt JsonDocument.Parse without throwing. Empty/whitespace input → null.
    private static JsonDocument? TryParseJsonDocument(string s)
    {
        if (string.IsNullOrWhiteSpace(s))
        {
            return null;
        }

        try
        {
            return JsonDocument.Parse(s, LenientJsonOpts);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string StripCodeFences(string raw)
    {
        string cleaned = raw.Trim();
        if (cleaned.StartsWith("```", StringComparison.Ordinal))
        {
            int firstNewline = cleaned.IndexOf('\n');
            if (firstNewline >= 0)
            {
                cleaned = cleaned[(firstNewline + 1)..];
            }

            if (cleaned.EndsWith("```", StringComparison.Ordinal))
            {
                cleaned = cleaned[..^3];
            }

            cleaned = cleaned.Trim();
        }

        return cleaned;
    }

    private static string? StringFromProp(JsonElement el, string name)
    {
        if (!el.TryGetProperty(name, out JsonElement v))
        {
            return null;
        }

        return v.ValueKind switch
        {
            JsonValueKind.String => v.GetString(),
            JsonValueKind.Number => v.GetRawText(),
            _ => null,
        };
    }

    private static string NormalizeTone(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return "trend";
        }

        string lower = raw.Trim().ToLowerInvariant();
        return lower switch
        {
            "weather" or "holiday" or "news" or "trend" => lower,
            _ => "trend",
        };
    }

    private static string NormalizeType(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return "announcement";
        }

        string lower = raw.Trim().ToLowerInvariant();
        return lower switch
        {
            "promotion" or "promo" => "promotion",
            _ => "announcement",
        };
    }

    private static string Truncate(string s, int max)
        => s.Length <= max ? s : s[..max] + "…";

    // ── Prompts ───────────────────────────────────────────────────────────────
    private static string BuildStrategistPrompt(RecommendationContext ctx)
    {
        StringBuilder sb = new();

        sb.AppendLine("You are the STRATEGIST in a two-stage marketing pipeline for a small local retailer.");
        sb.AppendLine("Your job: read the shop profile and today's environmental signals, then pick distinct PROMO ANGLES worth turning into ads.");
        sb.AppendLine("Don't write the ads themselves yet — the next stage handles that. Just identify the angles.");
        sb.AppendLine();
        sb.AppendLine("== SHOP ==");
        AppendShop(sb, ctx);
        sb.AppendLine();
        sb.AppendLine("== TODAY'S SIGNALS ==");
        AppendSignals(sb, ctx);
        sb.AppendLine();
        AppendPlaybookHits(sb, ctx);
        sb.AppendLine("== TASK ==");
        sb.AppendLine($"Pick exactly {ctx.IdeasPerDay} distinct angles. Vary the tones — don't return 5 weather angles.");
        sb.AppendLine("Each angle must be grounded in either a specific signal above or a clear seasonal opportunity for this domain.");
        sb.AppendLine();
        sb.AppendLine("Themes should be plain and concrete. The next stage will turn them into copy.");
        sb.AppendLine("Avoid marketing-speak (no 'unlock', 'curated', 'premium', 'authentic', 'discover', 'embrace').");
        sb.AppendLine("GOOD theme: 'Rainy weekend soup ingredients'  |  BAD theme: 'Discover the comfort of authentic flavors'");
        sb.AppendLine();
        sb.AppendLine("== OUTPUT ==");
        sb.AppendLine("Return ONLY a JSON object, no prose, no code fences:");
        sb.AppendLine("{");
        sb.AppendLine("  \"angles\": [");
        sb.AppendLine("    {");
        sb.AppendLine("      \"theme\": \"4-7 plain words describing the angle\",");
        sb.AppendLine("      \"tone\": \"weather\" | \"holiday\" | \"news\" | \"trend\",");
        sb.AppendLine("      \"triggerSignal\": \"reference to a signal above OR a seasonal opportunity\",");
        sb.AppendLine("      \"rationale\": \"1 sentence — what's happening, what to push, why now\"");
        sb.AppendLine("    }");
        sb.AppendLine("  ]");
        sb.AppendLine("}");
        return sb.ToString();
    }

    private static string BuildWriterPrompt(Angle angle, RecommendationContext ctx)
    {
        StringBuilder sb = new();
        sb.AppendLine("You are helping a small shop owner write a promo idea they'd actually post on their own Facebook page.");
        sb.AppendLine("The shop owner is a real person, not a marketing agency. Match their voice.");
        sb.AppendLine();
        sb.AppendLine("== THE ANGLE ==");
        sb.AppendLine("Theme: " + angle.Theme);
        sb.AppendLine("Tone: " + angle.Tone);
        sb.AppendLine("Trigger: " + angle.TriggerSignal);
        sb.AppendLine("Why it works: " + angle.Rationale);
        sb.AppendLine();
        sb.AppendLine("== THE SHOP ==");
        AppendShop(sb, ctx);
        sb.AppendLine();
        AppendPreviousIdeas(sb, ctx);
        sb.AppendLine("== HOW TO WRITE ==");
        sb.AppendLine("Plain, human, like a neighbor texting friends. Short sentences, specific items, no marketing-speak.");
        sb.AppendLine("Avoid: 'unlock', 'elevate', 'discover', 'curated', 'premium', 'authentic', 'don't miss out', emojis, title-case.");
        sb.AppendLine("GOOD: \"Cold rain Saturday — Sunday-soup kit, three ingredients\"");
        sb.AppendLine("BAD:  \"Embrace the rainy weekend with our curated comfort food experience\"");
        sb.AppendLine();
        sb.AppendLine("== OUTPUT ==");
        sb.AppendLine("Return ONLY a JSON object, no prose, no code fences:");
        sb.AppendLine("{");
        sb.AppendLine("  \"id\": \"short-kebab-case-id\",");
        sb.AppendLine($"  \"tone\": \"{angle.Tone}\",");
        sb.AppendLine("  \"title\": \"4-8 words, plain language\",");
        sb.AppendLine("  \"meta\": \"short factual context (a date, a number)\",");
        sb.AppendLine("  \"body\": \"1-2 sentences explaining the idea\",");
        sb.AppendLine("  \"suggestedPost\": \"5-9 words a real shop owner would type. Not a slogan.\",");
        sb.AppendLine("  \"type\": \"promotion\" if there's a concrete discount/sale/bundle, else \"announcement\",");
        sb.AppendLine("  \"imagePrompt\": \"1-2 sentences: subject, optional on-image text, mood. Visual description, not a slogan.\"");
        sb.AppendLine("}");
        sb.AppendLine();
        sb.AppendLine("Write title / meta / body / suggestedPost / imagePrompt in English. A separate translator handles other languages.");
        return sb.ToString();
    }

    private static void AppendShop(StringBuilder sb, RecommendationContext ctx)
    {
        sb.AppendLine($"Brand: {ctx.BrandName}");
        sb.AppendLine($"Business domain: {ctx.BusinessDomain}{(string.IsNullOrEmpty(ctx.OtherDomain) ? string.Empty : $" ({ctx.OtherDomain})")}");
        if (!string.IsNullOrEmpty(ctx.ShopType))
        {
            sb.AppendLine($"Positioning: {ctx.ShopType}");
        }

        if (!string.IsNullOrEmpty(ctx.TargetAudience))
        {
            sb.AppendLine($"Target audience: {ctx.TargetAudience}");
        }

        sb.AppendLine($"Location: {ctx.City ?? "unspecified city"}, {ctx.CountryCode}");
    }

    private static void AppendPreviousIdeas(StringBuilder sb, RecommendationContext ctx)
    {
        if (ctx.PreviousIdeas.Count == 0)
        {
            return;
        }

        sb.AppendLine("== RECENT IDEAS — DO NOT REPEAT THESE THEMES ==");
        sb.AppendLine("These ideas have already been pitched to this shop in the last 30 days.");
        sb.AppendLine("Pick a clearly different angle — avoid the same theme, structure, or hook.");
        sb.AppendLine();
        int n = 1;
        foreach (PreviousIdeaHit prev in ctx.PreviousIdeas)
        {
            string when = prev.GeneratedAtUtc.ToString("MMM d", CultureInfo.InvariantCulture);
            sb.AppendLine("[" + n + "] (" + when + ") " + prev.Title);
            n++;
        }

        sb.AppendLine();
    }

    private static void AppendPlaybookHits(StringBuilder sb, RecommendationContext ctx)
    {
        if (ctx.PlaybookHits.Count == 0)
        {
            return;
        }

        sb.AppendLine("== RELEVANT PLAYBOOK ENTRIES ==");
        sb.AppendLine("These are proven promo recipes that match this shop's domain and today's signals.");
        sb.AppendLine("Use them as INSPIRATION — adapt to the specific shop, don't copy verbatim.");
        sb.AppendLine();
        int i = 1;
        foreach (PlaybookHit hit in ctx.PlaybookHits)
        {
            string header = $"[{i++}] {hit.Theme} (trigger type: {hit.TriggerType})";
            sb.AppendLine(header);
            sb.AppendLine("    Trigger: " + hit.Trigger);
            sb.AppendLine("    Tactics: " + hit.Tactics.Trim());
            if (!string.IsNullOrWhiteSpace(hit.ExampleCopy))
            {
                sb.AppendLine("    Example copy: \"" + hit.ExampleCopy + "\"");
            }
        }

        sb.AppendLine();
    }

    private static void AppendSignals(StringBuilder sb, RecommendationContext ctx)
    {
        if (ctx.Signals.Count == 0)
        {
            sb.AppendLine("(no live signals available — base angles on shop profile + general seasonal awareness)");
            return;
        }

        foreach (IGrouping<string, ContextSignal> group in ctx.Signals.GroupBy(s => s.Source))
        {
            sb.AppendLine($"-- {group.Key.ToUpperInvariant()} --");
            foreach (ContextSignal s in group)
            {
                string when = s.RelevantOnDate is { } d ? $" ({d:MMM d})" : string.Empty;
                sb.AppendLine($"[{s.Severity}] {s.Title}{when} — {s.Summary}");
            }
        }

        if (ctx.DegradedSources.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine($"(Note: these signal sources failed and are unavailable: {string.Join(", ", ctx.DegradedSources)})");
        }
    }

    // Single translator call per idea. Focused single-task prompt — translation
    // is much more reliable than asking the Writer to write in Romanian directly.
    private async Task<IdeaTranslation?> RunTranslatorAsync(IdeaDto idea, string targetLang, int idx, CancellationToken ct)
    {
        Stopwatch sw = Stopwatch.StartNew();
        string prompt = BuildTranslatorPrompt(idea, targetLang);

        string raw;
        try
        {
            raw = await this.chat.CompleteAsync(prompt, ChatRole.Writer, ct);
        }
        catch (Exception ex)
        {
            this.logger.LogWarning(
                ex,
                "[LLM] Translator[{Idx}] FAILED at HTTP — idea will fall back to English at read time",
                idx);
            return null;
        }

        IdeaTranslation? parsed = TryParseTranslation(raw);
        if (parsed is null)
        {
            this.logger.LogWarning(
                "[LLM] Translator[{Idx}] JSON parse FAILED in {Ms}ms. FULL response:\n{Body}",
                idx,
                sw.ElapsedMilliseconds,
                Truncate(raw, 2000));
            return null;
        }

        this.logger.LogInformation(
            "[LLM] Translator[{Idx}] done in {Ms}ms title='{Title}'",
            idx,
            sw.ElapsedMilliseconds,
            parsed.Title);
        return parsed;
    }

    // ── Instance pipeline (Strategist → Writer → kernel invocation) ───────────
    private async Task<Angle[]> RunStrategistAsync(RecommendationContext ctx, CancellationToken ct)
    {
        Stopwatch sw = Stopwatch.StartNew();
        string prompt = BuildStrategistPrompt(ctx);
        this.logger.LogInformation(
            "[LLM] Strategist start promptChars={Chars} backend={Backend}",
            prompt.Length,
            this.chat.Description);

        string raw = await this.chat.CompleteAsync(prompt, ChatRole.Strategist, ct);
        this.logger.LogInformation(
            "[LLM] Strategist response after {Ms}ms responseChars={Chars}",
            sw.ElapsedMilliseconds,
            raw.Length);

        Angle[]? parsed = TryParseAngles(raw, ctx.IdeasPerDay);
        if (parsed is null)
        {
            this.logger.LogWarning(
                "[LLM] Strategist JSON parse FAILED on first attempt, retrying once. FULL response:\n{Body}",
                Truncate(raw, 4000));

            string retryPrompt = prompt + RetryAddendum;
            string retryRaw = await this.chat.CompleteAsync(retryPrompt, ChatRole.Strategist, ct);
            parsed = TryParseAngles(retryRaw, ctx.IdeasPerDay);
            if (parsed is null)
            {
                this.logger.LogError(
                    "[LLM] Strategist JSON parse FAILED on retry too. FULL retry response:\n{Body}",
                    Truncate(retryRaw, 4000));
            }
        }

        Angle[] result = parsed ?? Array.Empty<Angle>();
        this.logger.LogInformation(
            "[LLM] Strategist done in {Ms}ms angles={Count} themes=[{Themes}]",
            sw.ElapsedMilliseconds,
            result.Length,
            string.Join(" | ", result.Select(a => a.Theme)));
        return result;
    }

    private async Task<IdeaDto> RunWriterAsync(Angle angle, RecommendationContext ctx, int index, CancellationToken ct)
    {
        Stopwatch sw = Stopwatch.StartNew();
        string prompt = BuildWriterPrompt(angle, ctx);
        this.logger.LogInformation(
            "[LLM] Writer[{Idx}] start theme='{Theme}' tone={Tone} promptChars={Chars}",
            index,
            angle.Theme,
            angle.Tone,
            prompt.Length);

        string raw = await this.chat.CompleteAsync(prompt, ChatRole.Writer, ct);

        IdeaDto? parsed = TryParseIdea(raw, angle, index);
        if (parsed is not null)
        {
            this.logger.LogInformation(
                "[LLM] Writer[{Idx}] done in {Ms}ms title='{Title}'",
                index,
                sw.ElapsedMilliseconds,
                parsed.Title);
            return parsed;
        }

        this.logger.LogWarning(
            "[LLM] Writer[{Idx}] JSON parse FAILED, retrying once. FULL response:\n{Body}",
            index,
            Truncate(raw, 4000));

        string retryPrompt = prompt + RetryAddendum;
        string retryRaw = await this.chat.CompleteAsync(retryPrompt, ChatRole.Writer, ct);
        parsed = TryParseIdea(retryRaw, angle, index);

        if (parsed is not null)
        {
            this.logger.LogInformation(
                "[LLM] Writer[{Idx}] done in {Ms}ms (recovered on retry) title='{Title}'",
                index,
                sw.ElapsedMilliseconds,
                parsed.Title);
            return parsed;
        }

        // If still broken, fabricate a minimal IdeaDto from the angle so the
        // pipeline doesn't fail the whole batch on one writer's bad JSON.
        this.logger.LogError(
            "[LLM] Writer[{Idx}] JSON parse FAILED on retry too — fabricating from angle. FULL retry response:\n{Body}",
            index,
            Truncate(retryRaw, 4000));
        return new IdeaDto(
            Id: $"angle-{index}",
            Tone: angle.Tone,
            Title: angle.Theme,
            Meta: string.Empty,
            Body: angle.Rationale,
            SuggestedPost: angle.Theme);
    }

    private record Angle(string Theme, string Tone, string TriggerSignal, string Rationale);

    // Concrete shape for the diagnostic snapshot string. Anonymous-type version
    // got hit by dotnet watch hot-reload renaming '<>f__AnonymousTypeN' indices.
    private record ProviderRunSnapshot(
        string Provider,
        string Backend,
        long StrategistMs,
        long WriterMs,
        int AngleCount,
        int IdeaCount);
}
