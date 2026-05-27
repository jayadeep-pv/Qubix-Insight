using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetTemplateAttributes
{   
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public GetTemplateAttributes(
    TenantResolverService tenantResolver,
    TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetTemplateAttributes")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "get")] HttpRequestData req)
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

        var query = new QueryExpression("ilx_templateattribute");

        query.ColumnSet = new ColumnSet(
            "ilx_name",
            "ilx_displayname",
            "ilx_attributekey",
            "ilx_category",
            "ilx_expecteddatatype",
            "ilx_usagemode",
            "ilx_displayorder",
            "ilx_ismandatory",
            "ilx_analysistemplate"
        );

        TenantQueryHelper.AddTenantFilter(query, tenant.TenantRecordId.ToString());

        var results = service.RetrieveMultiple(query);

        var list = results.Entities.Select(e => new
        {
            id = e.Id,

            name = e.GetAttributeValue<string>("ilx_name"),

            displayName = e.GetAttributeValue<string>("ilx_displayname"),

            attributeKey = e.GetAttributeValue<string>("ilx_attributekey"),

            category = e.GetAttributeValue<OptionSetValue>("ilx_category")?.Value,

            expectedDataType =
                e.GetAttributeValue<OptionSetValue>("ilx_expecteddatatype")?.Value,

            usageMode =
                e.GetAttributeValue<OptionSetValue>("ilx_usagemode")?.Value,

            displayOrder =
                e.GetAttributeValue<int?>("ilx_displayorder"),

            isMandatory =
                e.GetAttributeValue<bool?>("ilx_ismandatory"),

            templateId =
                e.GetAttributeValue<EntityReference>("ilx_analysistemplate")?.Id,

            templateName =
                e.GetAttributeValue<EntityReference>("ilx_analysistemplate")?.Name
        });

        var response = req.CreateResponse(HttpStatusCode.OK);

        await response.WriteAsJsonAsync(list);

        return response;
    }
}
