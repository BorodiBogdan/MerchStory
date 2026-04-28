using System.Security.Cryptography;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using Microsoft.EntityFrameworkCore;

namespace MerchStoryAPI.Print;

public class QrLinkService
{
    private const string SlugAlphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private const int SlugLength = 8;

    private readonly AppDbContext db;

    public QrLinkService(AppDbContext db)
    {
        this.db = db;
    }

    public async Task<PrintLink> CreateAsync(string ownerUserId, string targetUrl, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(targetUrl))
        {
            throw new ArgumentException("Target URL is required.", nameof(targetUrl));
        }

        if (!Uri.TryCreate(targetUrl, UriKind.Absolute, out _))
        {
            throw new ArgumentException("Target URL must be absolute (include scheme).", nameof(targetUrl));
        }

        // Retry on slug collision — 8 chars from a 56-symbol alphabet is ~10^14 keys,
        // so collisions are extremely unlikely but the DB unique constraint is the
        // source of truth.
        for (int attempt = 0; attempt < 5; attempt++)
        {
            string slug = GenerateSlug();
            bool taken = await this.db.PrintLinks.AnyAsync(l => l.Slug == slug, ct);
            if (taken)
            {
                continue;
            }

            PrintLink link = new()
            {
                Id = Guid.NewGuid(),
                OwnerUserId = ownerUserId,
                Slug = slug,
                TargetUrl = targetUrl,
                HitCount = 0,
                CreatedAt = DateTime.UtcNow,
            };
            this.db.PrintLinks.Add(link);
            await this.db.SaveChangesAsync(ct);
            return link;
        }

        throw new InvalidOperationException("Failed to allocate a unique slug after 5 attempts.");
    }

    public async Task<PrintLink?> ResolveAsync(string slug, CancellationToken ct = default)
    {
        PrintLink? link = await this.db.PrintLinks.SingleOrDefaultAsync(l => l.Slug == slug, ct);
        if (link is null)
        {
            return null;
        }

        link.HitCount += 1;
        await this.db.SaveChangesAsync(ct);
        return link;
    }

    private static string GenerateSlug()
    {
        Span<byte> buffer = stackalloc byte[SlugLength];
        RandomNumberGenerator.Fill(buffer);
        Span<char> chars = stackalloc char[SlugLength];
        for (int i = 0; i < SlugLength; i++)
        {
            chars[i] = SlugAlphabet[buffer[i] % SlugAlphabet.Length];
        }

        return new string(chars);
    }
}
