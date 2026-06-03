using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using Microsoft.EntityFrameworkCore;

namespace MerchStoryAPI.Wallet;

public class WalletService
{
    private readonly AppDbContext db;
    private readonly ILogger<WalletService> logger;

    public WalletService(AppDbContext db, ILogger<WalletService> logger)
    {
        this.db = db;
        this.logger = logger;
    }

    public Task<AppUser?> GetUserAsync(string userId, CancellationToken ct = default) =>
        this.db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);

    public async Task<DeductResult> TryDeductAsync(
        string userId,
        int amount,
        string description,
        Guid? relatedGeneratedImageId,
        CancellationToken ct = default)
    {
        if (amount <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(amount), "Amount must be positive.");
        }

        // Serializable transaction so concurrent deductions cannot oversell when an
        // attacker (or the same user from two clients) fires generation requests in parallel.
        await using var tx = await this.db.Database.BeginTransactionAsync(
            System.Data.IsolationLevel.Serializable, ct);

        AppUser? user = await this.db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return DeductResult.Failure("User not found.");
        }

        if (user.CreditBalance < amount)
        {
            return DeductResult.Failure("Insufficient credits.");
        }

        user.CreditBalance -= amount;

        CreditTransaction txn = new()
        {
            UserId = user.Id,
            Amount = -amount,
            BalanceAfter = user.CreditBalance,
            Description = description,
            RelatedGeneratedImageId = relatedGeneratedImageId,
            CreatedAt = DateTime.UtcNow,
        };

        this.db.CreditTransactions.Add(txn);
        await this.db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return DeductResult.Success(user.CreditBalance, txn);
    }

    public async Task<GrantResult> GrantAsync(
        string userId,
        int amount,
        string description,
        CancellationToken ct = default)
    {
        if (amount <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(amount), "Amount must be positive.");
        }

        await using var tx = await this.db.Database.BeginTransactionAsync(
            System.Data.IsolationLevel.Serializable, ct);

        AppUser? user = await this.db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return GrantResult.Failure("User not found.");
        }

        user.CreditBalance += amount;

        CreditTransaction txn = new()
        {
            UserId = user.Id,
            Amount = amount,
            BalanceAfter = user.CreditBalance,
            Description = description,
            CreatedAt = DateTime.UtcNow,
        };

        this.db.CreditTransactions.Add(txn);
        await this.db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return GrantResult.Success(user.CreditBalance, txn);
    }
}

public sealed record DeductResult(bool Succeeded, int? NewBalance, CreditTransaction? Transaction, string? Error)
{
    public static DeductResult Success(int newBalance, CreditTransaction txn) => new(true, newBalance, txn, null);

    public static DeductResult Failure(string error) => new(false, null, null, error);
}

public sealed record GrantResult(bool Succeeded, int? NewBalance, CreditTransaction? Transaction, string? Error)
{
    public static GrantResult Success(int newBalance, CreditTransaction txn) => new(true, newBalance, txn, null);

    public static GrantResult Failure(string error) => new(false, null, null, error);
}
