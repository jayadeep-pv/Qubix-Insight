using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

public class GetAllTemplateAttributes
{

    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public GetAllTemplateAttributes(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetAllTemplateAttributes")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "get")] HttpRequestData req)
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

            var query = new QueryExpression("ilx_templateattribute");

            query.ColumnSet = new ColumnSet(
                "ilx_name",
                "ilx_displayorder",
                "ilx_displayname",
                "ilx_category",
                "ilx_displayorder",
                "ilx_expecteddatatype",
                "ilx_ismandatory",
                "ilx_aiextractionhint",
                "ilx_attributekey",
                "ilx_analysistemplate",       // 🔴 ADD THIS
                "createdon",             // 🔴 ADD THIS
                "modifiedon",            // 🔴 ADD THIS
                "statecode"
            );

            TenantQueryHelper.AddTenantFilter(query, tenant.TenantRecordId.ToString());

            var results = service.RetrieveMultiple(query);

            var list = new List<object>();

            foreach (var e in results.Entities)
            {
                var templateRef = e.GetAttributeValue<EntityReference>("ilx_analysistemplate");

                list.Add(new
                {
                    id = e.Id,

                    templateId = templateRef?.Id,            // 🔴 REQUIRED FOR DROPDOWN
                    templateName = templateRef?.Name,        // optional but useful

                    name = e.GetAttributeValue<string>("ilx_name"),

                    displayName = e.GetAttributeValue<string>("ilx_displayname"),                

                    category =
                    e.FormattedValues.Contains("ilx_category")
                        ? e.FormattedValues["ilx_category"]
                        : null,

                    order = e.GetAttributeValue<int?>("ilx_displayorder"),

                    expectedDataType =
                        e.FormattedValues.Contains("ilx_expecteddatatype")
                            ? e.FormattedValues["ilx_expecteddatatype"]
                            : null,
                    isMandatory = e.GetAttributeValue<bool?>("ilx_ismandatory") ?? false,

                    attributeKey = e.GetAttributeValue<string>("ilx_attributekey"),

                    aiExtractionHint = e.GetAttributeValue<string>("ilx_aiextractionhint"),

                    createdOn = e.GetAttributeValue<DateTime?>("createdon"),    // 🔴 ADD
                    modifiedOn = e.GetAttributeValue<DateTime?>("modifiedon"),  // 🔴 ADD

                    isActive = e.GetAttributeValue<OptionSetValue>("statecode")?.Value == 0
                });
            }

            var response = req.CreateResponse(HttpStatusCode.OK);
            await response.WriteAsJsonAsync(list);

            return response;
        }
        catch (Exception ex)
        {
            var response = req.CreateResponse(HttpStatusCode.InternalServerError);
            await response.WriteStringAsync(ex.ToString());
            return response;
        }
    }
}
