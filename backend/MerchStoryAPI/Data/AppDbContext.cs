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

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

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

            entity.HasIndex(p => p.UserId);

            entity.HasOne(p => p.User)
                  .WithMany()
                  .HasForeignKey(p => p.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
