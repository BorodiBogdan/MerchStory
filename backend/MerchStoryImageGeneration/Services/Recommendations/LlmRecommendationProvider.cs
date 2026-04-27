using System.Diagnostics;
using System.Text;
using System.Text.Json;
using MerchStoryImageGeneration.Models.Recommendations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.Connectors.OpenAI;

namespace MerchStoryImageGeneration.Services.Recommendations;

// Multi-agent recommendation provider via Semantic Kernel.
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
// Per-role models supported via separate config keys. Defaulting both to the
// same model is fine; using a stronger model for Strategist + a faster model
// for Writers is a common upgrade path.
//
// Speaks the OpenAI Chat Completions wire format — works against LM Studio
// (default), Ollama, vLLM, llama.cpp server, LocalAI, hosted services, etc.
public class LlmRecommendationProvider : IRecommendationProvider
{
    private const string RetryAddendum =
        "\n\nIMPORTANT: your previous response was not valid JSON. Output ONLY a JSON object matching the schema, with no prose, no code fences.";

    private readonly Kernel strategistKernel;
    private readonly Kernel writerKernel;
    private readonly OpenAIPromptExecutionSettings strategistSettings;
    private readonly OpenAIPromptExecutionSettings writerSettings;
    private readonly ILogger<LlmRecommendationProvider> logger;
    private readonly string strategistModel;
    private readonly string writerModel;

    public LlmRecommendationProvider(
        IConfiguration configuration,
        ILogger<LlmRecommendationProvider> logger)
    {
        string baseUrl = configuration["Recommendations:Llm:BaseUrl"]
            ?? "http://localhost:1234/v1";
        string defaultModel = configuration["Recommendations:Llm:ChatModel"] ?? "qwen2.5-7b-instruct";
        this.strategistModel = configuration["Recommendations:Llm:StrategistModel"] ?? defaultModel;
        this.writerModel = configuration["Recommendations:Llm:WriterModel"] ?? defaultModel;
        int timeoutSec = configuration.GetValue("Recommendations:Llm:RequestTimeoutSeconds", 90);

        this.strategistKernel = BuildKernel(this.strategistModel, baseUrl, timeoutSec);
        this.writerKernel = BuildKernel(this.writerModel, baseUrl, timeoutSec);

        this.strategistSettings = new OpenAIPromptExecutionSettings
        {
            ResponseFormat = "json_object",
            MaxTokens = 1200,
            Temperature = 0.4, // planning likes lower temperature
        };

        this.writerSettings = new OpenAIPromptExecutionSettings
        {
            ResponseFormat = "json_object",
            MaxTokens = 600,
            Temperature = 0.8, // writing benefits from variation
        };

        this.logger = logger;
    }

    public async Task<RecommendationResult> GenerateAsync(RecommendationContext context, CancellationToken ct)
    {
        Stopwatch sw = Stopwatch.StartNew();

        Angle[] angles = await this.RunStrategistAsync(context, ct);
        long strategistMs = sw.ElapsedMilliseconds;
        this.logger.LogInformation(
            "Recommendations.Strategist completed in {ElapsedMs}ms with {AngleCount} angles",
            strategistMs,
            angles.Length);

        if (angles.Length == 0)
        {
            throw new InvalidOperationException(
                "Strategist returned no usable angles. Inspect the loaded model's JSON-mode support.");
        }

        long writerStart = sw.ElapsedMilliseconds;
        IdeaDto[] ideas = await Task.WhenAll(
            angles.Select((angle, idx) => this.RunWriterAsync(angle, context, idx, ct)));
        long writerMs = sw.ElapsedMilliseconds - writerStart;
        this.logger.LogInformation(
            "Recommendations.Writers x{Count} completed in {ElapsedMs}ms (wall-clock, parallel)",
            ideas.Length,
            writerMs);

        string snapshot = JsonSerializer.Serialize(new
        {
            provider = "llm",
            strategistModel = this.strategistModel,
            writerModel = this.writerModel,
            strategistMs,
            writerMs,
            angleCount = angles.Length,
            ideaCount = ideas.Length,
        });

        return new RecommendationResult(ideas, snapshot, Array.Empty<string>());
    }

    // ── Static helpers (parsing + prompts) ────────────────────────────────────
    private static Angle[]? TryParseAngles(string raw, int target)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        string cleaned = StripCodeFences(raw);
        try
        {
            using JsonDocument doc = JsonDocument.Parse(cleaned);
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
        catch (JsonException)
        {
            return null;
        }
    }

    private static IdeaDto? TryParseIdea(string raw, Angle angle, int index)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        string cleaned = StripCodeFences(raw);
        try
        {
            using JsonDocument doc = JsonDocument.Parse(cleaned);
            JsonElement el = doc.RootElement;
            if (el.ValueKind != JsonValueKind.Object)
            {
                // Some models wrap in {"idea": {...}}
                if (el.ValueKind == JsonValueKind.Object && el.TryGetProperty("idea", out JsonElement inner))
                {
                    el = inner;
                }
                else
                {
                    return null;
                }
            }

            string id = StringFromProp(el, "id") ?? $"angle-{index}";
            string tone = NormalizeTone(StringFromProp(el, "tone")) ?? angle.Tone;
            string title = StringFromProp(el, "title") ?? angle.Theme;
            string meta = StringFromProp(el, "meta") ?? string.Empty;
            string body = StringFromProp(el, "body") ?? angle.Rationale;
            string suggestedPost = StringFromProp(el, "suggestedPost")
                ?? StringFromProp(el, "suggested_post")
                ?? string.Empty;

            return new IdeaDto(id, tone, title, meta, body, suggestedPost);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static Kernel BuildKernel(string model, string baseUrl, int timeoutSec)
    {
        HttpClient http = new() { Timeout = TimeSpan.FromSeconds(timeoutSec) };
        return Kernel.CreateBuilder()
            .AddOpenAIChatCompletion(
                modelId: model,
                endpoint: new Uri(baseUrl),
                apiKey: "not-required",
                httpClient: http)
            .Build();
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
        sb.AppendLine("== TASK ==");
        sb.AppendLine($"Pick exactly {ctx.IdeasPerDay} distinct angles. Vary the tones — don't return 5 weather angles.");
        sb.AppendLine("Each angle must be grounded in either a specific signal above or a clear seasonal opportunity for this domain.");
        sb.AppendLine();
        sb.AppendLine("== OUTPUT ==");
        sb.AppendLine("Return ONLY a JSON object, no prose, no code fences:");
        sb.AppendLine("{");
        sb.AppendLine("  \"angles\": [");
        sb.AppendLine("    {");
        sb.AppendLine("      \"theme\": \"4-7 word descriptor of the angle\",");
        sb.AppendLine("      \"tone\": \"weather\" | \"holiday\" | \"news\" | \"trend\",");
        sb.AppendLine("      \"triggerSignal\": \"reference to a signal above OR a seasonal opportunity\",");
        sb.AppendLine("      \"rationale\": \"1 sentence on why this angle works for THIS shop today\"");
        sb.AppendLine("    }");
        sb.AppendLine("  ]");
        sb.AppendLine("}");
        return sb.ToString();
    }

    private static string BuildWriterPrompt(Angle angle, RecommendationContext ctx)
    {
        string lang = string.Equals(ctx.GenerationLanguage, "RO", StringComparison.OrdinalIgnoreCase) ? "Romanian" : "English";

        StringBuilder sb = new();
        sb.AppendLine("You are the WRITER in a two-stage marketing pipeline. The Strategist already picked the angle; your job is to turn it into a posting-ready promo idea card.");
        sb.AppendLine();
        sb.AppendLine("== ANGLE TO DEVELOP ==");
        sb.AppendLine($"Theme: {angle.Theme}");
        sb.AppendLine($"Tone: {angle.Tone}");
        sb.AppendLine($"Trigger: {angle.TriggerSignal}");
        sb.AppendLine($"Rationale: {angle.Rationale}");
        sb.AppendLine();
        sb.AppendLine("== SHOP ==");
        AppendShop(sb, ctx);
        sb.AppendLine();
        sb.AppendLine("== TASK ==");
        sb.AppendLine("Quality bar:");
        sb.AppendLine("- Concrete and actionable, grounded in this shop's domain.");
        sb.AppendLine("- The body explains why THIS shop should run THIS promo today — not a generic write-up.");
        sb.AppendLine("- The suggestedPost must be a punchy 5-9 word headline ready to post — like ad copy, not a description.");
        sb.AppendLine();
        sb.AppendLine("== OUTPUT ==");
        sb.AppendLine("Return ONLY a JSON object, no prose, no code fences, with this exact shape:");
        sb.AppendLine("{");
        sb.AppendLine("  \"id\": \"short-kebab-case-id\",");
        sb.AppendLine($"  \"tone\": \"{angle.Tone}\",");
        sb.AppendLine("  \"title\": \"4-8 words, attention-grabbing\",");
        sb.AppendLine("  \"meta\": \"date or short context, e.g. 'Sat May 11' or 'Trending +62%'\",");
        sb.AppendLine("  \"body\": \"1-2 sentences explaining why this works for this shop today\",");
        sb.AppendLine("  \"suggestedPost\": \"5-9 word headline ready to post\"");
        sb.AppendLine("}");
        sb.AppendLine();
        sb.AppendLine($"Write all title / meta / body / suggestedPost text in {lang}. Field names stay in English.");
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

    // ── Instance pipeline (Strategist → Writer → kernel invocation) ───────────
    private async Task<Angle[]> RunStrategistAsync(RecommendationContext ctx, CancellationToken ct)
    {
        string prompt = BuildStrategistPrompt(ctx);
        string raw = await this.InvokeAsync(this.strategistKernel, prompt, this.strategistSettings, ct);

        Angle[]? parsed = TryParseAngles(raw, ctx.IdeasPerDay);
        if (parsed is null)
        {
            this.logger.LogWarning(
                "Strategist JSON parse failed on first attempt, retrying once. Raw head: {Head}",
                Truncate(raw, 200));

            string retryPrompt = prompt + RetryAddendum;
            string retryRaw = await this.InvokeAsync(this.strategistKernel, retryPrompt, this.strategistSettings, ct);
            parsed = TryParseAngles(retryRaw, ctx.IdeasPerDay);
        }

        return parsed ?? Array.Empty<Angle>();
    }

    private async Task<IdeaDto> RunWriterAsync(Angle angle, RecommendationContext ctx, int index, CancellationToken ct)
    {
        string prompt = BuildWriterPrompt(angle, ctx);
        string raw = await this.InvokeAsync(this.writerKernel, prompt, this.writerSettings, ct);

        IdeaDto? parsed = TryParseIdea(raw, angle, index);
        if (parsed is not null)
        {
            return parsed;
        }

        this.logger.LogWarning(
            "Writer #{Index} JSON parse failed, retrying once. Raw head: {Head}",
            index,
            Truncate(raw, 200));

        string retryPrompt = prompt + RetryAddendum;
        string retryRaw = await this.InvokeAsync(this.writerKernel, retryPrompt, this.writerSettings, ct);
        parsed = TryParseIdea(retryRaw, angle, index);

        // If still broken, fabricate a minimal IdeaDto from the angle so the
        // pipeline doesn't fail the whole batch on one writer's bad JSON.
        return parsed ?? new IdeaDto(
            Id: $"angle-{index}",
            Tone: angle.Tone,
            Title: angle.Theme,
            Meta: string.Empty,
            Body: angle.Rationale,
            SuggestedPost: angle.Theme);
    }

    private async Task<string> InvokeAsync(
        Kernel kernel,
        string prompt,
        OpenAIPromptExecutionSettings settings,
        CancellationToken ct)
    {
        FunctionResult result = await kernel.InvokePromptAsync(
            prompt,
            new KernelArguments(settings),
            cancellationToken: ct);
        return result.GetValue<string>() ?? string.Empty;
    }

    private record Angle(string Theme, string Tone, string TriggerSignal, string Rationale);
}
