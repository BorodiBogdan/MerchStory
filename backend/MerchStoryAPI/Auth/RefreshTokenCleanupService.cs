using MerchStoryAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace MerchStoryAPI.Auth;

public class RefreshTokenCleanupService : BackgroundService
{
    private readonly IServiceScopeFactory scopeFactory;
    private readonly ILogger<RefreshTokenCleanupService> logger;

    public RefreshTokenCleanupService(
        IServiceScopeFactory scopeFactory,
        ILogger<RefreshTokenCleanupService> logger)
    {
        this.scopeFactory = scopeFactory;
        this.logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromHours(6), stoppingToken);

            using var scope = this.scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var cutoff = DateTime.UtcNow;
            var deleted = await db.RefreshTokens
                .Where(rt => rt.ExpiresAt <= cutoff || rt.IsRevoked)
                .ExecuteDeleteAsync(stoppingToken);
        }
    }
}
