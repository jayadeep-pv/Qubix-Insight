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

public class GetAllInsights
{

        private readonly TenantResolverService _tenantResolver;
        private readonly TenantDataverseService _tenantDataverseService;

        public GetAllInsights(
            TenantResolverService tenantResolver,
            TenantDataverseService tenantDataverseService)

            {
                _tenantResolver = tenantResolver;
                _tenantDataverseService = tenantDataverseService;
            }

    [Function("GetAllInsights")]
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

        // =============================
        // MAIN QUERY (Comparison Run)
        // =============================
        var query = new QueryExpression("ilx_analysisrun")
        {
            ColumnSet = new ColumnSet(
                "ilx_name",
                "createdon",
                "ilx_runstatus",
                "ilx_executedbyemail",
                "ilx_executedbyuser",
                "ilx_documenttype",
                "ilx_analysis",
                "ilx_mode"
            ),
            TopCount = 1000
        };

        // =============================
        // LINK: Comparison (for name)
        // =============================
        var comparisonLink = query.AddLink(
            "ilx_analysis",
            "ilx_analysis",
            "ilx_analysisid",
            JoinOperator.LeftOuter);

        comparisonLink.Columns = new ColumnSet("ilx_name");
        comparisonLink.EntityAlias = "cmp";

        TenantQueryHelper.AddTenantFilter(query, tenant.TenantRecordId.ToString());
        query.AddOrder("createdon", OrderType.Descending);

        // Enumerate eagerly — avoids lazy N+1 calls during JSON serialization
        var entities = service.RetrieveMultiple(query).Entities.ToList();

        // =============================
        // DOCUMENT COUNTS (single batch query)
        // One FetchXML aggregate replaces N individual sub-queries
        // =============================
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

        // =============================
        // MAP RESULTS (no extra Dataverse calls)
        // =============================
        var runs = entities.Select(r => new
        {
            id = r.Id,

            runName = r.GetAttributeValue<string>("ilx_name"),

            insightName =
                r.Contains("cmp.ilx_name")
                    ? ((AliasedValue)r["cmp.ilx_name"]).Value?.ToString()
                    : "",

            documentType =
                r.GetAttributeValue<EntityReference>("ilx_documenttype")?.Name,

            documentCount = docCounts.TryGetValue(r.Id, out var cnt) ? cnt : 0,

            createdOn = r.GetAttributeValue<DateTime?>("createdon"),

            status = "Completed",

            createdBy =
                r.GetAttributeValue<string>("ilx_executedbyuser")
                ?? r.GetAttributeValue<string>("ilx_executedbyemail"),

            mode = (r.GetAttributeValue<OptionSetValue>("ilx_mode")?.Value) switch
            {
                857270001 => "Summarise",
                857270002 => "Score",
                _         => "Compare"
            }
        });

        var response = req.CreateResponse(HttpStatusCode.OK);

        await response.WriteStringAsync(
            JsonSerializer.Serialize(runs)
        );

        return response;
    }
}

