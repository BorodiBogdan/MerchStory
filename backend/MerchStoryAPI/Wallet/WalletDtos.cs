namespace MerchStoryAPI.Wallet;

public record WalletTransactionDto(
    int Id,
    int Amount,
    int BalanceAfter,
    string? Description,
    Guid? RelatedGeneratedImageId,
    DateTime CreatedAt);

public record WalletSummaryDto(int Balance, IReadOnlyList<WalletTransactionDto> RecentTransactions);

public record GrantCoinsRequest(string UserEmail, int Amount, string? Note);

public record GrantCoinsResponse(string UserId, string UserEmail, int Balance, WalletTransactionDto Transaction);

public record AdminUserLookupDto(string Id, string Email, string UserName, bool IsAdmin, int CoinBalance);
