using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class UpdateTrialProfile
{
    private readonly ILogger<UpdateTrialProfile> _logger;
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantUserService _tenantUserService;

    public UpdateTrialProfile(ILogger<UpdateTrialProfile> logger,
        TenantResolverService tenantResolver,
        TenantUserService tenantUserService)
    {
        _logger = logger;
        _tenantResolver = tenantResolver;
        _tenantUserService = tenantUserService;
    }

    private record ProfileRequest(
        string? FirstName,
        string? LastName,
        string? CompanyName,
        string? JobTitle,
        string? Country
    );

    [Function("UpdateTrialProfile")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "UpdateTrialProfile")]
        HttpRequestData req)
    {
        var userInfo = JwtTenantExtractor.GetUserInfo(req);

        if (userInfo?.Oid is null || userInfo.TenantId is null)
        {
            var bad = req.CreateResponse(HttpStatusCode.Unauthorized);
            await bad.WriteStringAsync("Invalid or missing token claims.");
            return bad;
        }

        try
        {
            var body    = await req.ReadAsStringAsync();
            var profile = JsonSerializer.Deserialize<ProfileRequest>(body ?? "{}",
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            var tenant = _tenantResolver.ResolveTenant(userInfo.TenantId);

            _tenantUserService.CreateOrUpdate(
                oid:             userInfo.Oid,
                email:           userInfo.Email,
                displayName:     userInfo.Name,
                tenantSettingId: tenant.TenantRecordId,
                firstName:       profile?.FirstName,
                lastName:        profile?.LastName,
                companyName:     profile?.CompanyName,
                jobTitle:        profile?.JobTitle,
                country:         profile?.Country
            );

            var ok = req.CreateResponse(HttpStatusCode.OK);
            await ok.WriteStringAsync("Profile saved.");
            return ok;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "UpdateTrialProfile failed for oid {Oid}", userInfo.Oid);
            var err = req.CreateResponse(HttpStatusCode.InternalServerError);
            await err.WriteStringAsync(ex.Message);
            return err;
        }
    }
}
