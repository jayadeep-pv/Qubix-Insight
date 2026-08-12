using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using QubixInsight.Models;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetCurrentUser
{
    private static readonly HashSet<string> BlockedDomains = new(StringComparer.OrdinalIgnoreCase)
    {
        "gmail.com", "googlemail.com",
        "hotmail.com", "hotmail.co.uk", "hotmail.fr",
        "outlook.com", "live.com", "live.co.uk", "msn.com",
        "yahoo.com", "yahoo.co.uk", "yahoo.fr",
        "icloud.com", "me.com", "mac.com",
        "protonmail.com", "proton.me",
        "zoho.com", "aol.com", "ymail.com"
    };

    private readonly ILogger<GetCurrentUser> _logger;
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantUserService _tenantUserService;

    public GetCurrentUser(ILogger<GetCurrentUser> logger,
        TenantResolverService tenantResolver,
        TenantUserService tenantUserService)
    {
        _logger = logger;
        _tenantResolver = tenantResolver;
        _tenantUserService = tenantUserService;
    }

    [Function("GetCurrentUser")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "GetCurrentUser")]
        HttpRequestData req)
    {
        var userInfo = JwtTenantExtractor.GetUserInfo(req);

        if (userInfo is null || string.IsNullOrWhiteSpace(userInfo.TenantId))
        {
            var bad = req.CreateResponse(HttpStatusCode.Unauthorized);
            await bad.WriteStringAsync("Unable to determine tenant from Bearer token.");
            return bad;
        }

        try
        {
            TenantSettings tenant;
            try
            {
                tenant = _tenantResolver.ResolveTenant(userInfo.TenantId!);
            }
            catch (Exception ex) when (
                ex.Message.Contains("Tenant not found or inactive") &&
                userInfo.Issuer?.IndexOf("ciamlogin.com", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                // CIAM user whose personal ilx_tenantsetting hasn't been provisioned yet.
                // UpdateTrialProfile (called from index.tsx after redirect) creates it —
                // this can happen if that call is still in-flight or failed transiently.
                // Return a minimal response so the frontend knows to wait/retry.
                _logger.LogWarning("CIAM user {Oid} has no tenant record yet — UpdateTrialProfile may be pending.", userInfo.Oid);
                var pending = req.CreateResponse(HttpStatusCode.OK);
                pending.Headers.Add("Content-Type", "application/json");
                await pending.WriteStringAsync(JsonSerializer.Serialize(new { isTrial = true, profileComplete = false }));
                return pending;
            }

            // Block personal email domains for trial accounts (internal accounts exempt)
            if (tenant.IsTrial && !tenant.IsInternal)
            {
                var domain = userInfo.Email?.Split('@').LastOrDefault() ?? "";
                if (BlockedDomains.Contains(domain))
                {
                    _logger.LogWarning("Trial sign-up blocked for personal domain: {Domain}", domain);
                    var blocked = req.CreateResponse(HttpStatusCode.Unauthorized);
                    await blocked.WriteStringAsync("Please sign up with a work email address. Personal email addresses are not accepted.");
                    return blocked;
                }
            }

            // Look up the tenant user record for all users to read the IsAdmin flag.
            // Trial-only fields (runs, expiry) remain gated on tenant.IsTrial below.
            TenantUserRecord? tenantUser = null;
            if (userInfo.Oid is not null)
            {
                tenantUser = _tenantUserService.GetByOid(userInfo.Oid);
                if (tenantUser != null && tenant.IsTrial)
                    _tenantUserService.UpdateLastLogin(userInfo.Oid);
            }

            // Alias kept so trial-specific logic below compiles without changes
            var trialUser = (tenant.IsTrial && !tenant.IsInternal) ? tenantUser : null;

            var isExpired = trialUser?.TrialExpiry.HasValue == true
                && trialUser.TrialExpiry.Value < DateTime.UtcNow;

            // Return runs for the CURRENT month only (resets each month)
            var currentMonth = int.Parse(DateTime.UtcNow.ToString("yyyyMM"));
            var runsThisMonth = (trialUser != null && trialUser.RunMonth == currentMonth)
                ? trialUser.RunsUsed
                : 0;

            // isAdmin: read from ilx_isadministrator on the TenantUser record.
            // If no record exists for this user, default to true (unrestricted).
            var isAdmin = tenantUser?.IsAdmin ?? true;

            var result = new
            {
                isTrial          = tenant.IsTrial && !tenant.IsInternal,
                isAdmin          = isAdmin,
                tenantName       = tenant.TenantName,
                _dbgTenantKey    = tenant.TenantKey,
                _dbgIsInternal   = tenant.IsInternal,
                subscriptionTier = tenant.SubscriptionTier,
                userEmail        = trialUser?.Email       ?? userInfo.Email       ?? "",
                userName         = trialUser?.DisplayName ?? userInfo.Name        ?? "",
                firstName        = trialUser?.FirstName   ?? "",
                lastName         = trialUser?.LastName    ?? "",
                companyName      = trialUser?.CompanyName ?? userInfo.CompanyName ?? "",
                jobTitle         = trialUser?.JobTitle    ?? "",
                country          = trialUser?.Country     ?? "",
                profileComplete  = !tenant.IsTrial || tenant.IsInternal || trialUser != null,
                runsUsed         = runsThisMonth,
                runLimit         = trialUser?.RunLimit    ?? 3,
                trialExpiry      = trialUser?.TrialExpiry?.ToString("o") ?? "",
                trialExpired     = isExpired
            };

            var response = req.CreateResponse(HttpStatusCode.OK);
            response.Headers.Add("Content-Type", "application/json");
            await response.WriteStringAsync(JsonSerializer.Serialize(result));
            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GetCurrentUser failed for tenant {TenantId}", userInfo.TenantId);
            var error = req.CreateResponse(HttpStatusCode.InternalServerError);
            await error.WriteStringAsync(ex.Message);
            return error;
        }
    }

}
