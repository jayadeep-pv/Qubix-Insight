using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;
using System.Web;

namespace QubixInsight.Functions;

public class GetTemplates
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    // ✅ FIXED constructor
    public GetTemplates(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetTemplates")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get")] HttpRequestData req)
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

            // ✅ STEP 3 — Connect to Tenant Dataverse
            using var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

            // ===== EXISTING LOGIC (UNCHANGED) =====

            var documentTypeId = HttpUtility.ParseQueryString(req.Url.Query)
                .Get("documentTypeId");

            if (!Guid.TryParse(documentTypeId, out var docTypeGuid))
            {
                var bad = req.CreateResponse(HttpStatusCode.BadRequest);
                await bad.WriteStringAsync("Invalid documentTypeId");
                return bad;
            }

            var query = new QueryExpression("ilx_analysistemplate")
            {
                ColumnSet = new ColumnSet(
                    "ilx_name",
                    "ilx_documenttype",
                    "ilx_templateaiprompt",
                    "ilx_aioutputstyle",
                    "ilx_isdefault",
                    "ilx_version",
                    "statecode"
                )
            };

            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition("ilx_documenttype", ConditionOperator.Equal, docTypeGuid);
            TenantQueryHelper.AddTenantFilter(query, tenant.TenantRecordId.ToString());

            var results = service.RetrieveMultiple(query).Entities
                .Select(e => new
                {
                    id = e.Id,
                    name = e.GetAttributeValue<string>("ilx_name"),
                    documentTypeId = e.GetAttributeValue<EntityReference>("ilx_documenttype")?.Id,
                    templateAiPrompt = e.GetAttributeValue<string>("ilx_templateaiprompt"),
                    aiOutputStyleId = e.GetAttributeValue<OptionSetValue>("ilx_aioutputstyle")?.Value,
                    version = e.GetAttributeValue<string>("ilx_version"),
                    isDefault = e.GetAttributeValue<bool?>("ilx_isdefault") ?? false,
                    isActive = e.GetAttributeValue<OptionSetValue>("statecode")?.Value == 0
                });

            var response = req.CreateResponse(HttpStatusCode.OK);
            await response.WriteAsJsonAsync(results);

            return response;
        }
        catch (Exception ex)
        {
            var error = req.CreateResponse(HttpStatusCode.InternalServerError);
            await error.WriteStringAsync(ex.ToString());  // ✅ SHOW FULL ERROR
            return error;
        }
    }
}
