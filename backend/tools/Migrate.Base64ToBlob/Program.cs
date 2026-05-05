using Azure.Storage.Blobs;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryAPI.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

// One-off backfill: read each row's *Base64 column, upload the bytes to blob,
// write the new key onto the row's *BlobKey column. Idempotent — rows that
// already have a BlobKey are skipped, so the script can be re-run after a
// crash without double-writing.
//
// Usage:
//   dotnet run --project backend/tools/Migrate.Base64ToBlob -- [--table all|shop|products|gallery|references|prints]
//                                                              [--dry-run]
//                                                              [--batch 200]
//
// Defaults: --table all, batch 200, no dry-run.

string table = "all";
bool dryRun = false;
int batchSize = 200;

for (int i = 0; i < args.Length; i++)
{
    switch (args[i])
    {
        case "--table" when i + 1 < args.Length:
            table = args[++i].ToLowerInvariant();
            break;
        case "--dry-run":
            dryRun = true;
            break;
        case "--batch" when i + 1 < args.Length:
            batchSize = int.Parse(args[++i]);
            break;
    }
}

string repoRoot = FindRepoRoot();
string appsettingsPath = Path.Combine(repoRoot, "backend", "MerchStoryAPI", "appsettings.Development.json");

IConfiguration config = new ConfigurationBuilder()
    .AddJsonFile(appsettingsPath, optional: false, reloadOnChange: false)
    .AddEnvironmentVariables()
    .Build();

ServiceCollection services = new();
services.AddLogging(b => b.AddSimpleConsole(o =>
{
    o.SingleLine = true;
    o.IncludeScopes = false;
}));
services.AddSingleton<IConfiguration>(config);
services.AddDbContext<AppDbContext>(opts =>
    opts.UseNpgsql(config.GetConnectionString("DefaultConnection"), o => o.UseVector()));

services.Configure<BlobStorageOptions>(config.GetSection("Storage"));
services.AddSingleton(_ => new BlobServiceClient(config["Azure:BlobConnectionString"]));
services.AddSingleton<IBlobStorage, AzureBlobStorage>();

await using ServiceProvider sp = services.BuildServiceProvider();
ILogger<Program> log = sp.GetRequiredService<ILoggerFactory>().CreateLogger<Program>();

log.LogInformation(
    "Migrate base64 -> blob | table={Table} dryRun={DryRun} batch={Batch}",
    table,
    dryRun,
    batchSize);

if (table is "all" or "shop")
{
    await MigrateShopLogosAsync(sp, log, dryRun, batchSize);
}

if (table is "all" or "products")
{
    await MigrateProductImagesAsync(sp, log, dryRun, batchSize);
}

if (table is "all" or "gallery")
{
    await MigrateGalleryImagesAsync(sp, log, dryRun, batchSize);
}

if (table is "all" or "references")
{
    await MigrateReferenceImagesAsync(sp, log, dryRun, batchSize);
}

if (table is "all" or "prints")
{
    await MigratePrintJobsAsync(sp, log, dryRun, batchSize);
}

log.LogInformation("Done.");
return;

static async Task MigrateShopLogosAsync(IServiceProvider sp, ILogger log, bool dryRun, int batch)
{
    using IServiceScope scope = sp.CreateScope();
    AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    IBlobStorage blobs = scope.ServiceProvider.GetRequiredService<IBlobStorage>();

    int migrated = 0;
    int skipped = 0;
    int failed = 0;

    while (true)
    {
        List<ShopProfile> rows = await db.ShopProfiles
            .Where(s => s.LogoBlobKey == null && s.LogoBase64 != null)
            .OrderBy(s => s.Id)
            .Take(batch)
            .ToListAsync();

        if (rows.Count == 0)
        {
            break;
        }

        foreach (ShopProfile row in rows)
        {
            try
            {
                (byte[] bytes, string contentType) = DecodeBase64WithMime(row.LogoBase64!);
                if (bytes.Length == 0)
                {
                    skipped++;
                    continue;
                }

                if (!dryRun)
                {
                    using MemoryStream ms = new(bytes);
                    BlobRef uploaded = await blobs.UploadAsync(
                        "logos",
                        row.UserId,
                        ms,
                        contentType,
                        ExtensionFor(contentType));
                    row.LogoBlobKey = uploaded.Key;
                    row.LogoContentType = contentType;
                }

                migrated++;
            }
            catch (Exception ex)
            {
                failed++;
                log.LogWarning(ex, "Shop {Id} failed to migrate", row.Id);
            }
        }

        if (!dryRun)
        {
            await db.SaveChangesAsync();
        }

        log.LogInformation(
            "shop: batch processed | migrated={Migrated} failed={Failed} skipped={Skipped}",
            migrated,
            failed,
            skipped);
    }

    log.LogInformation(
        "shop done | migrated={Migrated} skipped={Skipped} failed={Failed}",
        migrated,
        skipped,
        failed);
}

static async Task MigrateProductImagesAsync(IServiceProvider sp, ILogger log, bool dryRun, int batch)
{
    using IServiceScope scope = sp.CreateScope();
    AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    IBlobStorage blobs = scope.ServiceProvider.GetRequiredService<IBlobStorage>();

    int migrated = 0;
    int skipped = 0;
    int failed = 0;

    while (true)
    {
        List<Product> rows = await db.Products
            .Where(p => p.ImageBlobKey == null && p.ImageBase64 != null)
            .OrderBy(p => p.Id)
            .Take(batch)
            .ToListAsync();

        if (rows.Count == 0)
        {
            break;
        }

        foreach (Product row in rows)
        {
            try
            {
                (byte[] bytes, string contentType) = DecodeBase64WithMime(row.ImageBase64!);
                if (bytes.Length == 0)
                {
                    skipped++;
                    continue;
                }

                if (!dryRun)
                {
                    using MemoryStream ms = new(bytes);
                    BlobRef uploaded = await blobs.UploadAsync(
                        "products",
                        row.UserId,
                        ms,
                        contentType,
                        ExtensionFor(contentType));
                    row.ImageBlobKey = uploaded.Key;
                    row.ImageContentType = contentType;
                }

                migrated++;
            }
            catch (Exception ex)
            {
                failed++;
                log.LogWarning(ex, "Product {Id} failed to migrate", row.Id);
            }
        }

        if (!dryRun)
        {
            await db.SaveChangesAsync();
        }

        log.LogInformation(
            "products: batch processed | migrated={Migrated} failed={Failed} skipped={Skipped}",
            migrated,
            failed,
            skipped);
    }

    log.LogInformation(
        "products done | migrated={Migrated} skipped={Skipped} failed={Failed}",
        migrated,
        skipped,
        failed);
}

static async Task MigrateGalleryImagesAsync(IServiceProvider sp, ILogger log, bool dryRun, int batch)
{
    using IServiceScope scope = sp.CreateScope();
    AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    IBlobStorage blobs = scope.ServiceProvider.GetRequiredService<IBlobStorage>();

    int migrated = 0;
    int skipped = 0;
    int failed = 0;

    while (true)
    {
        List<GeneratedImage> rows = await db.GeneratedImages
            .Where(g => g.ImageBlobKey == null && g.ImageBase64 != null)
            .OrderBy(g => g.Id)
            .Take(batch)
            .ToListAsync();

        if (rows.Count == 0)
        {
            break;
        }

        foreach (GeneratedImage row in rows)
        {
            try
            {
                (byte[] bytes, string contentType) = DecodeBase64WithMime(row.ImageBase64!, fallback: row.MimeType);
                if (bytes.Length == 0)
                {
                    skipped++;
                    continue;
                }

                if (!dryRun)
                {
                    using MemoryStream ms = new(bytes);
                    BlobRef uploaded = await blobs.UploadAsync(
                        "gallery",
                        row.UserId,
                        ms,
                        contentType,
                        ExtensionFor(contentType));
                    row.ImageBlobKey = uploaded.Key;
                }

                migrated++;
            }
            catch (Exception ex)
            {
                failed++;
                log.LogWarning(ex, "GeneratedImage {Id} failed to migrate", row.Id);
            }
        }

        if (!dryRun)
        {
            await db.SaveChangesAsync();
        }

        log.LogInformation(
            "gallery: batch processed | migrated={Migrated} failed={Failed} skipped={Skipped}",
            migrated,
            failed,
            skipped);
    }

    log.LogInformation(
        "gallery done | migrated={Migrated} skipped={Skipped} failed={Failed}",
        migrated,
        skipped,
        failed);
}

static async Task MigrateReferenceImagesAsync(IServiceProvider sp, ILogger log, bool dryRun, int batch)
{
    using IServiceScope scope = sp.CreateScope();
    AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    IBlobStorage blobs = scope.ServiceProvider.GetRequiredService<IBlobStorage>();

    int migrated = 0;
    int skipped = 0;
    int failed = 0;

    while (true)
    {
        List<ReferenceImage> rows = await db.ReferenceImages
            .Where(r => r.ImageBlobKey == null && r.ImageBase64 != null)
            .OrderBy(r => r.Id)
            .Take(batch)
            .ToListAsync();

        if (rows.Count == 0)
        {
            break;
        }

        foreach (ReferenceImage row in rows)
        {
            try
            {
                (byte[] bytes, string contentType) = DecodeBase64WithMime(row.ImageBase64!);
                if (bytes.Length == 0)
                {
                    skipped++;
                    continue;
                }

                if (!dryRun)
                {
                    using MemoryStream ms = new(bytes);
                    BlobRef uploaded = await blobs.UploadAsync(
                        "references",
                        row.CategoryId?.ToString("N") ?? "uncategorized",
                        ms,
                        contentType,
                        ExtensionFor(contentType));
                    row.ImageBlobKey = uploaded.Key;
                }

                migrated++;
            }
            catch (Exception ex)
            {
                failed++;
                log.LogWarning(ex, "ReferenceImage {Id} failed to migrate", row.Id);
            }
        }

        if (!dryRun)
        {
            await db.SaveChangesAsync();
        }

        log.LogInformation(
            "references: batch processed | migrated={Migrated} failed={Failed} skipped={Skipped}",
            migrated,
            failed,
            skipped);
    }

    log.LogInformation(
        "references done | migrated={Migrated} skipped={Skipped} failed={Failed}",
        migrated,
        skipped,
        failed);
}

static async Task MigratePrintJobsAsync(IServiceProvider sp, ILogger log, bool dryRun, int batch)
{
    using IServiceScope scope = sp.CreateScope();
    AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    IBlobStorage blobs = scope.ServiceProvider.GetRequiredService<IBlobStorage>();

    int migrated = 0;
    int skipped = 0;
    int failed = 0;

    while (true)
    {
        List<PrintJob> rows = await db.PrintJobs
            .Where(p => p.PdfBlobKey == null && p.PdfBase64 != null)
            .OrderBy(p => p.Id)
            .Take(batch)
            .ToListAsync();

        if (rows.Count == 0)
        {
            break;
        }

        foreach (PrintJob row in rows)
        {
            try
            {
                byte[] bytes = Convert.FromBase64String(row.PdfBase64!);
                if (bytes.Length == 0)
                {
                    skipped++;
                    continue;
                }

                if (!dryRun)
                {
                    using MemoryStream ms = new(bytes);
                    BlobRef uploaded = await blobs.UploadAsync(
                        "prints",
                        row.UserId,
                        ms,
                        "application/pdf",
                        ".pdf");
                    row.PdfBlobKey = uploaded.Key;
                }

                migrated++;
            }
            catch (Exception ex)
            {
                failed++;
                log.LogWarning(ex, "PrintJob {Id} failed to migrate", row.Id);
            }
        }

        if (!dryRun)
        {
            await db.SaveChangesAsync();
        }

        log.LogInformation(
            "prints: batch processed | migrated={Migrated} failed={Failed} skipped={Skipped}",
            migrated,
            failed,
            skipped);
    }

    log.LogInformation(
        "prints done | migrated={Migrated} skipped={Skipped} failed={Failed}",
        migrated,
        skipped,
        failed);
}

// Strips an optional `data:image/...;base64,` prefix and decodes the bytes.
// Returns the raw bytes plus the MIME type (extracted from the prefix when
// present, otherwise sniffed from magic bytes, otherwise the supplied
// fallback, otherwise `application/octet-stream`).
static (byte[] Bytes, string ContentType) DecodeBase64WithMime(string raw, string? fallback = null)
{
    string contentType = fallback ?? "application/octet-stream";
    string payload = raw;
    const string prefix = "data:";
    if (payload.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
    {
        int comma = payload.IndexOf(',', StringComparison.Ordinal);
        if (comma > prefix.Length)
        {
            string header = payload[prefix.Length..comma];
            int semi = header.IndexOf(';', StringComparison.Ordinal);
            contentType = semi > 0 ? header[..semi] : header;
            payload = payload[(comma + 1)..];
        }
    }

    byte[] bytes = Convert.FromBase64String(payload);
    if (contentType == "application/octet-stream" || string.IsNullOrEmpty(contentType))
    {
        contentType = SniffContentType(bytes);
    }

    return (bytes, contentType);
}

static string SniffContentType(byte[] bytes)
{
    if (bytes.Length >= 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47)
    {
        return "image/png";
    }

    if (bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
    {
        return "image/jpeg";
    }

    if (bytes.Length >= 4 && bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46)
    {
        return "application/pdf";
    }

    return "application/octet-stream";
}

static string ExtensionFor(string contentType) =>
    contentType.ToLowerInvariant() switch
    {
        "image/png" => ".png",
        "image/jpeg" or "image/jpg" => ".jpg",
        "image/webp" => ".webp",
        "image/gif" => ".gif",
        "application/pdf" => ".pdf",
        _ => ".bin",
    };

static string FindRepoRoot()
{
    string dir = AppContext.BaseDirectory;
    while (dir is not null)
    {
        if (Directory.Exists(Path.Combine(dir, ".git")))
        {
            return dir;
        }

        DirectoryInfo? parent = Directory.GetParent(dir);
        if (parent is null)
        {
            return AppContext.BaseDirectory;
        }

        dir = parent.FullName;
    }

    return AppContext.BaseDirectory;
}
