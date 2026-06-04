using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Extensions.Logging;
using System.Net;
using System.Text.Json;
using QubixInsight.Services;

public class GetAttributeCategories
{
    private readonly ILogger<GetAttributeCategories> _logger;
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public GetAttributeCategories(
        ILogger<GetAttributeCategories> logger,
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _logger = logger;
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetAttributeCategories")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "GetAttributeCategories")]
        HttpRequestData req)
    {
        try
        {
            // 🔹 Resolve Tenant (same as your existing APIs)
            var aadTenantId = JwtTenantExtractor.GetAadTenantId(req);

            if (string.IsNullOrWhiteSpace(aadTenantId))
            {
                var bad = req.CreateResponse(System.Net.HttpStatusCode.Unauthorized);
                await bad.WriteStringAsync("Unable to determine tenant from Bearer token.");
                return bad;
            }

            var tenant = _tenantResolver.ResolveTenant(aadTenantId);
            var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

            // 🔹 Query Attribute Categories
            var query = new QueryExpression("ilx_attributecategory")
            {
                ColumnSet = new ColumnSet(
                    "ilx_name",
                    "ilx_categorykey",
                    "ilx_description",
                    "ilx_displayorder",
                    "statecode",
                    "createdon",
                    "modifiedon"
                )
            };

            // 🔹 Only Active
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            TenantQueryHelper.AddTenantFilter(query, tenant.TenantRecordId.ToString());

            // 🔹 Sort Order
            query.AddOrder("ilx_displayorder", OrderType.Ascending);

            var results = service.RetrieveMultiple(query);

            var list = results.Entities.Select(e => new
            {
                id = e.Id,
                name = e.GetAttributeValue<string>("ilx_name"),
                key = e.GetAttributeValue<string>("ilx_categorykey"),
                description = e.GetAttributeValue<string>("ilx_description"),
                displayOrder = e.GetAttributeValue<int?>("ilx_displayorder") ?? 0,
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
