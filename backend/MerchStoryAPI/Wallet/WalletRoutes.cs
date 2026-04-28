using System.Security.Claims;
using MerchStoryAPI.Data;
using MerchStoryAPI.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;

namespace MerchStoryAPI.Wallet;

public static class WalletRoutes
{
    public static void MapWalletEndpoints(this WebApplication app)
    {
        RouteGroupBuilder group = app.MapGroup("/wallet").RequireAuthorization();

        group.MapGet("/", async (
            ClaimsPrincipal principal,
            AppDbContext db,
            CancellationToken ct) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            AppUser? user = await db.Users
                .AsNoTracking()
                .SingleOrDefaultAsync(u => u.Id == userId, ct);
            if (user is null)
            {
                return Results.Unauthorized();
            }

            var recent = await db.CoinTransactions
                .AsNoTracking()
                .Where(t => t.UserId == userId)
                .OrderByDescending(t => t.CreatedAt)
                .Take(20)
                .Select(t => new WalletTransactionDto(
                    t.Id,
                    t.Amount,
                    t.BalanceAfter,
                    t.Description,
                    t.RelatedGeneratedImageId,
                    t.CreatedAt))
                .ToListAsync(ct);

            return Results.Ok(new WalletSummaryDto(user.CoinBalance, recent));
        });

        group.MapGet("/transactions", async (
            ClaimsPrincipal principal,
            AppDbContext db,
            int? skip,
            int? take,
            CancellationToken ct) =>
        {
            string? userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            int s = Math.Max(0, skip ?? 0);
            int t = Math.Clamp(take ?? 50, 1, 200);

            var page = await db.CoinTransactions
                .AsNoTracking()
                .Where(x => x.UserId == userId)
                .OrderByDescending(x => x.CreatedAt)
                .Skip(s)
                .Take(t)
                .Select(x => new WalletTransactionDto(
                    x.Id,
                    x.Amount,
                    x.BalanceAfter,
                    x.Description,
                    x.RelatedGeneratedImageId,
                    x.CreatedAt))
                .ToListAsync(ct);

            return Results.Ok(page);
        });

        group.MapPost("/grant", async (
            GrantCoinsRequest request,
            UserManager<AppUser> userManager,
            WalletService wallet,
            ILogger<Program> logger,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.UserEmail))
            {
                return Results.BadRequest("UserEmail is required.");
            }

            if (request.Amount <= 0)
            {
                return Results.BadRequest("Amount must be a positive integer.");
            }

            AppUser? target = await userManager.FindByEmailAsync(request.UserEmail.Trim());
            if (target is null)
            {
                return Results.NotFound(new { detail = "User not found." });
            }

            string description = string.IsNullOrWhiteSpace(request.Note)
                ? "Admin grant"
                : $"Admin grant: {request.Note.Trim()}";

            GrantResult result = await wallet.GrantAsync(target.Id, request.Amount, description, ct);
            if (!result.Succeeded || result.Transaction is null || result.NewBalance is null)
            {
                logger.LogWarning("Admin grant failed for {Email}: {Error}", request.UserEmail, result.Error);
                return Results.Problem(result.Error ?? "Grant failed.", statusCode: 500);
            }

            CoinTransaction txn = result.Transaction;
            return Results.Ok(new GrantCoinsResponse(
                target.Id,
                target.Email!,
                result.NewBalance.Value,
                new WalletTransactionDto(
                    txn.Id,
                    txn.Amount,
                    txn.BalanceAfter,
                    txn.Description,
                    txn.RelatedGeneratedImageId,
                    txn.CreatedAt)));
        }).RequireAuthorization("AdminOnly");

        group.MapGet("/admin/users", async (
            string? query,
            AppDbContext db,
            CancellationToken ct) =>
        {
            string q = (query ?? string.Empty).Trim();
            if (q.Length < 2)
            {
                return Results.Ok(Array.Empty<AdminUserLookupDto>());
            }

            string lower = q.ToLowerInvariant();

            var matches = await db.Users
                .AsNoTracking()
                .Where(u =>
                    (u.Email != null && u.Email.ToLower().Contains(lower)) ||
                    (u.UserName != null && u.UserName.ToLower().Contains(lower)))
                .OrderBy(u => u.Email)
                .Take(10)
                .Select(u => new AdminUserLookupDto(
                    u.Id,
                    u.Email ?? string.Empty,
                    u.UserName ?? string.Empty,
                    u.IsAdmin,
                    u.CoinBalance))
                .ToListAsync(ct);

            return Results.Ok(matches);
        }).RequireAuthorization("AdminOnly");
    }

    private static string? GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
}
