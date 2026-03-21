using Microsoft.AspNetCore.Identity;

namespace MerchStoryAPI.Models;

public class AppUser : IdentityUser
{
    public ShopProfile? ShopProfile { get; set; }
}
