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

    private readonly InferenceSession session;
    private readonly ILogger<ClipEmbeddingService> logger;

    public ClipEmbeddingService(IConfiguration configuration, ILogger<ClipEmbeddingService> logger)
    {
        this.logger = logger;

        string modelPath = configuration["Clip:ModelPath"]
            ?? throw new InvalidOperationException("Clip:ModelPath is not configured.");

        if (!File.Exists(modelPath))
        {
            throw new FileNotFoundException(
                $"CLIP model not found at '{modelPath}'. " +
                "Download clip_vision_model.onnx from https://huggingface.co/Qdrant/clip-ViT-B-32-vision and place it at the configured path.",
                modelPath);
        }

        var options = new Microsoft.ML.OnnxRuntime.SessionOptions();
        options.GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL;
        this.session = new InferenceSession(modelPath, options);
        this.logger.LogInformation("CLIP model loaded from {ModelPath}", modelPath);
    }

    public Vector Embed(byte[] imageBytes)
    {
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

    public void Dispose() => this.session.Dispose();

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
