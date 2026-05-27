using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetAllRules
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;
    public GetAllRules(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetAllRules")]
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

            var query = new QueryExpression("ilx_analysisrule")
            {
                ColumnSet = new ColumnSet(
                    "ilx_analysisruleid",
                    "ilx_name",
                    "ilx_advisorytext",
                    "ilx_analysisdirection",
                    "ilx_impactcategory",
                    "ilx_severity",
                    "ilx_weight",
                    "ilx_analysistemplate",
                    "ilx_templateattribute",
                    "createdon",
                    "modifiedon",
                    "statecode")
            };

            TenantQueryHelper.AddTenantFilter(query, tenant.TenantRecordId.ToString());
            query.AddOrder("ilx_name", OrderType.Ascending);

            var templateLink = query.AddLink(
                "ilx_analysistemplate",
                "ilx_analysistemplate",
                "ilx_analysistemplateid",
                JoinOperator.LeftOuter);

            templateLink.Columns = new ColumnSet("ilx_name");
            templateLink.EntityAlias = "template";

            var attributeLink = query.AddLink(
                "ilx_templateattribute",
                "ilx_templateattribute",
                "ilx_templateattributeid",
                JoinOperator.LeftOuter);

            attributeLink.Columns = new ColumnSet("ilx_name", "ilx_displayname");
            attributeLink.EntityAlias = "attribute";

            var result = service.RetrieveMultiple(query);

            var items = result.Entities.Select(e => new
            {
                id = e.Id,

                name = e.GetAttributeValue<string>("ilx_name"),

                advisoryText = e.GetAttributeValue<string>("ilx_advisorytext"),

                comparisonDirection =
                    e.GetAttributeValue<OptionSetValue>("ilx_analysisdirection")?.Value,

                impactCategory =
                    e.GetAttributeValue<OptionSetValue>("ilx_impactcategory")?.Value,

                severity =
                    e.GetAttributeValue<OptionSetValue>("ilx_severity")?.Value,

                weight =
                    e.GetAttributeValue<int?>("ilx_weight"),

                isActive =
                    e.GetAttributeValue<OptionSetValue>("statecode")?.Value == 0,

                createdOn =
                    e.GetAttributeValue<DateTime?>("createdon"),

                modifiedOn =
                    e.GetAttributeValue<DateTime?>("modifiedon"),

                templateId =
                    e.GetAttributeValue<EntityReference>("ilx_analysistemplate")?.Id,

                templateName =
                    e.Contains("template.ilx_name")
                        ? ((AliasedValue)e["template.ilx_name"]).Value?.ToString()
                        : null,

                templateAttributeId =
                    e.GetAttributeValue<EntityReference>("ilx_templateattribute")?.Id,

                templateAttributeName =
                    e.Contains("attribute.ilx_displayname")
                        ? ((AliasedValue)e["attribute.ilx_displayname"]).Value?.ToString()
                        : e.Contains("attribute.ilx_name")
                            ? ((AliasedValue)e["attribute.ilx_name"]).Value?.ToString()
                            : null
            }).ToList();

            response.StatusCode = HttpStatusCode.OK;

            await response.WriteStringAsync(
                JsonSerializer.Serialize(items)
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
