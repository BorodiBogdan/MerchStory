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
    private readonly InferenceSession? textSession;
    private readonly ClipTokenizer? tokenizer;
    private readonly ILogger<ClipEmbeddingService> logger;

    public ClipEmbeddingService(
        IConfiguration configuration,
        BlobServiceClient blobServiceClient,
        ILogger<ClipEmbeddingService> logger)
    {
        this.logger = logger;

        string? container = configuration["Clip:ModelBlobContainer"];

        this.session = TryLoadSession(
            configuration["Clip:ModelPath"],
            container,
            configuration["Clip:ModelBlobName"],
            blobServiceClient,
            logger,
            "vision model");

        // The text encoder + tokenizer power text-to-image search. They are
        // optional: if unconfigured, image search still works and text search
        // surfaces a 503 instead of failing the whole service.
        this.textSession = TryLoadSession(
            configuration["Clip:TextModelPath"],
            container,
            configuration["Clip:TextModelBlobName"],
            blobServiceClient,
            logger,
            "text model");

        if (this.textSession is not null)
        {
            this.tokenizer = TryLoadTokenizer(configuration, container, blobServiceClient, logger);
            if (this.tokenizer is null)
            {
                this.logger.LogWarning(
                    "CLIP text encoder loaded but tokenizer assets are missing; text search will be unavailable.");
            }
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

    public Vector EmbedText(string text)
    {
        if (this.textSession is null || this.tokenizer is null)
        {
            throw new ClipServiceUnavailableException();
        }

        IReadOnlyList<int> ids = this.tokenizer.Encode(text);
        long[] inputIds = new long[ClipTokenizer.ContextLength];
        long[] attentionMask = new long[ClipTokenizer.ContextLength];
        for (int i = 0; i < ids.Count; i++)
        {
            inputIds[i] = ids[i];
            attentionMask[i] = 1;
        }

        var idsTensor = new DenseTensor<long>(inputIds, [1, ClipTokenizer.ContextLength]);
        var inputs = new List<NamedOnnxValue>
        {
            NamedOnnxValue.CreateFromTensor("input_ids", idsTensor),
        };

        // Some CLIP text exports take only input_ids; only pass the mask if the model declares it.
        if (this.textSession.InputMetadata.ContainsKey("attention_mask"))
        {
            var maskTensor = new DenseTensor<long>(attentionMask, [1, ClipTokenizer.ContextLength]);
            inputs.Add(NamedOnnxValue.CreateFromTensor("attention_mask", maskTensor));
        }

        using IDisposableReadOnlyCollection<DisposableNamedOnnxValue> outputs = this.textSession.Run(inputs);

        DisposableNamedOnnxValue embedOutput = outputs.FirstOrDefault(o => o.Name == "text_embeds")
            ?? outputs.First();

        float[] raw = embedOutput.AsEnumerable<float>().ToArray();
        float[] normalized = L2Normalize(raw);
        return new Vector(normalized);
    }

    public void Dispose()
    {
        this.session?.Dispose();
        this.textSession?.Dispose();
    }

    private static InferenceSession? TryLoadSession(
        string? modelPath,
        string? container,
        string? blobName,
        BlobServiceClient blobServiceClient,
        ILogger logger,
        string label)
    {
        if (string.IsNullOrEmpty(modelPath))
        {
            logger.LogWarning("CLIP {Label} path is not configured; the related search feature will be unavailable.", label);
            return null;
        }

        try
        {
            if (!EnsureAsset(modelPath, container, blobName, blobServiceClient, logger, label))
            {
                return null;
            }

            var options = new Microsoft.ML.OnnxRuntime.SessionOptions();
            options.GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL;
            var session = new InferenceSession(modelPath, options);
            logger.LogInformation("CLIP {Label} loaded from {ModelPath}", label, modelPath);
            return session;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to initialize CLIP {Label}; the related search feature will be unavailable.", label);
            return null;
        }
    }

    private static ClipTokenizer? TryLoadTokenizer(
        IConfiguration configuration,
        string? container,
        BlobServiceClient blobServiceClient,
        ILogger logger)
    {
        string? vocabPath = configuration["Clip:VocabPath"];
        string? mergesPath = configuration["Clip:MergesPath"];

        if (string.IsNullOrEmpty(vocabPath) || string.IsNullOrEmpty(mergesPath))
        {
            logger.LogWarning(
                "CLIP tokenizer paths (Clip:VocabPath / Clip:MergesPath) are not configured; text search will be unavailable.");
            return null;
        }

        if (!EnsureAsset(vocabPath, container, configuration["Clip:VocabBlobName"], blobServiceClient, logger, "tokenizer vocab")
            || !EnsureAsset(mergesPath, container, configuration["Clip:MergesBlobName"], blobServiceClient, logger, "tokenizer merges"))
        {
            return null;
        }

        try
        {
            return new ClipTokenizer(vocabPath, mergesPath);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to load CLIP tokenizer assets; text search will be unavailable.");
            return null;
        }
    }

    /// <summary>
    /// Ensures a local asset exists, downloading it from blob storage when missing
    /// and download is configured. Returns false (with a warning) when unavailable.
    /// </summary>
    private static bool EnsureAsset(
        string localPath,
        string? container,
        string? blobName,
        BlobServiceClient blobServiceClient,
        ILogger logger,
        string label)
    {
        if (File.Exists(localPath))
        {
            return true;
        }

        if (string.IsNullOrEmpty(container) || string.IsNullOrEmpty(blobName))
        {
            logger.LogWarning(
                "CLIP {Label} not found at '{Path}' and blob download is not configured. The related feature will be unavailable.",
                label,
                localPath);
            return false;
        }

        try
        {
            logger.LogInformation("Downloading CLIP {Label} from blob {Container}/{Blob} to {Path}", label, container, blobName, localPath);
            Directory.CreateDirectory(Path.GetDirectoryName(localPath)!);
            BlobClient blobClient = blobServiceClient.GetBlobContainerClient(container).GetBlobClient(blobName);
            blobClient.DownloadTo(localPath);
            logger.LogInformation("CLIP {Label} downloaded ({Size} bytes)", label, new FileInfo(localPath).Length);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to download CLIP {Label} from blob storage.", label);
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
