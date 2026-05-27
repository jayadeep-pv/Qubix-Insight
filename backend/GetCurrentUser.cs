using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetCurrentUser
{
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
