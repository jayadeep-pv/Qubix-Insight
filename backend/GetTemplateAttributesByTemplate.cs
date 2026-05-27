using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetTemplateAttributesByTemplate
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public GetTemplateAttributesByTemplate(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetTemplateAttributesByTemplate")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get")] HttpRequestData req)
    {
        var templateId = System.Web.HttpUtility.ParseQueryString(req.Url.Query)
            .Get("templateId");

        if (!Guid.TryParse(templateId, out var templateGuid))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("Invalid templateId");
            return bad;
        }

        var aadTenantId = JwtTenantExtractor.GetAadTenantId(req);

        if (string.IsNullOrWhiteSpace(aadTenantId))
        {
            var bad = req.CreateResponse(System.Net.HttpStatusCode.Unauthorized);
            await bad.WriteStringAsync("Unable to determine tenant from Bearer token.");
            return bad;
        }

        var tenant = _tenantResolver.ResolveTenant(aadTenantId);
        using var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

        var query = new QueryExpression("ilx_templateattribute")
        {
            ColumnSet = new ColumnSet(
                "ilx_name",
                "ilx_displayname",      // ✅ ADD
                "ilx_category",         // ✅ ADD
                "ilx_expecteddatatype",
                "ilx_displayorder",            // ✅ ADD
                "ilx_aiextractionhint",
                "ilx_attributenarrative",
                "ilx_analysistemplate",
                "statecode",
                "createdon",
                "modifiedon"
            )
        };

        query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        query.Criteria.AddCondition("ilx_analysistemplate", ConditionOperator.Equal, templateGuid);
        TenantQueryHelper.AddTenantFilter(query, tenant.TenantRecordId.ToString());

        var results = service.RetrieveMultiple(query).Entities
            .Where(e =>
                e.GetAttributeValue<EntityReference>("ilx_analysistemplate")?.Id == templateGuid
            )
            .Select(e => new
            {
                id = e.Id,
                name = e.GetAttributeValue<string>("ilx_name"),
                attributeKey = e.GetAttributeValue<string>("ilx_attributekey"),

                displayName = e.GetAttributeValue<string>("ilx_displayname"),
                category = e.FormattedValues.Contains("ilx_category")
                ? e.FormattedValues["ilx_category"]
                : null,
                order = e.GetAttributeValue<int?>("ilx_displayorder"),

                // 🔥 FIX HERE
                expectedDataType =
                e.FormattedValues.Contains("ilx_expecteddatatype")
                    ? e.FormattedValues["ilx_expecteddatatype"]
                    : e.GetAttributeValue<OptionSetValue>("ilx_expecteddatatype") != null
                        ? e.GetAttributeValue<OptionSetValue>("ilx_expecteddatatype").Value.ToString()
                        : null,

                aiExtractionHint = e.GetAttributeValue<string>("ilx_aiextractionhint"),
                attributeNarrative = e.GetAttributeValue<string>("ilx_attributenarrative"),

                comparisonTemplateId = e.GetAttributeValue<EntityReference>("ilx_analysistemplate")?.Id,
                comparisonTemplate = e.GetAttributeValue<EntityReference>("ilx_analysistemplate")?.Name,

                isActive = e.GetAttributeValue<OptionSetValue>("statecode")?.Value == 0,

                createdOn = e.GetAttributeValue<DateTime?>("createdon"),
                modifiedOn = e.GetAttributeValue<DateTime?>("modifiedon")
            });

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(results);

        return response;
    }
}
