using MerchStory.Tests.Fakes;
using MerchStoryAPI.ImageGeneration;
using MerchStoryImageGeneration.Models;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using Xunit;

namespace MerchStory.Tests;

// Pure unit tests for the deterministic catalogue compositor. No host, no database, no
// AI provider: the compositor is driven directly through its inputs and outputs. Product
// photos are bright red on a white wallpaper so that "a product was drawn here" can be
// asserted by counting red pixels in a region, without depending on exact layout maths.
public class CatalogCompositorTests
{
    private static readonly Rgba32 White = new(255, 255, 255, 255);
    private static readonly Rgba32 Red = new(220, 30, 30, 255);

    [Fact]
    public void Composite_NormalisesCanvasTo1080Wide()
    {
        // A 540x540 wallpaper must be scaled up to the fixed 1080 px working width.
        using Image<Rgba32> output = Composite(
            wallpaper: TestCanvas.SolidCanvas(540, 540, White),
            layout: "Story",
            images: new string?[] { null });

        Assert.Equal(1080, output.Width);
        Assert.Equal(1080, output.Height);
    }

    [Fact]
    public void Composite_StoryLayout_StacksProductsVertically()
    {
        // Two products in a single column: one occupies the top half, one the bottom half.
        using Image<Rgba32> output = Composite(
            wallpaper: TestCanvas.SolidCanvas(1080, 1080, White),
            layout: "Story",
            images: new string?[] { RedProduct(), RedProduct() });

        Assert.True(RedPixelCount(output, new Rectangle(0, 0, 1080, 540)) > 100, "top half should contain a product");
        Assert.True(RedPixelCount(output, new Rectangle(0, 540, 1080, 540)) > 100, "bottom half should contain a product");
    }

    [Fact]
    public void Composite_ShowcaseLayout_FillsHeroAndSideColumns()
    {
        // With four products the Showcase layout puts two in the hero column (left 55%)
        // and two in the side column (right). Both sides should carry product pixels.
        using Image<Rgba32> output = Composite(
            wallpaper: TestCanvas.SolidCanvas(1080, 1080, White),
            layout: "Showcase",
            images: new string?[] { RedProduct(), RedProduct(), RedProduct(), RedProduct() });

        Assert.True(RedPixelCount(output, new Rectangle(0, 0, 540, 1080)) > 100, "hero column should contain products");
        Assert.True(RedPixelCount(output, new Rectangle(640, 0, 440, 1080)) > 100, "side column should contain products");
    }

    [Fact]
    public void Composite_PlacementZone_ConfinesCardsToSubRectangle()
    {
        // Restrict placement to the bottom-right quadrant; the top-left quadrant must stay
        // background-coloured (no product pixels leak outside the zone).
        using Image<Rgba32> output = Composite(
            wallpaper: TestCanvas.SolidCanvas(1080, 1080, White),
            layout: "Story",
            images: new string?[] { RedProduct() },
            zone: new PlacementZone(0.5, 0.5, 0.5, 0.5));

        Assert.Equal(0, RedPixelCount(output, new Rectangle(0, 0, 540, 540)));
        Assert.True(RedPixelCount(output, new Rectangle(540, 540, 540, 540)) > 100, "product should sit inside the zone");
    }

    [Fact]
    public void Composite_NullProductImage_FallsBackToTextOnlyWithoutThrowing()
    {
        // No image for the product: the text-only path runs (name + price) and produces a
        // valid PNG. This also exercises the currency-formatting branch.
        using Image<Rgba32> output = Composite(
            wallpaper: TestCanvas.SolidCanvas(1080, 1080, White),
            layout: "Story",
            images: new string?[] { null },
            showPrices: true,
            showProductNames: true);

        Assert.Equal(1080, output.Width);
    }

    [Fact]
    public void Composite_MixedNullAndImageProducts_RendersBothByIndex()
    {
        // First product has a photo, second has none; the compositor aligns images to
        // products by index and renders each through the appropriate path.
        using Image<Rgba32> output = Composite(
            wallpaper: TestCanvas.SolidCanvas(1080, 1080, White),
            layout: "Story",
            images: new string?[] { RedProduct(), null },
            showProductNames: true);

        Assert.Equal(1080, output.Width);
        Assert.True(RedPixelCount(output, new Rectangle(0, 0, 1080, 1080)) > 100, "the product with a photo should be drawn");
    }

    private static Image<Rgba32> Composite(
        byte[] wallpaper,
        string layout,
        string?[] images,
        bool showPrices = false,
        bool showProductNames = false,
        PlacementZone? zone = null)
    {
        var products = new List<CatalogProductApiItem>();
        for (int i = 0; i < images.Length; i++)
        {
            products.Add(new CatalogProductApiItem(Guid.NewGuid(), $"Product {i}", 9.99m, "USD"));
        }

        var request = new CatalogOnWallpaperApiRequest(
            Products: products,
            WallpaperBase64: Convert.ToBase64String(wallpaper),
            Layout: layout,
            ShowPrices: showPrices,
            ShowProductNames: showProductNames,
            TextStyle: null,
            PlacementZone: zone);

        ImageGenerationResult result = CatalogCompositor.Composite(request, images);
        return Image.Load<Rgba32>(result.ImageData);
    }

    private static string RedProduct() => Convert.ToBase64String(TestCanvas.SolidProductPng(200, 200, Red));

    private static int RedPixelCount(Image<Rgba32> image, Rectangle region)
    {
        int count = 0;
        int xEnd = Math.Min(region.Right, image.Width);
        int yEnd = Math.Min(region.Bottom, image.Height);
        for (int y = region.Top; y < yEnd; y++)
        {
            for (int x = region.Left; x < xEnd; x++)
            {
                Rgba32 p = image[x, y];
                if (p.R > 150 && p.G < 100 && p.B < 100)
                {
                    count++;
                }
            }
        }

        return count;
    }
}
