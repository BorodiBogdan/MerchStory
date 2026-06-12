using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using MerchStoryImageGeneration.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MerchStoryImageGeneration.Services;

// OpenAI image model (gpt-image-2 by default). Picked per request by the catalog
// flow as an alternative to Gemini ("nano banana"). When the request carries
// inline product/logo images we hit the images/edits endpoint so the model is
// conditioned on them, matching Gemini's image-aware behaviour; otherwise we use
// plain text-to-image generation.
internal sealed class OpenAiImageProvider : IImageProvider
{
    private const string EditsUrl = "https://api.openai.com/v1/images/edits";
    private const string GenerationsUrl = "https://api.openai.com/v1/images/generations";
    private const string DefaultModel = "gpt-image-2";

    // Shared client to avoid socket exhaustion. Generous timeout because image
    // models can take tens of seconds to respond.
    private static readonly HttpClient SharedHttpClient = new()
    {
        Timeout = TimeSpan.FromMinutes(3),
    };

    private readonly IConfiguration configuration;
    private readonly ILogger<OpenAiImageProvider> logger;

    public OpenAiImageProvider(IConfiguration configuration, ILogger<OpenAiImageProvider> logger)
    {
        this.configuration = configuration;
        this.logger = logger;
    }

    public async Task<ImageGenerationResult> GenerateAsync(
        string prompt,
        IReadOnlyList<string?>? inlineImages = null,
        CancellationToken cancellationToken = default)
    {
        // Fall back to the existing OpenAI chat key so the option works against the
        // same account without configuring a second secret.
        string? apiKey = this.configuration["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            apiKey = this.configuration["Recommendations:Llm:ChatGpt:ApiKey"];
        }

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("OpenAI:ApiKey is not configured.");
        }

        string? configuredModel = this.configuration["OpenAI:ImageModel"];
        string model = string.IsNullOrWhiteSpace(configuredModel) ? DefaultModel : configuredModel;

        var images = inlineImages?
            .Where(img => !string.IsNullOrWhiteSpace(img))
            .Select(img => img!)
            .ToList() ?? new List<string>();

        using HttpRequestMessage requestMessage = images.Count > 0
            ? BuildEditsRequest(model, prompt, images)
            : BuildGenerationRequest(model, prompt);
        requestMessage.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        using HttpResponseMessage response = await SharedHttpClient.SendAsync(requestMessage, cancellationToken);
        string body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            this.logger.LogWarning(
                "OpenAI image generation failed ({Status}): {Body}", (int)response.StatusCode, body);
            throw new InvalidOperationException("No image returned from generation service.");
        }

        byte[]? imageData = ExtractImage(body);
        if (imageData is null)
        {
            this.logger.LogWarning("No image returned from OpenAI for prompt: {Prompt}", prompt);
            throw new InvalidOperationException("No image returned from generation service.");
        }

        return new ImageGenerationResult(imageData, "image/png");
    }

    private static HttpRequestMessage BuildGenerationRequest(string model, string prompt)
    {
        // "low" is the least restrictive setting the API allows (default is "auto").
        // Product/catalog imagery routinely trips the stricter default filter with a
        // spurious "other" category, so we relax it here. Genuinely high-risk content
        // is still blocked even on "low".
        string json = JsonSerializer.Serialize(new { model, prompt, n = 1, moderation = "low" });
        return new HttpRequestMessage(HttpMethod.Post, GenerationsUrl)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json"),
        };
    }

    private static HttpRequestMessage BuildEditsRequest(
        string model, string prompt, IReadOnlyList<string> images)
    {
        // NOTE: the images/edits endpoint does NOT support the "moderation" parameter
        // (unlike images/generations) — output moderation here is locked to "auto" and
        // cannot be relaxed. So branded/real-product catalogs conditioned on inline
        // photos are prone to "moderation_blocked" (output, "other") with no API knob to
        // disable it. Gemini handles this path without the same filter.
        var content = new MultipartFormDataContent
        {
            { new StringContent(model), "model" },
            { new StringContent(prompt), "prompt" },
            { new StringContent("1"), "n" },
        };

        int index = 0;
        foreach (string raw in images)
        {
            (byte[] data, string mime) = InlineImageDecoder.Decode(raw);
            var imageContent = new ByteArrayContent(data);
            imageContent.Headers.ContentType = new MediaTypeHeaderValue(mime);
            string extension = mime.Contains("png", StringComparison.OrdinalIgnoreCase) ? "png" : "jpg";
            content.Add(imageContent, "image[]", $"image{index++}.{extension}");
        }

        return new HttpRequestMessage(HttpMethod.Post, EditsUrl) { Content = content };
    }

    private static byte[]? ExtractImage(string responseBody)
    {
        using JsonDocument doc = JsonDocument.Parse(responseBody);
        if (!doc.RootElement.TryGetProperty("data", out JsonElement data) ||
            data.ValueKind != JsonValueKind.Array || data.GetArrayLength() == 0)
        {
            return null;
        }

        JsonElement first = data[0];
        if (first.TryGetProperty("b64_json", out JsonElement b64) && b64.ValueKind == JsonValueKind.String)
        {
            string? value = b64.GetString();
            return string.IsNullOrWhiteSpace(value) ? null : Convert.FromBase64String(value);
        }

        return null;
    }
}
