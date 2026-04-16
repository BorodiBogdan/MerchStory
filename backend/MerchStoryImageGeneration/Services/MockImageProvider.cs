using System.IO.Compression;
using System.Text;
using MerchStoryImageGeneration.Models;

namespace MerchStoryImageGeneration.Services;

/// <summary>A placeholder image provider that returns a solid-gray 16:9 PNG without calling any external API.</summary>
internal sealed class MockImageProvider : IImageProvider
{
    /// <inheritdoc/>
    public Task<ImageGenerationResult> GenerateAsync(
        string prompt,
        IReadOnlyList<string?>? inlineImages = null,
        CancellationToken cancellationToken = default)
    {
        byte[] png = GeneratePlaceholder16x9Png();
        return Task.FromResult(new ImageGenerationResult(png, "image/png"));
    }

    // Builds a valid 180×320 (9:16) gray PNG from scratch — no external dependencies.
    private static byte[] GeneratePlaceholder16x9Png()
    {
        const int width = 180;
        const int height = 320;
        const byte gray = 180;

        // Raw scanlines: one filter byte (0 = None) followed by RGB triplets.
        int rowStride = 1 + (width * 3);
        byte[] raw = new byte[height * rowStride];
        for (int y = 0; y < height; y++)
        {
            int offset = y * rowStride;
            raw[offset] = 0; // filter type: None
            for (int x = 0; x < width; x++)
            {
                raw[offset + 1 + (x * 3)] = gray;
                raw[offset + 1 + (x * 3) + 1] = gray;
                raw[offset + 1 + (x * 3) + 2] = gray;
            }
        }

        byte[] idat = ZlibCompress(raw);

        using var ms = new MemoryStream();
        ms.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }); // PNG signature
        WriteChunk(ms, "IHDR", BuildIhdr(width, height));
        WriteChunk(ms, "IDAT", idat);
        WriteChunk(ms, "IEND", []);
        return ms.ToArray();
    }

    private static byte[] BuildIhdr(int width, int height)
    {
        byte[] data = new byte[13];
        WriteInt32Be(data, 0, width);
        WriteInt32Be(data, 4, height);
        data[8] = 8; // bit depth
        data[9] = 2; // color type: RGB

        // data[10..12] stay 0: compression=deflate, filter=adaptive, interlace=none
        return data;
    }

    private static void WriteChunk(Stream stream, string type, byte[] data)
    {
        byte[] typeBytes = Encoding.ASCII.GetBytes(type);
        WriteInt32Be(stream, data.Length);
        stream.Write(typeBytes);
        stream.Write(data);
        uint crc = ComputeCrc32(typeBytes, data);
        WriteInt32Be(stream, (int)crc);
    }

    private static byte[] ZlibCompress(byte[] data)
    {
        using var output = new MemoryStream();
        using (var zlib = new ZLibStream(output, CompressionLevel.Fastest))
        {
            zlib.Write(data);
        }

        return output.ToArray();
    }

    private static void WriteInt32Be(Stream stream, int value)
    {
        stream.WriteByte((byte)(value >> 24));
        stream.WriteByte((byte)(value >> 16));
        stream.WriteByte((byte)(value >> 8));
        stream.WriteByte((byte)value);
    }

    private static void WriteInt32Be(byte[] buf, int offset, int value)
    {
        buf[offset] = (byte)(value >> 24);
        buf[offset + 1] = (byte)(value >> 16);
        buf[offset + 2] = (byte)(value >> 8);
        buf[offset + 3] = (byte)value;
    }

    private static uint ComputeCrc32(byte[] a, byte[] b)
    {
        uint crc = 0xFFFFFFFF;
        foreach (byte bt in a)
        {
            crc = Crc32Step(crc, bt);
        }

        foreach (byte bt in b)
        {
            crc = Crc32Step(crc, bt);
        }

        return ~crc;
    }

    private static uint Crc32Step(uint crc, byte b)
    {
        crc ^= b;
        for (int i = 0; i < 8; i++)
        {
            crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xEDB88320u : crc >> 1;
        }

        return crc;
    }
}
