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
            entity.Property(s => s.PrimaryColor).HasMaxLength(7);
            entity.Property(s => s.SecondaryColor).HasMaxLength(7);
            entity.Property(s => s.AccentColor).HasMaxLength(7);
            entity.Property(s => s.Slogan).HasMaxLength(200);
            entity.Property(s => s.BusinessDomain).HasMaxLength(30).IsRequired();
            entity.Property(s => s.TargetAudience).HasMaxLength(300).IsRequired();
            entity.Property(s => s.Atmosphere).HasMaxLength(30);
            entity.Property(s => s.ShopType).HasMaxLength(30).IsRequired();
            entity.Property(s => s.Competitors).HasMaxLength(500);

            entity.HasIndex(s => s.UserId).IsUnique();

            entity.HasOne(s => s.User)
                  .WithOne(u => u.ShopProfile)
                  .HasForeignKey<ShopProfile>(s => s.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
