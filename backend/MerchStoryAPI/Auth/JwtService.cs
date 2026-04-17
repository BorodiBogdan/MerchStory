using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using MerchStoryAPI.Models;
using Microsoft.IdentityModel.Tokens;

namespace MerchStoryAPI.Auth;

public class JwtService
{
    private readonly IConfiguration config;

    public JwtService(IConfiguration config)
    {
        this.config = config;
    }

    public string GenerateToken(AppUser user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(this.config["Jwt:Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiry = DateTime.UtcNow.AddMinutes(double.Parse(this.config["Jwt:ExpiryMinutes"] ?? "15", CultureInfo.InvariantCulture));

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id),
            new Claim(JwtRegisteredClaimNames.Email, user.Email!),
            new Claim(JwtRegisteredClaimNames.UniqueName, user.UserName!),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim("is_admin", user.IsAdmin ? "true" : "false"),
        };

        var token = new JwtSecurityToken(
            issuer: this.config["Jwt:Issuer"],
            audience: this.config["Jwt:Audience"],
            claims: claims,
            expires: expiry,
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public RefreshToken GenerateRefreshToken(string userId, string clientType)
    {
        var configKey = clientType == "web"
            ? "Jwt:WebRefreshTokenExpiryDays"
            : "Jwt:MobileRefreshTokenExpiryDays";

        var days = double.Parse(
            this.config[configKey] ?? (clientType == "web" ? "1" : "30"),
            CultureInfo.InvariantCulture);

        byte[] tokenBytes = RandomNumberGenerator.GetBytes(32);
        string tokenValue = Convert.ToBase64String(tokenBytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');

        return new RefreshToken
        {
            Id = Guid.NewGuid(),
            Token = tokenValue,
            UserId = userId,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(days),
            IsRevoked = false,
        };
    }
}
