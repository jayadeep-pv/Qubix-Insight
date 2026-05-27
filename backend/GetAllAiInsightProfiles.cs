using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetAllAiInsightProfiles
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public GetAllAiInsightProfiles(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetAllAiInsightProfiles")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get")] HttpRequestData req)
    {
        var response = req.CreateResponse();

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

            var query = new QueryExpression("ilx_aiinsightprofile")
            {
                ColumnSet = new ColumnSet(
                    "ilx_aiinsightprofileid",
                    "ilx_name",
                    "ilx_profilecode",
                    "ilx_profilestatus",
                    "ilx_prompt",
                    "ilx_displayorder",
                    "statecode",
                    "createdon",
                    "modifiedon"
                )
            };

            TenantQueryHelper.AddTenantFilter(query, tenant.TenantRecordId.ToString());

            var result = service.RetrieveMultiple(query);

            var profiles = result.Entities.Select(e => new
            {
                id = e.Id,
                profileName = e.GetAttributeValue<string>("ilx_name"),
                profileCode = e.GetAttributeValue<string>("ilx_profilecode"),
                profileStatus = e.GetAttributeValue<OptionSetValue>("ilx_profilestatus")?.Value,
                prompt = e.GetAttributeValue<string>("ilx_prompt"),
                displayOrder = e.GetAttributeValue<int?>("ilx_displayorder"),
                statecode = e.GetAttributeValue<OptionSetValue>("statecode")?.Value,
                createdOn = e.GetAttributeValue<DateTime?>("createdon"),
                modifiedOn = e.GetAttributeValue<DateTime?>("modifiedon")
            });

            response.StatusCode = HttpStatusCode.OK;

            await response.WriteStringAsync(JsonSerializer.Serialize(profiles));
        }
        catch (Exception ex)
        {
            response.StatusCode = HttpStatusCode.InternalServerError;

            await response.WriteStringAsync(ex.Message);
        }

        return response;
    }
}
