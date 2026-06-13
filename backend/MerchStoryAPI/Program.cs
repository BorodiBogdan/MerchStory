using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Azure.Identity;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using MerchStoryAPI.Auth;
using MerchStoryAPI.Data;
using MerchStoryAPI.Gallery;
using MerchStoryAPI.Geocoding;
using MerchStoryAPI.ImageGeneration;
using MerchStoryAPI.LlmServices;
using MerchStoryAPI.Models;
using MerchStoryAPI.Print;
using MerchStoryAPI.Products;
using MerchStoryAPI.Recommendations;
using MerchStoryAPI.ReferenceImages;
using MerchStoryAPI.Shop;
using MerchStoryAPI.Storage;
using MerchStoryAPI.Wallet;
using MerchStoryImageGeneration.Extensions;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Layer Azure Key Vault into the configuration chain. In Azure the Container App's
// system-assigned managed identity authenticates; locally devs use az login (picked
// up by DefaultAzureCredential). When KeyVault:Uri is empty this is a no-op.
//
// AddAzureKeyVault appends KV to the END of the source list, which would make KV
// override appsettings.Development.json and env vars — exactly the opposite of what
// we want. KV should provide production-grade defaults; local dev files and env
// vars must win when present. So we re-layer the higher-priority sources after KV.
// Tests run in the "Testing" environment and must stay fully offline (mocks only).
// AddAzureKeyVault authenticates while configuration is being built, before any
// WebApplicationFactory override can run, so it's the one integration the test
// host can't mock away — skip it explicitly so tests never reach DefaultAzureCredential.
string? keyVaultUri = builder.Configuration["KeyVault:Uri"];
if (!string.IsNullOrEmpty(keyVaultUri) && !builder.Environment.IsEnvironment("Testing"))
{
    builder.Configuration.AddAzureKeyVault(new Uri(keyVaultUri), new DefaultAzureCredential());

    // Re-add the dev-specific JSON file, user-secrets, and env vars on top of KV so
    // they override KV values. Without this, e.g. ConnectionStrings:DefaultConnection
    // in appsettings.Development.json would be silently shadowed by the prod value
    // in KV.
    builder.Configuration.AddJsonFile(
        $"appsettings.{builder.Environment.EnvironmentName}.json",
        optional: true,
        reloadOnChange: true);

    if (builder.Environment.IsDevelopment())
    {
        builder.Configuration.AddUserSecrets<Program>(optional: true);
    }

    builder.Configuration.AddEnvironmentVariables();
}

// Application telemetry. When ApplicationInsights:ConnectionString is set (Key Vault
// in prod, secret name ApplicationInsights--ConnectionString), ship requests,
// dependencies, exceptions, ILogger logs, and runtime metrics to Azure Monitor /
// Application Insights. An empty string is a no-op, so local dev and the offline
// Testing environment never reach out to Azure — same guard shape as the Key Vault
// block above.
string? appInsightsConnectionString = builder.Configuration["ApplicationInsights:ConnectionString"];
if (!string.IsNullOrEmpty(appInsightsConnectionString) && !builder.Environment.IsEnvironment("Testing"))
{
    builder.Services.AddOpenTelemetry()
        .UseAzureMonitor(options => options.ConnectionString = appInsightsConnectionString)

        // Semantic Kernel emits its own traces/metrics; capture them so AI calls show up.
        .WithTracing(tracing => tracing.AddSource("Microsoft.SemanticKernel*"))
        .WithMetrics(metrics => metrics.AddMeter("Microsoft.SemanticKernel*"));
}

// Allow large multipart uploads (admin zip-import endpoint can receive up to ~500MB).
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 500_000_000;
});

builder.Services.AddOpenApi();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        if (builder.Environment.IsDevelopment())
        {
            policy.AllowAnyOrigin()
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        }
        else
        {
            string? allowedOrigin = builder.Configuration["AllowedOrigins:Web"];
            if (!string.IsNullOrEmpty(allowedOrigin))
            {
                policy.WithOrigins(allowedOrigin)
                      .AllowAnyHeader()
                      .AllowAnyMethod();
            }
        }
    });
});

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        o => o.UseVector()));

builder.Services.AddIdentity<AppUser, IdentityRole>()
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

builder.Services.AddScoped<JwtService>();

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidAudience = builder.Configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!)),
    };
});

builder.Services.AddHttpClient();
builder.Services.AddHttpClient<IOPaintClient>();

// Composite-judge backend. Claude (default) stays on the native Anthropic
// Messages API via Anthropic:*; "Local" routes the judge through Semantic
// Kernel to the OpenAI-compatible endpoint in LlmJudge:Local:* (e.g. a
// vision-capable Gemma in LM Studio) — same split the recommendation
// pipeline uses for its chat backends.
string judgeBackend = builder.Configuration["LlmJudge:Backend"] ?? "Claude";
if (string.Equals(judgeBackend, "Claude", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddHttpClient<ILLMService, ClaudeLlmService>();
}
else
{
    // Singleton: the service owns its kernel + HttpClient, like the
    // recommendation chat services.
    builder.Services.AddSingleton<ILLMService, OpenAiCompatibleLlmService>();
}

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy => policy.RequireClaim("is_admin", "true"));
});

// Per-user rate limit for paid AI endpoints. Partition by JWT subject so one user
// can't drain Gemini quota with a fan-out attack from a single token. The IP
// fallback only matters for misconfigured/anonymous routes — every generation
// route requires auth, so userId is the real partition key.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddPolicy("generation-per-user", httpContext =>
    {
        string partitionKey = httpContext.User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? httpContext.User.FindFirstValue("sub")
            ?? httpContext.Connection.RemoteIpAddress?.ToString()
            ?? "anonymous";

        return RateLimitPartition.GetFixedWindowLimiter(partitionKey, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5,
            Window = TimeSpan.FromSeconds(10),
            QueueLimit = 0,
        });
    });
});

builder.Services.AddHostedService<RefreshTokenCleanupService>();

// Blob storage. A single Azure container holds all user images and PDFs.
// BlobServiceClientFactory branches on configuration: connection string for
// Azurite/legacy, DefaultAzureCredential for Managed Identity. The
// UserDelegationKeyProvider is only needed in the MI path (it's what mints
// SAS tokens when there's no account key); when Azure:BlobServiceUri is unset
// we don't register it and AzureBlobStorage falls back to account-key SAS.
// Tests substitute an in-memory IBlobStorage that keeps bytes in a dictionary.
builder.Services.Configure<BlobStorageOptions>(builder.Configuration.GetSection("Storage"));
builder.Services.AddSingleton(_ => BlobServiceClientFactory.Create(builder.Configuration));
if (!string.IsNullOrEmpty(builder.Configuration["Azure:BlobServiceUri"]))
{
    builder.Services.AddSingleton<UserDelegationKeyProvider>();
}

builder.Services.AddSingleton<IBlobStorage, AzureBlobStorage>();

builder.Services.AddMerchStoryImageGeneration(builder.Configuration);
builder.Services.AddMerchStoryRecommendations(builder.Configuration);
builder.Services.AddSingleton<IClipEmbeddingService, ClipEmbeddingService>();
builder.Services.AddScoped<IGeocodingService, NominatimGeocodingService>();

// Recommendation context providers. Each provider gathers signals
// from one external source; ContextAggregator runs them in parallel with
// per-provider failure isolation. Adding a new source = AddScoped + new file,
// no other wiring needed.
builder.Services.AddScoped<MerchStoryAPI.Recommendations.Context.HolidayCache>();
builder.Services.AddScoped<MerchStoryAPI.Recommendations.Context.IContextProvider, MerchStoryAPI.Recommendations.Context.WeatherContextProvider>();
builder.Services.AddScoped<MerchStoryAPI.Recommendations.Context.IContextProvider, MerchStoryAPI.Recommendations.Context.HolidayContextProvider>();
builder.Services.AddScoped<MerchStoryAPI.Recommendations.Context.IContextProvider, MerchStoryAPI.Recommendations.Context.NewsContextProvider>();
builder.Services.AddScoped<MerchStoryAPI.Recommendations.Context.ContextAggregator>();

// Recommendation job machinery (Phase 3). Orchestrator is scoped (uses DbContext);
// registry + runner are singletons so jobs survive across requests.
builder.Services.AddScoped<RecommendationOrchestrator>();
builder.Services.AddSingleton<RecommendationJobRegistry>();
builder.Services.AddSingleton<RecommendationJobRunner>();

// Phase 5a: PlaybookRetriever wraps embedding + pgvector cosine search over
// the seeded PromoPlaybookEntry table.
builder.Services.AddScoped<PlaybookRetriever>();

// Phase 5b: IdeaEmbeddingService owns both the per-user "DON'T REPEAT"
// retrieval AND the post-generation persistence of fresh idea embeddings.
builder.Services.AddScoped<IdeaEmbeddingService>();

builder.Services.AddScoped<WalletService>();

// Print Shop: PDF export of generated assets sized for paper. Premium tier
// runs through the Real-ESRGAN ONNX upscaler; if the model isn't loaded the
// service throws UpscalerUnavailableException and the route handler surfaces
// it as a render failure (and refunds the credit charge).
builder.Services.AddSingleton<PdfRenderer>();
builder.Services.AddSingleton<IUpscaler, RealEsrganUpscaler>();
builder.Services.AddScoped<QrLinkService>();

var app = builder.Build();

using (IServiceScope scope = app.Services.CreateScope())
{
    AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    if (db.Database.ProviderName != "Microsoft.EntityFrameworkCore.InMemory")
    {
        db.Database.Migrate();
    }
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapAuthEndpoints();
app.MapShopEndpoints();
app.MapGalleryEndpoints();
app.MapProductEndpoints();
app.MapImageGenerationEndpoints();
app.MapReferenceImageEndpoints();
app.MapRecommendationsEndpoints();
app.MapRecommendationsEvalEndpoints();
app.MapWalletEndpoints();
app.MapPrintEndpoints();

app.Run();

public partial class Program
{
}
