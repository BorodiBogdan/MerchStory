using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Azure.Identity;
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

// Layer Azure Key Vault on top of the standard configuration providers when a vault
// URI is configured. In Azure the Container App's system-assigned managed identity
// authenticates; locally devs use az login (DefaultAzureCredential picks it up). When
// KeyVault:Uri is empty (e.g. local dev with user-secrets) this is a no-op.
string? keyVaultUri = builder.Configuration["KeyVault:Uri"];
if (!string.IsNullOrEmpty(keyVaultUri))
{
    builder.Configuration.AddAzureKeyVault(new Uri(keyVaultUri), new DefaultAzureCredential());
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
builder.Services.AddHttpClient<ILLMService, ClaudeLlmService>();
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
// it as a render failure (and refunds the coin charge).
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
app.MapWalletEndpoints();
app.MapPrintEndpoints();

app.Run();

public partial class Program
{
}
