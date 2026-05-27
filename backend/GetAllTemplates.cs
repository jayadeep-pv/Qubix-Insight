using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Xrm.Sdk;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetAllTemplates
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

   public GetAllTemplates(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetAllTemplates")]
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

        var query = new QueryExpression("ilx_analysistemplate")
        {
            ColumnSet = new ColumnSet(
                "ilx_name",
                "ilx_documenttype",
                "ilx_templateaiprompt",
                "ilx_aioutputstyle",
                "ilx_version",
                "ilx_isdefault",
                "statecode",
                "createdon",
                "modifiedon"
            )
        };

        TenantQueryHelper.AddTenantFilter(query, tenant.TenantRecordId.ToString());

        var link = query.AddLink(
            "ilx_documenttype",
            "ilx_documenttype",
            "ilx_documenttypeid");

        link.Columns = new ColumnSet("ilx_name");
        link.EntityAlias = "doctype";

        var results = service.RetrieveMultiple(query).Entities
            .Select(e => new
            {
                id = e.Id,

                name = e.GetAttributeValue<string>("ilx_name"),

                documentTypeId =
                    e.GetAttributeValue<EntityReference>("ilx_documenttype")?.Id,

                documentType =
                    e.Contains("doctype.ilx_name")
                        ? (string)((AliasedValue)e["doctype.ilx_name"]).Value
                        : "",

                templateAiPrompt =
                    e.GetAttributeValue<string>("ilx_templateaiprompt"),

                aiOutputStyleId =
                    e.GetAttributeValue<OptionSetValue>("ilx_aioutputstyle")?.Value,

                version =
                    e.GetAttributeValue<string>("ilx_version"),

                isDefault =
                    e.GetAttributeValue<bool?>("ilx_isdefault") ?? false,

                isActive =
                    e.GetAttributeValue<OptionSetValue>("statecode")?.Value == 0,

                createdOn =
                    e.GetAttributeValue<DateTime?>("createdon"),

                modifiedOn =
                    e.GetAttributeValue<DateTime?>("modifiedon")
            });

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(results);

        return response;
    }
}
