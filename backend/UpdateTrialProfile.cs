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
        string? Email,
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

        _logger.LogInformation(
            "[UpdateTrialProfile] oid={Oid} tenantId={TenantId} issuer={Issuer} email={Email}",
            userInfo?.Oid ?? "(null)", userInfo?.TenantId ?? "(null)",
            userInfo?.Issuer ?? "(null)", userInfo?.Email ?? "(null)");

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

            // This endpoint is trial/CIAM-only. Always provision a personal ilx_tenantsetting
            // keyed by OID — ProvisionTrialTenantAsync is idempotent (returns existing record
            // if already created). This ensures each trial user is isolated even if a shared
            // trial tenant record was set up during Phase 3 Azure portal configuration.
            //
            // Prefer the email the user typed in the sign-up form — External ID JWT tokens
            // often return the generated @ilogixidentity.onmicrosoft.com UPN rather than
            // the user's real work email, which would produce the wrong allowed domain.
            var resolvedEmail = !string.IsNullOrWhiteSpace(profile?.Email)
                ? profile.Email
                : userInfo.Email ?? "";

            var tenantSettingId = await _tenantUserService.ProvisionTrialTenantAsync(
                oid:         userInfo.Oid!,
                email:       resolvedEmail,
                companyName: profile?.CompanyName
            );

            _tenantUserService.CreateOrUpdate(
                oid:             userInfo.Oid,
                email:           resolvedEmail,
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
