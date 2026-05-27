using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk.Query;
using System.Net;
using QubixInsight.Services;

public class GetAiInsightProfiles
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public GetAiInsightProfiles(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetAiInsightProfiles")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get")] HttpRequestData req)
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

        var query = new QueryExpression("ilx_aiinsightprofile")
        {
            ColumnSet = new ColumnSet("ilx_name")
        };

        query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        query.Criteria.AddCondition("ilx_profilestatus", ConditionOperator.Equal, 857270001); // Active
        TenantQueryHelper.AddTenantFilter(query, tenant.TenantRecordId.ToString());

        var results = service.RetrieveMultiple(query);

        var response = req.CreateResponse(HttpStatusCode.OK);

        await response.WriteAsJsonAsync(
            results.Entities.Select(e => new
            {
                id = e.Id,
                name = e.GetAttributeValue<string>("ilx_name")
            }));

        return response;
    }
}
