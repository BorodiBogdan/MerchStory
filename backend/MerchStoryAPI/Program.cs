using System.Security.Claims;
using System.Text;
using MerchStoryAPI.Auth;
using MerchStoryAPI.Data;
using MerchStoryAPI.Facebook;
using MerchStoryAPI.Gallery;
using MerchStoryAPI.Models;
using MerchStoryAPI.Products;
using MerchStoryAPI.Shop;
using MerchStoryImageGeneration.Extensions;
using MerchStoryImageGeneration.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

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
builder.Services.AddAuthorization();
builder.Services.AddHostedService<RefreshTokenCleanupService>();
builder.Services.AddMerchStoryImageGeneration();

var app = builder.Build();

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
app.MapFacebookEndpoints();

app.MapPost("/generate-image", async (
    ImageGenerationRequest request,
    ClaimsPrincipal principal,
    IImageGenerationService imageService,
    AppDbContext db,
    ILogger<Program> logger) =>
{
    if (string.IsNullOrWhiteSpace(request.Prompt))
    {
        return Results.BadRequest(new { error = "Prompt must not be empty." });
    }

    try
    {
        var result = await imageService.GenerateImageAsync(request.Prompt);
        string base64 = Convert.ToBase64String(result.ImageData);

        string? userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                      ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

        if (userId is not null)
        {
            db.GeneratedImages.Add(new GeneratedImage
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                ImageBase64 = base64,
                MimeType = result.MimeType,
                CreatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        return Results.Ok(new { imageBase64 = base64, mimeType = result.MimeType });
    }
    catch (InvalidOperationException ex) when (ex.Message.Contains("not configured", StringComparison.OrdinalIgnoreCase))
    {
        logger.LogError("{Message}", ex.Message);
        return Results.Problem("Image generation is not configured.", statusCode: 503);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Image generation failed.");
        return Results.Problem("Image generation failed.", statusCode: 502);
    }
})
.WithName("GenerateImage")
.RequireAuthorization();

app.Run();

public partial class Program
{
}

internal sealed record ImageGenerationRequest(string Prompt);
