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

            var recent = await db.CreditTransactions
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

            return Results.Ok(new WalletSummaryDto(user.CreditBalance, recent));
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

            IQueryable<CreditTransaction> query = db.CreditTransactions
                .AsNoTracking()
                .Where(x => x.UserId == userId);

            int total = await query.CountAsync(ct);

            var page = await query
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

            return Results.Ok(new WalletTransactionPageDto(page, total));
        });

        group.MapPost("/grant", async (
            GrantCreditsRequest request,
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

            CreditTransaction txn = result.Transaction;
            return Results.Ok(new GrantCreditsResponse(
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
                    u.CreditBalance,
                    u.CanViewRecommendations))
                .ToListAsync(ct);

            return Results.Ok(matches);
        }).RequireAuthorization("AdminOnly");

        group.MapPost("/grant-recommendations", async (
            SetRecommendationsAccessRequest request,
            UserManager<AppUser> userManager,
            ILogger<Program> logger) =>
        {
            if (string.IsNullOrWhiteSpace(request.UserEmail))
            {
                return Results.BadRequest("UserEmail is required.");
            }

            AppUser? target = await userManager.FindByEmailAsync(request.UserEmail.Trim());
            if (target is null)
            {
                return Results.NotFound(new { detail = "User not found." });
            }

            target.CanViewRecommendations = request.CanView;
            IdentityResult result = await userManager.UpdateAsync(target);
            if (!result.Succeeded)
            {
                logger.LogWarning(
                    "Failed to set recommendations access for {Email}: {Errors}",
                    request.UserEmail,
                    string.Join(", ", result.Errors.Select(e => e.Description)));
                return Results.Problem("Failed to update recommendations access.", statusCode: 500);
            }

            return Results.Ok(new SetRecommendationsAccessResponse(
                target.Id,
                target.Email!,
                target.CanViewRecommendations));
        }).RequireAuthorization("AdminOnly");
    }

    private static string? GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
}
