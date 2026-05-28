using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
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

    public GetCurrentUser(ILogger<GetCurrentUser> logger, TenantResolverService tenantResolver)
    {
        _logger = logger;
        _tenantResolver = tenantResolver;
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
            var tenant = _tenantResolver.ResolveTenant(userInfo.TenantId);

            // Block personal email domains for trial accounts
            if (tenant.IsTrial)
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

            var result = new
            {
                isTrial          = tenant.IsTrial,
                tenantName       = tenant.TenantName,
                subscriptionTier = tenant.SubscriptionTier,
                userEmail        = userInfo.Email ?? "",
                userName         = userInfo.Name  ?? ""
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
