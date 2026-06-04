using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Extensions.Logging;
using System.Net;
using System.Text.Json;
using QubixInsight.Services;

public class GetDocumentTypes
{
    private readonly IOrganizationService _service;
    private readonly ILogger<GetDocumentTypes> _logger;
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public GetDocumentTypes(
    ILogger<GetDocumentTypes> logger,
    TenantResolverService tenantResolver,
    TenantDataverseService tenantDataverseService)
    {
        _logger = logger;
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetDocumentTypes")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "GetDocumentTypes")]
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


            var query = new QueryExpression("ilx_documenttype")
            {
                ColumnSet = new ColumnSet(
                    "ilx_name",
                    "ilx_description",
                    "ilx_baseaiprompt",
                    "ilx_enablecompare",
                    "ilx_enablescoring",
                    "ilx_enablesummarise",
                    "statecode",
                    "createdon",
                    "modifiedon"
                )
            };

            TenantQueryHelper.AddTenantFilter(query, tenant.TenantRecordId.ToString());

            var results = service.RetrieveMultiple(query);

            var list = results.Entities.Select(e => new
            {
                id = e.Id,
                name = e.GetAttributeValue<string>("ilx_name"),
                description = e.GetAttributeValue<string>("ilx_description"),
                baseAiPrompt = e.GetAttributeValue<string>("ilx_baseaiprompt"),
                enableCompare = e.GetAttributeValue<bool?>("ilx_enablecompare") ?? false,
                enableScoring = e.GetAttributeValue<bool?>("ilx_enablescoring") ?? false,
                enableSummarise = e.GetAttributeValue<bool?>("ilx_enablesummarise") ?? false,
                isActive = (e.GetAttributeValue<OptionSetValue>("statecode")?.Value ?? 0) == 0,
                createdOn = e.GetAttributeValue<DateTime?>("createdon"),
                modifiedOn = e.GetAttributeValue<DateTime?>("modifiedon")
            });

            var response = req.CreateResponse(HttpStatusCode.OK);
            await response.WriteStringAsync(JsonSerializer.Serialize(list));

            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex.ToString());

            var response = req.CreateResponse(HttpStatusCode.InternalServerError);
            await response.WriteStringAsync(ex.Message);

            return response;
        }
    }
}
