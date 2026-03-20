using System.Text;
using Google.GenAI;
using Google.GenAI.Types;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SemanticKernelBackend.Auth;
using SemanticKernelBackend.Data;
using SemanticKernelBackend.Models;

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

builder.Services.AddAuthorization();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

var googleApiKey = app.Configuration["Google:ApiKey"]
    ?? throw new InvalidOperationException("Google:ApiKey is not configured.");

app.MapGet("/hello", () => new { message = "Hello World" })
   .WithName("GetHello");

app.MapAuthEndpoints();

app.MapPost("/generate-image", async (ImageGenerationRequest request, ILogger<Program> logger) =>
{
    if (string.IsNullOrWhiteSpace(request.Prompt))
    {
        return Results.BadRequest(new { error = "Prompt must not be empty." });
    }

    var client = new Client(apiKey: googleApiKey);

    var contents = new List<Content>
    {
        new Content
        {
            Role = "user",
            Parts = new List<Part>
            {
                new Part { Text = request.Prompt },
            },
        },
    };

    var config = new GenerateContentConfig
    {
        ResponseModalities = new List<string> { "IMAGE", "TEXT" },
    };

    byte[]? imageData = null;
    string mimeType = "image/png";

    try
    {
        await foreach (var chunk in client.Models.GenerateContentStreamAsync("gemini-3-pro-image-preview", contents, config))
        {
            if (chunk.Candidates == null || chunk.Candidates.Count == 0 ||
                chunk.Candidates[0].Content?.Parts == null)
            {
                continue;
            }

            var part = chunk.Candidates[0].Content.Parts[0];
            if (part.InlineData?.Data != null)
            {
                imageData = part.InlineData!.Data;
                mimeType = part.InlineData.MimeType ?? "image/png";
                break;
            }
        }
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Google GenAI image generation failed.");
        return Results.Problem("Image generation failed.", statusCode: 502);
    }

    if (imageData is null)
    {
        return Results.Problem("No image returned from generation service.", statusCode: 502);
    }

    return Results.Ok(new
    {
        imageBase64 = Convert.ToBase64String(imageData),
        mimeType,
    });
})
.WithName("GenerateImage")
.RequireAuthorization();

app.Run();

public partial class Program
{
}

internal record ImageGenerationRequest(string Prompt);
