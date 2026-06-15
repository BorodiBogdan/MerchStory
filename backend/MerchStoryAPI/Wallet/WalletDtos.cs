namespace MerchStoryAPI.Wallet;

public record WalletTransactionDto(
    int Id,
    int Amount,
    int BalanceAfter,
    string? Description,
    Guid? RelatedGeneratedImageId,
    DateTime CreatedAt);

public record WalletSummaryDto(int Balance, IReadOnlyList<WalletTransactionDto> RecentTransactions);

public record WalletTransactionPageDto(IReadOnlyList<WalletTransactionDto> Items, int Total);

public record GrantCreditsRequest(string UserEmail, int Amount, string? Note);

public record GrantCreditsResponse(string UserId, string UserEmail, int Balance, WalletTransactionDto Transaction);

public record AdminUserLookupDto(string Id, string Email, string UserName, bool IsAdmin, int CreditBalance, bool CanViewRecommendations);

public record SetRecommendationsAccessRequest(string UserEmail, bool CanView);

public record SetRecommendationsAccessResponse(string UserId, string UserEmail, bool CanViewRecommendations);
