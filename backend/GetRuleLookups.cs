using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Xrm.Sdk;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetRuleLookups
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public GetRuleLookups(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetRuleLookups")]
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
            using var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

           
            // ---------------------------
            // Templates
            // ---------------------------

            var templateQuery = new QueryExpression("ilx_analysistemplate")
            {
                ColumnSet = new ColumnSet(
                    "ilx_analysistemplateid",
                    "ilx_name"
                )
            };

            TenantQueryHelper.AddTenantFilter(templateQuery, tenant.TenantRecordId.ToString());

            var templates = service.RetrieveMultiple(templateQuery)
                .Entities
                .Select(t => new
                {
                    id = t.Id,
                    name = t.GetAttributeValue<string>("ilx_name")
                })
                .ToList();

            // ---------------------------
            // Template Attributes
            // ---------------------------

            var attributeQuery = new QueryExpression("ilx_templateattribute")
            {
                ColumnSet = new ColumnSet(
                    "ilx_templateattributeid",
                    "ilx_name",
                    "ilx_displayname",
                    "ilx_analysistemplate"
                )
            };

            TenantQueryHelper.AddTenantFilter(attributeQuery, tenant.TenantRecordId.ToString());

            var attributes = service.RetrieveMultiple(attributeQuery)
                .Entities
                .Select(a => new
                {
                    id = a.Id,
                    name = a.GetAttributeValue<string>("ilx_name"),
                    displayName = a.GetAttributeValue<string>("ilx_displayname"),
                    templateId = a.GetAttributeValue<EntityReference>("ilx_analysistemplate")?.Id
                })
                .ToList();

            var result = new
            {
                templates,
                attributes
            };

            response.StatusCode = HttpStatusCode.OK;

            await response.WriteStringAsync(
                JsonSerializer.Serialize(result)
            );

            return response;
        }
        catch (Exception ex)
        {
            response.StatusCode = HttpStatusCode.InternalServerError;

            await response.WriteStringAsync(
                JsonSerializer.Serialize(new
                {
                    error = ex.Message
                })
            );

            return response;
        }
    }
}
