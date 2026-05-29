using Microsoft.Azure.Functions.Worker.Http;
using System.Text;
using System.Text.Json;

namespace QubixInsight.Services;

public record JwtUserInfo(string? TenantId, string? Email, string? Name, string? Issuer, string? CompanyName);

/// <summary>
/// Extracts claims from the Bearer JWT in the Authorization header.
/// No third-party JWT library — the payload is standard base64url.
/// </summary>
public static class JwtTenantExtractor
{
    public static string? GetAadTenantId(HttpRequestData req) =>
        GetUserInfo(req)?.TenantId;

    public static JwtUserInfo? GetUserInfo(HttpRequestData req)
    {
        if (!req.Headers.TryGetValues("Authorization", out var authValues))
            return null;

        var bearer = authValues.FirstOrDefault()
            ?.Replace("Bearer ", "", StringComparison.OrdinalIgnoreCase)
            ?.Trim();

        if (string.IsNullOrEmpty(bearer))
            return null;

        try
        {
            var parts = bearer.Split('.');
            if (parts.Length < 2)
                return null;

            var payload = parts[1]
                .Replace('-', '+')
                .Replace('_', '/');

            switch (payload.Length % 4)
            {
                case 2: payload += "=="; break;
                case 3: payload += "=";  break;
            }

            var bytes = Convert.FromBase64String(payload);
            var json  = Encoding.UTF8.GetString(bytes);

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            var tid    = root.TryGetProperty("tid",                out var t)   ? t.GetString()   : null;
            var issuer = root.TryGetProperty("iss",                out var i)   ? i.GetString()   : null;
            // email claim varies by token type: prefer 'upn' for AAD, 'email' for External ID
            var email  = root.TryGetProperty("upn",                out var upn) ? upn.GetString() :
                         root.TryGetProperty("email",              out var em)  ? em.GetString()  :
                         root.TryGetProperty("preferred_username", out var pu)  ? pu.GetString()  : null;
            // name claim: External ID does not auto-compose displayName — fall back to given_name + family_name
            var nameVal     = root.TryGetProperty("name",        out var n)   ? n.GetString()   : null;
            var givenName   = root.TryGetProperty("given_name",  out var gn)  ? gn.GetString()  : null;
            var familyName  = root.TryGetProperty("family_name", out var fn)  ? fn.GetString()  : null;
            var name = !string.IsNullOrWhiteSpace(nameVal)
                ? nameVal
                : string.Join(" ", new[] { givenName, familyName }.Where(s => !string.IsNullOrWhiteSpace(s)));

            // Standard Azure AD attribute first; fall back to custom extension attribute
            string? companyName = root.TryGetProperty("companyName", out var cn) ? cn.GetString() : null;
            if (string.IsNullOrWhiteSpace(companyName))
            {
                foreach (var prop in root.EnumerateObject())
                {
                    if (prop.Name.StartsWith("extension_", StringComparison.OrdinalIgnoreCase) &&
                        prop.Name.EndsWith("_CompanyName", StringComparison.OrdinalIgnoreCase))
                    {
                        companyName = prop.Value.GetString();
                        break;
                    }
                }
            }

            return new JwtUserInfo(tid, email, name, issuer, companyName);
        }
        catch
        {
            return null;
        }
    }
}
