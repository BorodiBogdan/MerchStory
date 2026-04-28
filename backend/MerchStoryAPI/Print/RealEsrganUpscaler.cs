using Azure.Storage.Blobs;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;

namespace MerchStoryAPI.Print;

// Real-ESRGAN ONNX-backed upscaler. Mirrors the ClipEmbeddingService pattern:
// eager-load the model in the constructor with optional Azure Blob fallback
// download. If a model fails to load the corresponding session stays null
// and UpscaleAsync throws UpscalerUnavailableException — the print route
// surfaces this as a render failure and refunds the premium coin charge.
// Tile-based inference keeps RAM bounded for A3 (4×) renders.
public sealed class RealEsrganUpscaler : IUpscaler, IDisposable
{
    // Inputs at or below this dimension run as a single tile (faster, no seams).
    private const int SinglePassThreshold = 512;

    // Tile size in source pixels for tiled inference. Output tile size is
    // tileSize * scale.
    private const int TileSize = 256;

    // Edge padding around each tile to suppress seam artifacts. The padded
    // region is inferred but discarded when stitching back into the canvas.
    private const int TilePad = 16;

    private readonly InferenceSession? x2Session;
    private readonly InferenceSession? x4Session;
    private readonly SemaphoreSlim semaphore = new(2, 2);

    public RealEsrganUpscaler(IConfiguration configuration, ILogger<RealEsrganUpscaler> logger)
    {
        this.x2Session = TryLoadSession(
            configuration,
            "RealEsrgan:ModelPathX2",
            "RealEsrgan:ModelBlobContainerX2",
            "RealEsrgan:ModelBlobNameX2",
            "x2",
            logger);
        this.x4Session = TryLoadSession(
            configuration,
            "RealEsrgan:ModelPathX4",
            "RealEsrgan:ModelBlobContainerX4",
            "RealEsrgan:ModelBlobNameX4",
            "x4",
            logger);
    }

    public async Task<byte[]> UpscaleAsync(byte[] imageBytes, int scaleFactor, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(imageBytes);
        if (scaleFactor < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(scaleFactor), "Scale factor must be >= 1.");
        }

        if (scaleFactor == 1)
        {
            return imageBytes;
        }

        InferenceSession? session = scaleFactor switch
        {
            2 => this.x2Session,
            4 => this.x4Session,
            _ => null,
        };

        if (session is null)
        {
            throw new UpscalerUnavailableException(
                $"Real-ESRGAN x{scaleFactor} model is not loaded.");
        }

        await this.semaphore.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            return await Task.Run(() => RunInference(session, imageBytes, scaleFactor, ct), ct)
                .ConfigureAwait(false);
        }
        finally
        {
            this.semaphore.Release();
        }
    }

    public void Dispose()
    {
        this.x2Session?.Dispose();
        this.x4Session?.Dispose();
        this.semaphore.Dispose();
    }

    private static byte[] RunInference(InferenceSession session, byte[] imageBytes, int scale, CancellationToken ct)
    {
        using Image<Rgb24> source = Image.Load<Rgb24>(imageBytes);
        int w = source.Width;
        int h = source.Height;
        int outW = w * scale;
        int outH = h * scale;

        byte[] outputBytes = new byte[outW * outH * 3];

        if (w <= SinglePassThreshold && h <= SinglePassThreshold)
        {
            RunTile(session, source, 0, 0, w, h, outputBytes, outW, scale);
        }
        else
        {
            for (int ty = 0; ty < h; ty += TileSize)
            {
                for (int tx = 0; tx < w; tx += TileSize)
                {
                    ct.ThrowIfCancellationRequested();
                    int tw = Math.Min(TileSize, w - tx);
                    int th = Math.Min(TileSize, h - ty);
                    RunTile(session, source, tx, ty, tw, th, outputBytes, outW, scale);
                }
            }
        }

        using Image<Rgb24> outImage = Image.LoadPixelData<Rgb24>(outputBytes, outW, outH);
        using var ms = new MemoryStream();
        outImage.Save(ms, new PngEncoder());
        return ms.ToArray();
    }

    // Pulls a padded tile from `source`, runs ONNX, and writes the inner
    // (un-padded) region of the output into `outputBytes` at the right offset.
    private static void RunTile(
        InferenceSession session,
        Image<Rgb24> source,
        int srcX,
        int srcY,
        int srcW,
        int srcH,
        byte[] outputBytes,
        int outCanvasW,
        int scale)
    {
        int padL = srcX > 0 ? TilePad : 0;
        int padT = srcY > 0 ? TilePad : 0;
        int padR = (srcX + srcW < source.Width) ? TilePad : 0;
        int padB = (srcY + srcH < source.Height) ? TilePad : 0;

        int paddedW = srcW + padL + padR;
        int paddedH = srcH + padT + padB;

        // Build NCHW float32 input tensor in [0, 1] with edge-clamped padding.
        int plane = paddedW * paddedH;
        float[] inputData = new float[3 * plane];
        for (int y = 0; y < paddedH; y++)
        {
            int sy = Math.Clamp(srcY - padT + y, 0, source.Height - 1);
            for (int x = 0; x < paddedW; x++)
            {
                int sx = Math.Clamp(srcX - padL + x, 0, source.Width - 1);
                Rgb24 p = source[sx, sy];
                int idx = (y * paddedW) + x;
                inputData[idx] = p.R / 255f;
                inputData[plane + idx] = p.G / 255f;
                inputData[(2 * plane) + idx] = p.B / 255f;
            }
        }

        var inputTensor = new DenseTensor<float>(inputData, [1, 3, paddedH, paddedW]);
        string inputName = session.InputMetadata.Keys.First();
        var inputs = new List<NamedOnnxValue>
        {
            NamedOnnxValue.CreateFromTensor(inputName, inputTensor),
        };

        using IDisposableReadOnlyCollection<DisposableNamedOnnxValue> outputs = session.Run(inputs);
        DisposableNamedOnnxValue outVal = outputs.First();
        float[] outFlat = outVal.AsEnumerable<float>().ToArray();

        int outPaddedW = paddedW * scale;
        int outPaddedH = paddedH * scale;
        int outPlane = outPaddedW * outPaddedH;

        int copyW = srcW * scale;
        int copyH = srcH * scale;
        int innerOffsetX = padL * scale;
        int innerOffsetY = padT * scale;
        int destOriginX = srcX * scale;
        int destOriginY = srcY * scale;

        for (int y = 0; y < copyH; y++)
        {
            int srcRow = (innerOffsetY + y) * outPaddedW;
            int destRowByte = (((destOriginY + y) * outCanvasW) + destOriginX) * 3;
            for (int x = 0; x < copyW; x++)
            {
                int srcIdx = srcRow + innerOffsetX + x;
                float r = outFlat[srcIdx];
                float g = outFlat[outPlane + srcIdx];
                float b = outFlat[(2 * outPlane) + srcIdx];
                outputBytes[destRowByte + (x * 3)] = ToByte(r);
                outputBytes[destRowByte + (x * 3) + 1] = ToByte(g);
                outputBytes[destRowByte + (x * 3) + 2] = ToByte(b);
            }
        }
    }

    private static byte ToByte(float v)
    {
        if (v <= 0f)
        {
            return 0;
        }

        if (v >= 1f)
        {
            return 255;
        }

        return (byte)(v * 255f);
    }

    private static InferenceSession? TryLoadSession(
        IConfiguration config,
        string pathKey,
        string blobContainerKey,
        string blobNameKey,
        string label,
        ILogger logger)
    {
        string? modelPath = config[pathKey];
        if (string.IsNullOrEmpty(modelPath))
        {
            logger.LogWarning(
                "Real-ESRGAN {Label} model path not configured; this scale will fall back to Lanczos.",
                label);
            return null;
        }

        try
        {
            if (!File.Exists(modelPath)
                && !TryDownloadModel(config, modelPath, blobContainerKey, blobNameKey, label, logger))
            {
                return null;
            }

            var options = new Microsoft.ML.OnnxRuntime.SessionOptions
            {
                GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL,
            };
            var session = new InferenceSession(modelPath, options);
            logger.LogInformation(
                "Real-ESRGAN {Label} model loaded from {ModelPath}",
                label,
                modelPath);
            return session;
        }
        catch (Exception ex)
        {
            logger.LogError(
                ex,
                "Failed to initialize Real-ESRGAN {Label} model; this scale will fall back to Lanczos.",
                label);
            return null;
        }
    }

    private static bool TryDownloadModel(
        IConfiguration configuration,
        string modelPath,
        string blobContainerKey,
        string blobNameKey,
        string label,
        ILogger logger)
    {
        string? blobConnection = configuration["Azure:BlobConnectionString"];
        string? container = configuration[blobContainerKey];
        string? blobName = configuration[blobNameKey];

        if (string.IsNullOrEmpty(blobConnection)
            || string.IsNullOrEmpty(container)
            || string.IsNullOrEmpty(blobName))
        {
            logger.LogWarning(
                "Real-ESRGAN {Label} model not found at '{ModelPath}' and blob download is not configured.",
                label,
                modelPath);
            return false;
        }

        try
        {
            logger.LogInformation(
                "Downloading Real-ESRGAN {Label} model from blob {Container}/{Blob} to {Path}",
                label,
                container,
                blobName,
                modelPath);
            Directory.CreateDirectory(Path.GetDirectoryName(modelPath)!);
            var blobClient = new BlobClient(blobConnection, container, blobName);
            blobClient.DownloadTo(modelPath);
            logger.LogInformation(
                "Real-ESRGAN {Label} model downloaded ({Size} bytes)",
                label,
                new FileInfo(modelPath).Length);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(
                ex,
                "Failed to download Real-ESRGAN {Label} model from blob storage.",
                label);
            return false;
        }
    }
}
