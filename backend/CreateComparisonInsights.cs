using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class CreateComparisonInsights
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;
    private const int INSIGHT_PENDING = 857270000;
   
    public CreateComparisonInsights(
    TenantResolverService tenantResolver,
    TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("CreateComparisonInsights")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")]
        HttpRequestData req)
    {
        try
        {
            var aadTenantId = JwtTenantExtractor.GetAadTenantId(req);

            if (string.IsNullOrWhiteSpace(aadTenantId))
            {
                var bad = req.CreateResponse(System.Net.HttpStatusCode.Unauthorized);
                await bad.WriteStringAsync("Unable to determine tenant from Bearer token.");
                return bad;
            }

            var tenant = _tenantResolver.ResolveTenant(aadTenantId);

            var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

            var body = await JsonSerializer.DeserializeAsync<JsonElement>(
                req.Body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (!body.TryGetProperty("comparisonRunId", out var runProp) ||
                !Guid.TryParse(runProp.GetString(), out var runId))
            {
                return req.CreateResponse(HttpStatusCode.BadRequest);
            }

            if (!body.TryGetProperty("selectedProfileIds", out var profilesProp))
            {
                return req.CreateResponse(HttpStatusCode.BadRequest);
            }
           
            foreach (var profileIdElement in profilesProp.EnumerateArray())
            {
                if (!Guid.TryParse(profileIdElement.GetString(), out var profileId))
                    continue;

                var insight = new Entity("ilx_analysisruninsight");

                insight["ilx_analysisrun"] =
                    new EntityReference("ilx_analysisrun", runId);

                insight["ilx_aiinsightprofile"] =
                    new EntityReference("ilx_aiinsightprofile", profileId);

                insight["ilx_runstatus"] =
                    new OptionSetValue(INSIGHT_PENDING);

                service.Create(insight);
            }

            return req.CreateResponse(HttpStatusCode.OK);
        }
        catch (Exception ex)
        {
            var error = req.CreateResponse(HttpStatusCode.InternalServerError);
            await error.WriteStringAsync(ex.ToString());
            return error;
        }
    }
}
