using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetRunInsights
{

            private readonly TenantResolverService _tenantResolver;
            private readonly TenantDataverseService _tenantDataverseService;

            public GetRunInsights(
                TenantResolverService tenantResolver,
                TenantDataverseService tenantDataverseService)
                {
                    _tenantResolver = tenantResolver;
                    _tenantDataverseService = tenantDataverseService;
                }

    [Function("GetRunInsights")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get")]
        HttpRequestData req)
    {
        var runIdString =
            System.Web.HttpUtility.ParseQueryString(req.Url.Query)
            .Get("runId");

        if (!Guid.TryParse(runIdString, out var runId))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("Invalid runId.");
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

        var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

        if (!service.IsReady)
        {
            var err = req.CreateResponse(HttpStatusCode.InternalServerError);
            await err.WriteStringAsync("Dataverse connection not ready.");
            return err;
        }

        var query = new QueryExpression("ilx_analysisruninsight")
        {
            ColumnSet = new ColumnSet(
                "ilx_runstatus",
                "ilx_executiontime",
                "ilx_aisummaryjsonoutput",
                "ilx_aiinsightprofile"
            )
        };

        query.Criteria.AddCondition("ilx_analysisrun", ConditionOperator.Equal, runId);
        TenantQueryHelper.AddTenantFilter(query, tenant.TenantRecordId.ToString());

        var results = service.RetrieveMultiple(query);

        var responseData = results.Entities.Select(e =>
{
    var profileRef =
        e.GetAttributeValue<EntityReference>("ilx_aiinsightprofile");

    double? executionTime = null;

    if (e.Attributes.TryGetValue("ilx_executiontime", out var execVal))
    {
        if (execVal is decimal dec)
            executionTime = (double)dec;
        else if (execVal is double dbl)
            executionTime = dbl;
        else if (execVal is int i)
            executionTime = i;
    }

    return new
    {
        insightId = e.Id,
        profileId = profileRef?.Id,
        profileName = profileRef?.Name,
        status =
            e.GetAttributeValue<OptionSetValue>("ilx_runstatus")?.Value,
        executionTime = executionTime,
        output =
            e.GetAttributeValue<string>("ilx_aisummaryjsonoutput")
    };
});

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(responseData);
        return response;
    }
}
