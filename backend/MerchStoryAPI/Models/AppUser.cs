using Microsoft.AspNetCore.Identity;

namespace MerchStoryAPI.Models;

public class AppUser : IdentityUser
{
    public ShopProfile? ShopProfile { get; set; }

    public bool IsAdmin { get; set; }

    public AppLanguage PreferredLanguage { get; set; } = AppLanguage.EN;

    public bool HasSetLanguagePreference { get; set; }

    public int CoinBalance { get; set; }

    public ICollection<CoinTransaction> CoinTransactions { get; set; } = new List<CoinTransaction>();
}
