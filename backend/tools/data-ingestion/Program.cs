using DataIngestion;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using MerchStoryImageGeneration.Services.Recommendations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Pgvector;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

// Vector-database ingestion CLI. Currently handles one source (PromoPlaybook
// YAMLs). Add new sources as additional sub-commands / methods here rather
// than spawning per-task console projects.
//
// Usage:
//   dotnet run --project backend/tools/data-ingestion -- playbook
//
// Optional positional args:
//   [1] path to playbook root      (default: backend/tools/data-ingestion/playbook)
//   [2] path to API appsettings    (default: backend/MerchStoryAPI/appsettings.Development.json)

string command = args.Length > 0 ? args[0] : "playbook";
string repoRoot = FindRepoRoot();

string defaultPlaybookRoot = Path.Combine(repoRoot, "backend", "tools", "data-ingestion", "playbook");
string defaultAppsettings = Path.Combine(repoRoot, "backend", "MerchStoryAPI", "appsettings.Development.json");

string playbookRoot = args.Length > 1 ? args[1] : defaultPlaybookRoot;
string appsettingsPath = args.Length > 2 ? args[2] : defaultAppsettings;

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
services.AddSingleton<IEmbeddingService, LlmEmbeddingService>();

await using ServiceProvider sp = services.BuildServiceProvider();
ILogger<Program> log = sp.GetRequiredService<ILoggerFactory>().CreateLogger<Program>();

switch (command.ToLowerInvariant())
{
    case "playbook":
        await IngestPlaybookAsync(playbookRoot, sp, log);
        break;
    default:
        log.LogError("Unknown command '{Cmd}'. Supported: playbook", command);
        Environment.Exit(2);
        break;
}

static async Task IngestPlaybookAsync(string playbookRoot, ServiceProvider sp, ILogger log)
{
    if (!Directory.Exists(playbookRoot))
    {
        log.LogError("Playbook root not found: {Path}", playbookRoot);
        Environment.Exit(1);
        return;
    }

    log.LogInformation("Playbook root: {Root}", playbookRoot);

    string[] domainDirs = Directory.GetDirectories(playbookRoot);
    if (domainDirs.Length == 0)
    {
        log.LogWarning("No domain folders found under {Root} — nothing to ingest.", playbookRoot);
        return;
    }

    int totalLoaded = 0;
    foreach (string domainDir in domainDirs)
    {
        string folderName = Path.GetFileName(domainDir);
        if (string.IsNullOrEmpty(folderName))
        {
            continue;
        }

        // Folder name → BusinessDomain enum value (capitalized first letter to
        // match ShopProfile.BusinessDomain values: market → Market).
        string domain = char.ToUpperInvariant(folderName[0]) + folderName[1..].ToLowerInvariant();

        string[] yamlFiles = Directory.GetFiles(domainDir, "*.yaml")
            .Concat(Directory.GetFiles(domainDir, "*.yml"))
            .ToArray();

        if (yamlFiles.Length == 0)
        {
            log.LogInformation("Skipping {Domain}: no YAML files under {Path}", domain, domainDir);
            continue;
        }

        foreach (string yamlFile in yamlFiles)
        {
            int loaded = await SeedFileAsync(yamlFile, domain, sp, log);
            totalLoaded += loaded;
        }
    }

    log.LogInformation("Ingest complete. Upserted {Total} playbook entries.", totalLoaded);
}

static async Task<int> SeedFileAsync(string path, string domain, ServiceProvider sp, ILogger log)
{
    log.LogInformation("Reading {Path}", path);
    string yaml = await File.ReadAllTextAsync(path);

    IDeserializer deserializer = new DeserializerBuilder()
        .WithNamingConvention(CamelCaseNamingConvention.Instance)
        .Build();

    PlaybookYamlEntry[] entries = deserializer.Deserialize<PlaybookYamlEntry[]>(yaml) ?? Array.Empty<PlaybookYamlEntry>();
    if (entries.Length == 0)
    {
        log.LogWarning("File {Path} contained no entries.", path);
        return 0;
    }

    using IServiceScope scope = sp.CreateScope();
    AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    IEmbeddingService embedder = scope.ServiceProvider.GetRequiredService<IEmbeddingService>();

    // Embed in one batch — embedding endpoints accept N inputs at once.
    string[] corpora = entries
        .Select(e => $"{e.Theme}\n\n{e.Trigger}\n\n{e.Tactics}")
        .ToArray();
    IReadOnlyList<float[]> vectors = await embedder.EmbedManyAsync(corpora, CancellationToken.None);

    int loaded = 0;
    for (int i = 0; i < entries.Length; i++)
    {
        PlaybookYamlEntry e = entries[i];

        PromoPlaybookEntry? existing = await db.PromoPlaybookEntries.SingleOrDefaultAsync(p =>
            p.BusinessDomain == domain && p.Theme == e.Theme);

        if (existing is null)
        {
            db.PromoPlaybookEntries.Add(new PromoPlaybookEntry
            {
                Id = Guid.NewGuid(),
                BusinessDomain = domain,
                Theme = e.Theme,
                TriggerType = e.TriggerType,
                Trigger = e.Trigger,
                Tactics = e.Tactics,
                ExampleCopy = e.ExampleCopy,
                Embedding = new Vector(vectors[i]),
                CreatedAt = DateTime.UtcNow,
            });
        }
        else
        {
            existing.TriggerType = e.TriggerType;
            existing.Trigger = e.Trigger;
            existing.Tactics = e.Tactics;
            existing.ExampleCopy = e.ExampleCopy;
            existing.Embedding = new Vector(vectors[i]);
        }

        loaded++;
    }

    await db.SaveChangesAsync();
    log.LogInformation("→ {Domain}/{File}: {Count} entries upserted", domain, Path.GetFileName(path), loaded);
    return loaded;
}

static string FindRepoRoot()
{
    DirectoryInfo? cur = new(AppContext.BaseDirectory);
    while (cur is not null)
    {
        // docker-compose.yml is the most stable repo-root marker in this project.
        if (File.Exists(Path.Combine(cur.FullName, "docker-compose.yml")))
        {
            return cur.FullName;
        }

        cur = cur.Parent;
    }

    // Fallback: cwd. Lets you override paths via positional args if discovery fails.
    return Directory.GetCurrentDirectory();
}
