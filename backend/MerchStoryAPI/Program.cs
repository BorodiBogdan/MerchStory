using System.Text;
using MerchStoryAPI.Auth;
using MerchStoryAPI.Data;
using MerchStoryAPI.Gallery;
using MerchStoryAPI.Geocoding;
using MerchStoryAPI.ImageGeneration;
using MerchStoryAPI.Models;
using MerchStoryAPI.Print;
using MerchStoryAPI.Products;
using MerchStoryAPI.Recommendations;
using MerchStoryAPI.ReferenceImages;
using MerchStoryAPI.Shop;
using MerchStoryAPI.Wallet;
using MerchStoryImageGeneration.Extensions;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

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
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy => policy.RequireClaim("is_admin", "true"));
});
builder.Services.AddHostedService<RefreshTokenCleanupService>();
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
