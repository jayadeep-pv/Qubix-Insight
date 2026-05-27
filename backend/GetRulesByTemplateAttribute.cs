using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetRulesByTemplateAttribute
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public GetRulesByTemplateAttribute(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetRulesByTemplateAttribute")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get")] HttpRequestData req)
    {
        var templateAttributeId = System.Web.HttpUtility
            .ParseQueryString(req.Url.Query)
            .Get("templateAttributeId");

        if (!Guid.TryParse(templateAttributeId, out var attrGuid))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("Invalid templateAttributeId");
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
                "statecode"
            )
        };

        /* =========================
           TEMPLATE LINK (FIXED)
        ========================= */
        var templateLink = query.AddLink(
            "ilx_analysistemplate",
            "ilx_analysistemplate",
            "ilx_analysistemplateid",
            JoinOperator.LeftOuter
        );

        templateLink.Columns = new ColumnSet("ilx_name");
        templateLink.EntityAlias = "template";   // ✅ CRITICAL FIX

        /* =========================
           ATTRIBUTE LINK (FIXED)
        ========================= */
        var attributeLink = query.AddLink(
            "ilx_templateattribute",
            "ilx_templateattribute",
            "ilx_templateattributeid",
            JoinOperator.LeftOuter
        );

        attributeLink.Columns = new ColumnSet("ilx_name", "ilx_displayname");
        attributeLink.EntityAlias = "attribute";   // ✅ CRITICAL FIX

        /* =========================
           FILTER
        ========================= */
        query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        query.Criteria.AddCondition("ilx_templateattribute", ConditionOperator.Equal, attrGuid);
        TenantQueryHelper.AddTenantFilter(query, tenant.TenantRecordId.ToString());

        /* =========================
           EXECUTE
        ========================= */
        var results = service.RetrieveMultiple(query).Entities
            .Select(e => new
            {
                id = e.Id,

                name = e.GetAttributeValue<string>("ilx_name"),

                advisoryText = e.GetAttributeValue<string>("ilx_advisorytext"),

                /* =========================
                   TEMPLATE NAME (FIXED)
                ========================= */
                templateName =
                    e.Contains("template.ilx_name")
                        ? ((AliasedValue)e["template.ilx_name"]).Value?.ToString()
                        : null,

                /* =========================
                   ATTRIBUTE NAME (FIXED)
                ========================= */
                templateAttributeName =
                    e.Contains("attribute.ilx_displayname")
                        ? ((AliasedValue)e["attribute.ilx_displayname"]).Value?.ToString()
                        : e.Contains("attribute.ilx_name")
                            ? ((AliasedValue)e["attribute.ilx_name"]).Value?.ToString()
                            : null,

                templateAttributeId =
                    e.GetAttributeValue<EntityReference>("ilx_templateattribute")?.Id,

                /* =========================
                   OPTION SET LABELS
                ========================= */
                comparisonDirection =
                    e.FormattedValues.Contains("ilx_analysisdirection")
                        ? e.FormattedValues["ilx_analysisdirection"]
                        : null,

                impactCategory =
                    e.FormattedValues.Contains("ilx_impactcategory")
                        ? e.FormattedValues["ilx_impactcategory"]
                        : null,

                severity =
                    e.FormattedValues.Contains("ilx_severity")
                        ? e.FormattedValues["ilx_severity"]
                        : null,

                weight = e.GetAttributeValue<int?>("ilx_weight"),

                isActive =
                    e.GetAttributeValue<OptionSetValue>("statecode")?.Value == 0
            });

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(results);

        return response;
    }
}
