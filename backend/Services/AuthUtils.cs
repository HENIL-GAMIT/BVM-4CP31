using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace backend.Services;

public static class AuthUtils
{
    public static string HashPassword(string password)
    {
        byte[] salt = RandomNumberGenerator.GetBytes(16);
        var pbkdf2 = new Rfc2898DeriveBytes(password, salt, 100000, HashAlgorithmName.SHA256);
        byte[] hash = pbkdf2.GetBytes(32);
        byte[] combined = new byte[49];
        Array.Copy(salt, 0, combined, 1, 16);
        combined[0] = 0; // version
        Array.Copy(hash, 0, combined, 17, 32);
        return Convert.ToBase64String(combined);
    }

    public static bool VerifyPassword(string password, string stored)
    {
        byte[] combined;
        try
        {
            combined = Convert.FromBase64String(stored);
        }
        catch (FormatException)
        {
            return false;
        }

        if (combined.Length != 49 || combined[0] != 0) return false;
        byte[] salt = new byte[16];
        Array.Copy(combined, 1, salt, 0, 16);
        var pbkdf2 = new Rfc2898DeriveBytes(password, salt, 100000, HashAlgorithmName.SHA256);
        byte[] hash = pbkdf2.GetBytes(32);
        return CryptographicOperations.FixedTimeEquals(combined.AsSpan(17, 32), hash);
    }

    public static string GenerateJwt(string key, string issuer, string audience, Dictionary<string,string> claims, int expiresMinutes = 60)
    {
        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        var creds = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);
        var tokenClaims = claims.Select(kv => new Claim(kv.Key, kv.Value)).ToList();
        var token = new JwtSecurityToken(issuer, audience, tokenClaims, expires: DateTime.UtcNow.AddMinutes(expiresMinutes), signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
