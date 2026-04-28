using MerchStoryAPI.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace MerchStoryAPI.Data;

public class AppDbContext : IdentityDbContext<AppUser>
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public DbSet<RefreshToken> RefreshTokens => this.Set<RefreshToken>();

    public DbSet<ShopProfile> ShopProfiles => this.Set<ShopProfile>();

    public DbSet<GeneratedImage> GeneratedImages => this.Set<GeneratedImage>();

    public DbSet<Product> Products => this.Set<Product>();

    public DbSet<SocialPost> SocialPosts => this.Set<SocialPost>();

    public DbSet<ReferenceImage> ReferenceImages => this.Set<ReferenceImage>();

    public DbSet<Category> Categories => this.Set<Category>();

    public DbSet<DailyRecommendation> DailyRecommendations => this.Set<DailyRecommendation>();

    public DbSet<Holiday> Holidays => this.Set<Holiday>();

    public DbSet<PromoPlaybookEntry> PromoPlaybookEntries => this.Set<PromoPlaybookEntry>();

    public DbSet<IdeaEmbedding> IdeaEmbeddings => this.Set<IdeaEmbedding>();

    public DbSet<IdeaInteraction> IdeaInteractions => this.Set<IdeaInteraction>();

    public DbSet<CoinTransaction> CoinTransactions => this.Set<CoinTransaction>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        bool isRelational = this.Database.ProviderName != "Microsoft.EntityFrameworkCore.InMemory";

        if (isRelational)
        {
            builder.HasPostgresExtension("vector");
        }

        builder.Entity<RefreshToken>(entity =>
        {
            entity.HasKey(rt => rt.Id);

            entity.Property(rt => rt.Token)
                  .HasMaxLength(512)
                  .IsRequired();

            entity.HasIndex(rt => rt.Token)
                  .IsUnique();

            entity.HasIndex(rt => rt.UserId);

            entity.HasOne(rt => rt.User)
                  .WithMany()
                  .HasForeignKey(rt => rt.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<ShopProfile>(entity =>
        {
            entity.HasKey(s => s.Id);

            entity.Property(s => s.BrandName).HasMaxLength(100).IsRequired();
            entity.Property(s => s.LogoBase64).HasColumnType("text");
            entity.Property(s => s.BrandColorsJson).HasColumnType("text").IsRequired();
            entity.Property(s => s.Slogan).HasMaxLength(200);
            entity.Property(s => s.BusinessDomain).HasMaxLength(30).IsRequired();
            entity.Property(s => s.OtherDomain).HasMaxLength(100);
            entity.Property(s => s.TargetAudience).HasMaxLength(300);
            entity.Property(s => s.ShopType).HasMaxLength(30);
            entity.Property(s => s.Competitors).HasMaxLength(500);
            entity.Property(s => s.City).HasMaxLength(100);
            entity.Property(s => s.CountryCode).HasMaxLength(2).IsRequired();

            entity.HasIndex(s => s.UserId).IsUnique();

            entity.HasOne(s => s.User)
                  .WithOne(u => u.ShopProfile)
                  .HasForeignKey<ShopProfile>(s => s.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<GeneratedImage>(entity =>
        {
            entity.HasKey(g => g.Id);

            entity.Property(g => g.ImageBase64).HasColumnType("text").IsRequired();
            entity.Property(g => g.MimeType).HasMaxLength(50).IsRequired();

            entity.HasIndex(g => g.UserId);

            entity.HasOne(g => g.User)
                  .WithMany()
                  .HasForeignKey(g => g.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Product>(entity =>
        {
            entity.HasKey(p => p.Id);

            entity.Property(p => p.Name).HasMaxLength(200).IsRequired();
            entity.Property(p => p.Price).HasColumnType("numeric(18,2)").IsRequired();
            entity.Property(p => p.ImageBase64).HasColumnType("text");
            entity.Property(p => p.Category).HasMaxLength(100);

            entity.HasIndex(p => p.UserId);
            entity.HasIndex(p => new { p.UserId, p.Category });

            entity.HasOne(p => p.User)
                  .WithMany()
                  .HasForeignKey(p => p.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<SocialPost>(entity =>
        {
            entity.HasKey(sp => sp.Id);

            entity.Property(sp => sp.Platform).HasMaxLength(30).IsRequired();
            entity.Property(sp => sp.ExternalAccountId).IsRequired();
            entity.Property(sp => sp.PlatformPostId).IsRequired();
            entity.Property(sp => sp.SourceUrl).HasColumnType("text");
            entity.Property(sp => sp.Caption).HasColumnType("text");
            entity.Property(sp => sp.CommentsJson).HasColumnType("text").IsRequired();

            entity.HasIndex(sp => new { sp.UserId, sp.Platform, sp.ExternalAccountId });
            entity.HasIndex(sp => new { sp.UserId, sp.Platform, sp.ExternalAccountId, sp.PlatformPostId })
                  .IsUnique();

            entity.HasOne(sp => sp.User)
                  .WithMany()
                  .HasForeignKey(sp => sp.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<ReferenceImage>(entity =>
        {
            entity.HasKey(r => r.Id);
            entity.Property(r => r.Name).HasMaxLength(200).IsRequired();
            entity.Property(r => r.ImageBase64).HasColumnType("text").IsRequired();

            entity.HasOne(r => r.Category)
                  .WithMany()
                  .HasForeignKey(r => r.CategoryId)
                  .OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(r => r.CategoryId);

            if (isRelational)
            {
                entity.Property(r => r.Embedding).HasColumnType("vector(512)").IsRequired();
                entity.HasIndex(r => r.Embedding)
                      .HasMethod("hnsw")
                      .HasOperators("vector_cosine_ops")
                      .HasStorageParameter("m", 16)
                      .HasStorageParameter("ef_construction", 64);
            }
            else
            {
                entity.Ignore(r => r.Embedding);
            }
        });

        builder.Entity<Category>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.Property(c => c.Name).HasMaxLength(150).IsRequired();

            entity.HasOne(c => c.ParentCategory)
                  .WithMany(c => c.Children)
                  .HasForeignKey(c => c.ParentCategoryId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(c => new { c.ParentCategoryId, c.Name }).IsUnique();
        });

        builder.Entity<DailyRecommendation>(entity =>
        {
            entity.HasKey(r => r.Id);

            entity.Property(r => r.ContextSnapshotJson).HasColumnType("text").IsRequired();
            entity.Property(r => r.IdeasJson).HasColumnType("text").IsRequired();

            entity.HasIndex(r => new { r.UserId, r.GeneratedAtUtc })
                  .IsDescending(false, true);

            entity.HasOne(r => r.User)
                  .WithMany()
                  .HasForeignKey(r => r.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Holiday>(entity =>
        {
            entity.HasKey(h => h.Id);

            entity.Property(h => h.CountryCode).HasMaxLength(2).IsRequired();
            entity.Property(h => h.LocalName).HasMaxLength(200).IsRequired();
            entity.Property(h => h.Name).HasMaxLength(200).IsRequired();

            entity.HasIndex(h => new { h.CountryCode, h.Year, h.Date })
                  .IsUnique();
        });

        builder.Entity<PromoPlaybookEntry>(entity =>
        {
            entity.HasKey(p => p.Id);

            entity.Property(p => p.BusinessDomain).HasMaxLength(30).IsRequired();
            entity.Property(p => p.Theme).HasMaxLength(200).IsRequired();
            entity.Property(p => p.TriggerType).HasMaxLength(30).IsRequired();
            entity.Property(p => p.Trigger).HasColumnType("text").IsRequired();
            entity.Property(p => p.Tactics).HasColumnType("text").IsRequired();
            entity.Property(p => p.ExampleCopy).HasColumnType("text").IsRequired();

            // Pre-filter index for per-domain RAG retrieval.
            entity.HasIndex(p => p.BusinessDomain);

            // Idempotent on (Domain, Theme) so the data-ingestion CLI can re-run safely.
            entity.HasIndex(p => new { p.BusinessDomain, p.Theme })
                  .IsUnique();

            if (isRelational)
            {
                entity.Property(p => p.Embedding).HasColumnType("vector(768)").IsRequired();
                entity.HasIndex(p => p.Embedding)
                      .HasMethod("hnsw")
                      .HasOperators("vector_cosine_ops")
                      .HasStorageParameter("m", 16)
                      .HasStorageParameter("ef_construction", 64);
            }
            else
            {
                entity.Ignore(p => p.Embedding);
            }
        });

        builder.Entity<IdeaEmbedding>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.Property(e => e.IdeaId).HasMaxLength(100).IsRequired();
            entity.Property(e => e.Title).HasMaxLength(300).IsRequired();
            entity.Property(e => e.Body).HasColumnType("text").IsRequired();

            entity.HasIndex(e => new { e.UserId, e.GeneratedAtUtc })
                  .IsDescending(false, true);

            entity.HasOne(e => e.User)
                  .WithMany()
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            if (isRelational)
            {
                entity.Property(e => e.Embedding).HasColumnType("vector(768)").IsRequired();
                entity.HasIndex(e => e.Embedding)
                      .HasMethod("hnsw")
                      .HasOperators("vector_cosine_ops")
                      .HasStorageParameter("m", 16)
                      .HasStorageParameter("ef_construction", 64);
            }
            else
            {
                entity.Ignore(e => e.Embedding);
            }
        });

        builder.Entity<IdeaInteraction>(entity =>
        {
            entity.HasKey(i => i.Id);

            entity.Property(i => i.IdeaId).HasMaxLength(100).IsRequired();
            entity.Property(i => i.Action).HasMaxLength(30).IsRequired();

            // Common query: "what feedback did this user give for this rec?"
            entity.HasIndex(i => new { i.UserId, i.DailyRecommendationId });

            // For future fine-tuning corpus extraction.
            entity.HasIndex(i => i.Action);

            entity.HasOne(i => i.User)
                  .WithMany()
                  .HasForeignKey(i => i.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<CoinTransaction>(entity =>
        {
            entity.HasKey(t => t.Id);

            entity.HasIndex(t => new { t.UserId, t.CreatedAt })
                  .IsDescending(false, true);

            entity.HasOne(t => t.User)
                  .WithMany(u => u.CoinTransactions)
                  .HasForeignKey(t => t.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(t => t.RelatedGeneratedImage)
                  .WithMany()
                  .HasForeignKey(t => t.RelatedGeneratedImageId)
                  .OnDelete(DeleteBehavior.SetNull);
        });
    }
}
