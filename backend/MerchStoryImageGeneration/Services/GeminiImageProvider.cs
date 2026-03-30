using Google.GenAI;
using Google.GenAI.Types;
using MerchStoryImageGeneration.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MerchStoryImageGeneration.Services;

internal sealed class GeminiImageProvider : IImageProvider
{
    private readonly IConfiguration configuration;
    private readonly ILogger<GeminiImageProvider> logger;

    public GeminiImageProvider(IConfiguration configuration, ILogger<GeminiImageProvider> logger)
    {
        this.configuration = configuration;
        this.logger = logger;
    }

    public async Task<ImageGenerationResult> GenerateAsync(string prompt, CancellationToken cancellationToken = default)
    {
        string? googleApiKey = this.configuration["Google:ApiKey"];
        if (string.IsNullOrWhiteSpace(googleApiKey))
        {
            throw new InvalidOperationException("Google:ApiKey is not configured.");
        }

        var client = new Client(apiKey: googleApiKey);

        var contents = new List<Content>
        {
            new Content
            {
                Role = "user",
                Parts = new List<Part>
                {
                    new Part { Text = prompt },
                },
            },
        };

        var generateConfig = new GenerateContentConfig
        {
            ResponseModalities = new List<string> { "IMAGE", "TEXT" },
        };

        byte[]? imageData = null;
        string mimeType = "image/png";

        await foreach (var chunk in client.Models.GenerateContentStreamAsync("gemini-3-pro-image-preview", contents, generateConfig, cancellationToken))
        {
            if (chunk.Candidates == null || chunk.Candidates.Count == 0 ||
                chunk.Candidates[0].Content?.Parts == null)
            {
                continue;
            }

            Part? part = chunk.Candidates[0].Content?.Parts?[0];
            if (part?.InlineData?.Data != null)
            {
                imageData = part.InlineData.Data;
                mimeType = part.InlineData.MimeType ?? "image/png";
                break;
            }
        }

        if (imageData is null)
        {
            this.logger.LogWarning("No image returned from Gemini for prompt: {Prompt}", prompt);
            throw new InvalidOperationException("No image returned from generation service.");
        }

        return new ImageGenerationResult(imageData, mimeType);
    }
}
