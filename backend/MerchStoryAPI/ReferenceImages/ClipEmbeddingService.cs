using Azure.Storage.Blobs;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using Pgvector;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace MerchStoryAPI.ReferenceImages;

public sealed class ClipEmbeddingService : IClipEmbeddingService, IDisposable
{
    private const int InputSize = 224;
    private const int EmbeddingDim = 512;

    // CLIP normalization constants
    private static readonly float[] Mean = [0.48145466f, 0.4578275f, 0.40821073f];
    private static readonly float[] Std = [0.26862954f, 0.26130258f, 0.27577711f];

    private readonly InferenceSession? session;
    private readonly ILogger<ClipEmbeddingService> logger;

    public ClipEmbeddingService(IConfiguration configuration, ILogger<ClipEmbeddingService> logger)
    {
        this.logger = logger;

        string? modelPath = configuration["Clip:ModelPath"];
        if (string.IsNullOrEmpty(modelPath))
        {
            logger.LogWarning("CLIP model path is not configured; image-search features will be unavailable.");
            return;
        }

        try
        {
            if (!File.Exists(modelPath) && !TryDownloadModel(configuration, modelPath, logger))
            {
                return;
            }

            var options = new Microsoft.ML.OnnxRuntime.SessionOptions();
            options.GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL;
            this.session = new InferenceSession(modelPath, options);
            this.logger.LogInformation("CLIP model loaded from {ModelPath}", modelPath);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to initialize CLIP model; image-search features will be unavailable.");
        }
    }

    public Vector Embed(byte[] imageBytes)
    {
        if (this.session is null)
        {
            throw new ClipServiceUnavailableException();
        }

        float[] tensor = this.Preprocess(imageBytes);
        var inputTensor = new DenseTensor<float>(tensor, [1, 3, InputSize, InputSize]);
        var inputs = new List<NamedOnnxValue>
        {
            NamedOnnxValue.CreateFromTensor("pixel_values", inputTensor),
        };

        using IDisposableReadOnlyCollection<DisposableNamedOnnxValue> outputs = this.session.Run(inputs);

        // The Qdrant clip-ViT-B-32-vision model outputs "image_embeds"
        DisposableNamedOnnxValue? embedOutput = outputs.FirstOrDefault(o => o.Name == "image_embeds")
            ?? outputs.First();

        float[] raw = embedOutput.AsEnumerable<float>().ToArray();
        float[] normalized = L2Normalize(raw);
        return new Vector(normalized);
    }

    public void Dispose() => this.session?.Dispose();

    private static bool TryDownloadModel(IConfiguration configuration, string modelPath, ILogger logger)
    {
        string? blobConnection = configuration["Azure:BlobConnectionString"];
        string? container = configuration["Clip:ModelBlobContainer"];
        string? blobName = configuration["Clip:ModelBlobName"];

        if (string.IsNullOrEmpty(blobConnection) || string.IsNullOrEmpty(container) || string.IsNullOrEmpty(blobName))
        {
            logger.LogWarning(
                "CLIP model not found at '{ModelPath}' and blob download is not configured " +
                "(set Azure:BlobConnectionString, Clip:ModelBlobContainer, Clip:ModelBlobName). " +
                "Image-search features will be unavailable.",
                modelPath);
            return false;
        }

        try
        {
            logger.LogInformation("Downloading CLIP model from blob {Container}/{Blob} to {Path}", container, blobName, modelPath);
            Directory.CreateDirectory(Path.GetDirectoryName(modelPath)!);
            var blobClient = new BlobClient(blobConnection, container, blobName);
            blobClient.DownloadTo(modelPath);
            logger.LogInformation("CLIP model downloaded ({Size} bytes)", new FileInfo(modelPath).Length);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to download CLIP model from blob storage.");
            return false;
        }
    }

    private static float[] L2Normalize(float[] v)
    {
        double norm = Math.Sqrt(v.Sum(x => (double)x * x));
        if (norm < 1e-12)
        {
            return v;
        }

        return v.Select(x => (float)(x / norm)).ToArray();
    }

    private float[] Preprocess(byte[] imageBytes)
    {
        using Image<Rgb24> image = Image.Load<Rgb24>(imageBytes);

        // Resize shortest side to InputSize then center-crop to InputSize x InputSize
        int w = image.Width;
        int h = image.Height;
        int shortSide = Math.Min(w, h);
        int newW = (int)Math.Round((double)w / shortSide * InputSize);
        int newH = (int)Math.Round((double)h / shortSide * InputSize);

        image.Mutate(ctx =>
        {
            ctx.Resize(newW, newH);
            int cropX = (newW - InputSize) / 2;
            int cropY = (newH - InputSize) / 2;
            ctx.Crop(new Rectangle(cropX, cropY, InputSize, InputSize));
        });

        // Pack into channel-first float tensor [1, 3, 224, 224] and normalize
        float[] tensor = new float[3 * InputSize * InputSize];
        for (int y = 0; y < InputSize; y++)
        {
            for (int x = 0; x < InputSize; x++)
            {
                Rgb24 pixel = image[x, y];
                int idx = (y * InputSize) + x;
                tensor[(0 * InputSize * InputSize) + idx] = ((pixel.R / 255f) - Mean[0]) / Std[0];
                tensor[(1 * InputSize * InputSize) + idx] = ((pixel.G / 255f) - Mean[1]) / Std[1];
                tensor[(2 * InputSize * InputSize) + idx] = ((pixel.B / 255f) - Mean[2]) / Std[2];
            }
        }

        return tensor;
    }
}
