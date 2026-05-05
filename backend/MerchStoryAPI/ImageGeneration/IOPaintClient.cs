using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;

namespace MerchStoryAPI.ImageGeneration;

// Thin wrapper around the IOPaint REST API. Sends an image + binary mask and
// gets back a clean inpainted PNG. The mask convention is: white pixels are
// the regions IOPaint should rewrite, black pixels are kept untouched.
public sealed class IOPaintClient
{
    private readonly HttpClient http;
    private readonly ILogger<IOPaintClient> logger;

    public IOPaintClient(HttpClient http, IConfiguration config, ILogger<IOPaintClient> logger)
    {
        string baseUrl = config["IOPaint:BaseUrl"] ?? "http://localhost:8080";
        this.http = http;
        this.http.BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/");
        this.http.Timeout = TimeSpan.FromSeconds(config.GetValue("IOPaint:TimeoutSeconds", 120));
        this.http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("image/png"));
        this.logger = logger;
    }

    public async Task<byte[]> InpaintAsync(byte[] imagePng, byte[] maskPng, CancellationToken ct = default)
    {
        // IOPaint expects data-URL style strings for image and mask. Most other
        // fields have sensible defaults; we only pin the HD strategy so large
        // catalog renders aren't downscaled to LaMa's preferred 512x512 inputs.
        var body = new JsonObject
        {
            ["image"] = "data:image/png;base64," + Convert.ToBase64String(imagePng),
            ["mask"] = "data:image/png;base64," + Convert.ToBase64String(maskPng),
            ["hd_strategy"] = "Crop",
            ["hd_strategy_crop_trigger_size"] = 800,
            ["hd_strategy_crop_margin"] = 32,
            ["hd_strategy_resize_limit"] = 2048,
            ["ldm_steps"] = 25,
            ["ldm_sampler"] = "plms",
            ["prompt"] = string.Empty,
            ["negative_prompt"] = string.Empty,
            ["use_croper"] = false,
        };

        using var content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");

        this.logger.LogDebug("Calling IOPaint inpaint endpoint at {BaseUrl}", this.http.BaseAddress);
        using HttpResponseMessage response = await this.http.PostAsync("api/v1/inpaint", content, ct);

        if (!response.IsSuccessStatusCode)
        {
            string errBody = await response.Content.ReadAsStringAsync(ct);
            throw new IOPaintException(
                $"IOPaint inpaint failed with {(int)response.StatusCode} {response.ReasonPhrase}: {errBody}");
        }

        return await response.Content.ReadAsByteArrayAsync(ct);
    }
}

public sealed class IOPaintException : Exception
{
    public IOPaintException(string message)
        : base(message)
    {
    }

    public IOPaintException(string message, Exception inner)
        : base(message, inner)
    {
    }
}
