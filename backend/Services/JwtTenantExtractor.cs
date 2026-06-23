using Microsoft.Azure.Functions.Worker.Http;
using System.Text;
using System.Text.Json;

namespace QubixInsight.Services;

public record JwtUserInfo(string? TenantId, string? Oid, string? Email, string? Name, string? Issuer, string? CompanyName);

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
            var oid    = root.TryGetProperty("oid",                out var o)   ? o.GetString()   : null;
            // CIAM access tokens may omit 'oid' but always carry 'sub' (= user object ID in CIAM).
            if (string.IsNullOrEmpty(oid))
                oid = root.TryGetProperty("sub", out var sub) ? sub.GetString() : null;
            var issuer = root.TryGetProperty("iss",                out var i)   ? i.GetString()   : null;
            var isCiamEarly = issuer?.IndexOf("ciamlogin.com", StringComparison.OrdinalIgnoreCase) >= 0;

            // Email claim order differs by token type:
            //   AAD:  upn → preferred_username → email  (UPN is canonical for corp accounts)
            //   CIAM: email → preferred_username → upn  (email claim holds the real sign-up address;
            //         preferred_username is the generated ilogixidentity.onmicrosoft.com UPN)
            static bool IsEmail(string? s) => s?.Contains('@') == true;
            string? rawEmail;
            if (isCiamEarly)
            {
                rawEmail = root.TryGetProperty("email",              out var cem)  ? cem.GetString()  :
                           root.TryGetProperty("preferred_username", out var cpu)  ? cpu.GetString()  :
                           root.TryGetProperty("upn",                out var cupn) ? cupn.GetString() : null;
            }
            else
            {
                rawEmail = root.TryGetProperty("upn",                out var upn) ? upn.GetString() :
                           root.TryGetProperty("preferred_username", out var pu)  ? pu.GetString()  :
                           root.TryGetProperty("email",              out var em)  ? em.GetString()  : null;
            }
            var email = IsEmail(rawEmail) ? rawEmail : null;
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

            // CIAM (External ID) users all share the same JWT tid — the ilogixidentity tenant GUID.
            // Each trial user has their own ilx_tenantsetting keyed by their OID, so substitute
            // OID as the effective tenant ID for all TenantResolverService lookups.
            var effectiveTenantId = (isCiamEarly && oid != null) ? oid : tid;

            return new JwtUserInfo(effectiveTenantId, oid, email, name, issuer, companyName);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Returns true when the token was issued by Azure AD External ID (CIAM / trial users).
    /// These users bypass admin-only checks for Quick Scan template saves.
    /// </summary>
    public static bool IsCiamUser(JwtUserInfo userInfo) =>
        userInfo.Issuer?.IndexOf("ciamlogin.com", StringComparison.OrdinalIgnoreCase) >= 0;
}
