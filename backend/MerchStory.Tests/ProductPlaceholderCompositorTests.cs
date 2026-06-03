using MerchStory.Tests.Fakes;
using MerchStoryAPI.ImageGeneration;
using MerchStoryImageGeneration.Models;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using Xunit;

namespace MerchStory.Tests;

public class ProductPlaceholderCompositorTests
{
    [Fact]
    public async Task Composite_PaintsProductsOverOutlinedRegions()
    {
        var canvas = TestCanvas.CanvasWithOutlines(
            width: 1080,
            height: 1080,
            background: new Rgba32(128, 128, 128, 255),
            outlinedAreas:
            [
                (new Rectangle(50, 300, 300, 400), "#FF00FF"),
                (new Rectangle(400, 300, 300, 400), "#00FFFF"),
                (new Rectangle(750, 300, 280, 400), "#9D00FF"),
            ]);

        var products = new List<CatalogProductItem>
        {
            new("Product A", 10m, Convert.ToBase64String(TestCanvas.SolidProductPng(100, 100, new Rgba32(0, 255, 0, 255)))),
            new("Product B", 20m, Convert.ToBase64String(TestCanvas.SolidProductPng(100, 100, new Rgba32(0, 0, 255, 255)))),
            new("Product C", 30m, Convert.ToBase64String(TestCanvas.SolidProductPng(100, 100, new Rgba32(255, 255, 0, 255)))),
        };

        var assignments = new List<ProductMarkerAssignment>
        {
            new("Product A", "#FF00FF"),
            new("Product B", "#00FFFF"),
            new("Product C", "#9D00FF"),
        };

        CompositeResult result = await ProductPlaceholderCompositor.CompositeAsync(
            canvas, products, assignments, FakeInpaint.Client());

        Assert.Null(result.FallbackReason);
        Assert.Equal(3, result.DetectedRegions);
        Assert.Empty(result.MissingProductNames);

        using var output = Image.Load<Rgba32>(result.Image.ImageData);

        AssertNoLooseMagenta(output);

        // The product paste is bottom-aligned inside each outlined region; the letterboxed 100×100
        // product is scaled up to fit 280×400-ish bboxes, centered horizontally and aligned to the bottom.
        // Sampling a pixel near the bottom-center of each outlined area should hit the pasted product color.
        AssertSampleDominantColor(output, samplePointX: 200, samplePointY: 690, expected: new Rgba32(0, 255, 0, 255));
        AssertSampleDominantColor(output, samplePointX: 550, samplePointY: 690, expected: new Rgba32(0, 0, 255, 255));
        AssertSampleDominantColor(output, samplePointX: 890, samplePointY: 690, expected: new Rgba32(255, 255, 0, 255));
    }

    [Fact]
    public async Task Composite_AcceptsSolidFillFallback()
    {
        var canvas = TestCanvas.CanvasWithSolidFills(
            width: 1080,
            height: 1080,
            background: new Rgba32(128, 128, 128, 255),
            filledAreas:
            [
                (new Rectangle(100, 300, 300, 400), "#FF00FF"),
                (new Rectangle(500, 300, 300, 400), "#00FFFF"),
            ]);

        var products = new List<CatalogProductItem>
        {
            new("Product A", 10m, Convert.ToBase64String(TestCanvas.SolidProductPng(100, 100, new Rgba32(0, 255, 0, 255)))),
            new("Product B", 20m, Convert.ToBase64String(TestCanvas.SolidProductPng(100, 100, new Rgba32(0, 0, 255, 255)))),
        };

        var assignments = new List<ProductMarkerAssignment>
        {
            new("Product A", "#FF00FF"),
            new("Product B", "#00FFFF"),
        };

        CompositeResult result = await ProductPlaceholderCompositor.CompositeAsync(
            canvas, products, assignments, FakeInpaint.Client());

        Assert.Null(result.FallbackReason);
        Assert.Equal(2, result.DetectedRegions);
    }

    [Fact]
    public async Task Composite_FlagsUndetectedMarkerInDiagnostics()
    {
        // Canvas has outlines for only 2 of 3 products (the third color is missing).
        var canvas = TestCanvas.CanvasWithOutlines(
            width: 1080,
            height: 1080,
            background: new Rgba32(128, 128, 128, 255),
            outlinedAreas:
            [
                (new Rectangle(100, 300, 300, 400), "#FF00FF"),
                (new Rectangle(500, 300, 300, 400), "#00FFFF"),
            ]);

        var products = new List<CatalogProductItem>
        {
            new("Alpha", 10m, Convert.ToBase64String(TestCanvas.SolidProductPng(100, 100, new Rgba32(0, 255, 0, 255)))),
            new("Bravo", 20m, Convert.ToBase64String(TestCanvas.SolidProductPng(100, 100, new Rgba32(0, 0, 255, 255)))),
            new("Charlie", 30m, Convert.ToBase64String(TestCanvas.SolidProductPng(100, 100, new Rgba32(255, 255, 0, 255)))),
        };

        var assignments = new List<ProductMarkerAssignment>
        {
            new("Alpha", "#FF00FF"),
            new("Bravo", "#00FFFF"),
            new("Charlie", "#9D00FF"),
        };

        CompositeResult result = await ProductPlaceholderCompositor.CompositeAsync(
            canvas, products, assignments, FakeInpaint.Client());

        // Charlie's marker (#9D00FF) is absent from the canvas, so it matches zero
        // pixels and is flagged as not detected in the per-product diagnostics.
        Assert.NotNull(result.Diagnostics);
        ColorDiagnostic charlie = Assert.Single(result.Diagnostics!, d => d.ProductName == "Charlie");
        Assert.False(charlie.Detected);
        Assert.Equal(0, charlie.TightPixelCount);

        // The two products whose markers are present are detected.
        Assert.True(result.Diagnostics!.Single(d => d.ProductName == "Alpha").Detected);
        Assert.True(result.Diagnostics!.Single(d => d.ProductName == "Bravo").Detected);
    }

    [Fact]
    public async Task Composite_ReturnsNoRegionsWhenNoOutlinesDetected()
    {
        var canvas = TestCanvas.SolidCanvas(1080, 1080, new Rgba32(128, 128, 128, 255));

        var products = new List<CatalogProductItem>
        {
            new("Alpha", 10m, Convert.ToBase64String(TestCanvas.SolidProductPng(100, 100, new Rgba32(0, 255, 0, 255)))),
        };

        var assignments = new List<ProductMarkerAssignment>
        {
            new("Alpha", "#FF00FF"),
        };

        CompositeResult result = await ProductPlaceholderCompositor.CompositeAsync(
            canvas, products, assignments, FakeInpaint.Client());

        Assert.Equal(FallbackReason.NoRegions, result.FallbackReason);
        Assert.Equal(0, result.DetectedRegions);
    }

    private static void AssertNoLooseMagenta(Image<Rgba32> img)
    {
        int matches = 0;
        img.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < row.Length; x++)
                {
                    var p = row[x];
                    if (p.R >= 180 && p.G <= 110 && p.B >= 180)
                    {
                        matches++;
                    }
                }
            }
        });

        Assert.True(matches < 50, $"Expected output to be essentially free of loose magenta pixels, got {matches}.");
    }

    private static void AssertSampleDominantColor(Image<Rgba32> img, int samplePointX, int samplePointY, Rgba32 expected)
    {
        Rgba32 actual = default;
        img.ProcessPixelRows(accessor =>
        {
            actual = accessor.GetRowSpan(samplePointY)[samplePointX];
        });

        int dr = Math.Abs(actual.R - expected.R);
        int dg = Math.Abs(actual.G - expected.G);
        int db = Math.Abs(actual.B - expected.B);
        Assert.True(
            dr <= 20 && dg <= 20 && db <= 20,
            $"Expected pixel near ({expected.R},{expected.G},{expected.B}) at ({samplePointX},{samplePointY}), got ({actual.R},{actual.G},{actual.B})");
    }
}
