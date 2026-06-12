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
    private readonly GraphService _graphService;

    public UpdateTrialProfile(ILogger<UpdateTrialProfile> logger,
        TenantResolverService tenantResolver,
        TenantUserService tenantUserService,
        GraphService graphService)
    {
        _logger = logger;
        _tenantResolver = tenantResolver;
        _tenantUserService = tenantUserService;
        _graphService = graphService;
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

            // Resolve the tenant for this user.
            // For CIAM users, JwtTenantExtractor sets TenantId = OID so the lookup targets
            // their personal ilx_tenantsetting row (keyed by OID in ilx_aadtenantid).
            // On first sign-up that row does not exist yet — provision it now.
            Guid tenantSettingId;
            try
            {
                tenantSettingId = _tenantResolver.ResolveTenant(userInfo.TenantId!).TenantRecordId;
            }
            catch (Exception ex) when (ex.Message.Contains("Tenant not found or inactive"))
            {
                // New trial user — create their personal ilx_tenantsetting + blob container.
                tenantSettingId = await _tenantUserService.ProvisionTrialTenantAsync(
                    oid:         userInfo.Oid!,
                    email:       userInfo.Email ?? "",
                    companyName: profile?.CompanyName
                );
            }

            _tenantUserService.CreateOrUpdate(
                oid:             userInfo.Oid,
                email:           userInfo.Email,
                displayName:     userInfo.Name,
                tenantSettingId: tenantSettingId,
                firstName:       profile?.FirstName,
                lastName:        profile?.LastName,
                companyName:     profile?.CompanyName,
                jobTitle:        profile?.JobTitle,
                country:         profile?.Country
            );

            // Update the External ID directory so the MSAL account picker shows
            // the user's real name instead of "unknown" on subsequent logins.
            await _graphService.UpdateExternalIdUserAsync(
                oid:       userInfo.Oid,
                givenName: profile?.FirstName ?? "",
                surname:   profile?.LastName  ?? ""
            );

            var ok = req.CreateResponse(HttpStatusCode.OK);
            await ok.WriteStringAsync("Profile saved.");
            return ok;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "UpdateTrialProfile failed for oid {Oid} | {Type}: {Message} | Inner: {Inner}",
                userInfo.Oid, ex.GetType().Name, ex.Message, ex.InnerException?.Message);
            var err = req.CreateResponse(HttpStatusCode.InternalServerError);
            await err.WriteStringAsync(ex.Message);
            return err;
        }
    }
}
