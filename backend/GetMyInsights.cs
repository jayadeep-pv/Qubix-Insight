using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Xrm.Sdk;
using System.Linq;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetMyInsights
{

    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public GetMyInsights(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
        {
            _tenantResolver = tenantResolver;
            _tenantDataverseService = tenantDataverseService;
        }


    [Function("GetMyInsights")]
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

        /* ======================================
           Get User Email From Header
        ====================================== */

        var userEmail = req.Headers.TryGetValues("x-user-email", out var emailValues)
            ? emailValues.FirstOrDefault()
            : null;

        if (string.IsNullOrEmpty(userEmail))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("User email missing");
            return bad;
        }

        /* ======================================
           Query Runs
        ====================================== */

        var query = new QueryExpression("ilx_analysisrun")
        {
            ColumnSet = new ColumnSet(
                "ilx_name",
                "createdon",
                "ilx_runstatus",
                "ilx_executedbyemail",
                "ilx_executedbyuser",
                "ilx_analysis",
                "ilx_documenttype",
                "ilx_mode"
            ),

            TopCount = 1000
        };

        /* ======================================
           Join Comparison (for Insight Name)
        ====================================== */

        var comparisonLink = query.AddLink(
            "ilx_analysis",
            "ilx_analysis",
            "ilx_analysisid",
            JoinOperator.LeftOuter);

        comparisonLink.Columns = new ColumnSet("ilx_name");
        comparisonLink.EntityAlias = "cmp";

        /* ======================================
           Join Document Type
        ====================================== */

        var docTypeLink = query.AddLink(
        "ilx_documenttype",
        "ilx_documenttype",
        "ilx_documenttypeid",
        JoinOperator.LeftOuter);

        docTypeLink.Columns = new ColumnSet("ilx_name");
        docTypeLink.EntityAlias = "doctype";

        /* ======================================
           Filter by User
        ====================================== */

        query.Criteria.AddCondition("ilx_executedbyemail", ConditionOperator.Equal, userEmail);
        TenantQueryHelper.AddTenantFilter(query, tenant.TenantRecordId.ToString());
        query.AddOrder("createdon", OrderType.Descending);

        // Enumerate eagerly — avoids lazy N+1 calls during JSON serialization
        var entities = service.RetrieveMultiple(query).Entities.ToList();

        /* ======================================
           Document Counts (single batch query)
        ====================================== */

        var docCounts = new Dictionary<Guid, int>();

        try
        {
            const string docCountFetch = @"
<fetch aggregate='true'>
  <entity name='ilx_analysisdocument'>
    <attribute name='ilx_analysisdocumentid' alias='cnt' aggregate='count'/>
    <attribute name='ilx_analysisrun' alias='runid' groupby='true'/>
  </entity>
</fetch>";

            var aggResults = service.RetrieveMultiple(new FetchExpression(docCountFetch));

            foreach (var row in aggResults.Entities)
            {
                if (!row.Contains("runid") || !row.Contains("cnt")) continue;

                var runRef = ((AliasedValue)row["runid"]).Value as EntityReference;
                if (runRef == null) continue;

                docCounts[runRef.Id] = Convert.ToInt32(((AliasedValue)row["cnt"]).Value);
            }
        }
        catch
        {
            // If the aggregate fails, document counts default to 0 — runs still display
        }

        /* ======================================
           Map Results (no extra Dataverse calls)
        ====================================== */

        var runs = entities.Select(r => new
        {
            id = r.Id,

            runName = r.GetAttributeValue<string>("ilx_name"),

            insightName = r.Contains("cmp.ilx_name")
                ? ((AliasedValue)r["cmp.ilx_name"]).Value?.ToString()
                : "",

            documentType =
                r.Contains("doctype.ilx_name")
                    ? ((AliasedValue)r["doctype.ilx_name"]).Value?.ToString()
                    : null,

            documentCount = docCounts.TryGetValue(r.Id, out var cnt) ? cnt : 0,

            createdBy = r.GetAttributeValue<string>("ilx_executedbyuser"),

            createdOn = r.GetAttributeValue<DateTime?>("createdon"),

            status = "Completed",

            mode = (r.GetAttributeValue<OptionSetValue>("ilx_mode")?.Value) switch
            {
                857270001 => "Summarise",
                857270002 => "Score",
                _         => "Compare"
            }
        });

        /* ======================================
           Response
        ====================================== */

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteStringAsync(JsonSerializer.Serialize(runs));

        return response;
    }
}

