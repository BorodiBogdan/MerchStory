using Microsoft.AspNetCore.Identity;

namespace MerchStoryAPI.Models;

public class AppUser : IdentityUser
{
    public ShopProfile? ShopProfile { get; set; }

    public string? InstagramUserId { get; set; }

    public string? InstagramAccessToken { get; set; }

    public string? FacebookUserId { get; set; }

    public string? FacebookAccessToken { get; set; }
}
