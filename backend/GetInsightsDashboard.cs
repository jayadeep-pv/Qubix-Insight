using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Xrm.Sdk;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetInsightsDashboard
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public GetInsightsDashboard(
    TenantResolverService tenantResolver,
    TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetInsightsDashboard")]
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

        /* =============================
           TOTAL INSIGHTS
        ============================== */

        var insightQuery = new QueryExpression("ilx_analysisruninsight")
        {
            ColumnSet = new ColumnSet(false)
        };

        TenantQueryHelper.AddTenantFilter(insightQuery, tenant.TenantRecordId.ToString());
        var totalInsights = service.RetrieveMultiple(insightQuery).Entities.Count;


        /* =============================
           INSIGHTS THIS MONTH
        ============================== */

        var monthQuery = new QueryExpression("ilx_analysisruninsight")
        {
            ColumnSet = new ColumnSet(false)
        };

        monthQuery.Criteria.AddCondition("createdon", ConditionOperator.ThisMonth);
        TenantQueryHelper.AddTenantFilter(monthQuery, tenant.TenantRecordId.ToString());

        var insightsThisMonth = service.RetrieveMultiple(monthQuery).Entities.Count;


        /* =============================
           TOTAL RUNS
        ============================== */

        var runCountQuery = new QueryExpression("ilx_analysisrun")
        {
            ColumnSet = new ColumnSet(false)
        };

        TenantQueryHelper.AddTenantFilter(runCountQuery, tenant.TenantRecordId.ToString());
        var totalRuns = service.RetrieveMultiple(runCountQuery).Entities.Count;


        /* =============================
           ALL RUNS FOR AGGREGATIONS
        ============================== */

        var allRunsQuery = new QueryExpression("ilx_analysisrun")
        {
            ColumnSet = new ColumnSet("createdon", "ilx_mode")
        };

        TenantQueryHelper.AddTenantFilter(allRunsQuery, tenant.TenantRecordId.ToString());
        var allRuns = service.RetrieveMultiple(allRunsQuery).Entities;

        /* =============================
        USAGE (DYNAMIC PERIOD)
        ============================= */

        var queryParams = System.Web.HttpUtility.ParseQueryString(req.Url.Query);
        var period = queryParams["period"] ?? "7d";

        int days = period == "30d" ? 30 : 7;

        var todayLocal = DateTime.Now.Date;
        var startDateLocal = todayLocal.AddDays(-(days - 1));

        var usageCountsByDate = allRuns
            .Where(r => r.Contains("createdon"))
            .Select(r => r.GetAttributeValue<DateTime>("createdon").ToLocalTime().Date)
            .Where(d => d >= startDateLocal && d <= todayLocal)
            .GroupBy(d => d)
            .ToDictionary(g => g.Key, g => g.Count());

        var usageLastPeriod = Enumerable.Range(0, days)
            .Select(offset =>
            {
                var date = startDateLocal.AddDays(offset);
                return new
                {
                    day = days == 7 
                        ? date.ToString("ddd")        // Mon, Tue
                        : date.ToString("dd MMM"),    // 01 Apr, 02 Apr
                    count = usageCountsByDate.ContainsKey(date) ? usageCountsByDate[date] : 0
                };
            })
            .ToList();


        /* =============================
           MODE SPLIT
        ============================== */

        const int MODE_COMPARE = 857270000;
        const int MODE_SUMMARISE = 857270001;
        const int MODE_SCORE = 857270002;

        int compareCount = allRuns.Count(r =>
            r.GetAttributeValue<OptionSetValue>("ilx_mode")?.Value == MODE_COMPARE);

        int summariseCount = allRuns.Count(r =>
            r.GetAttributeValue<OptionSetValue>("ilx_mode")?.Value == MODE_SUMMARISE);


        /* =============================
           TOTAL DOCUMENTS (ALL RUNS)
        ============================== */

        var totalDocsQuery = new QueryExpression("ilx_analysisdocument")
        {
            ColumnSet = new ColumnSet(false)
        };
        TenantQueryHelper.AddTenantFilter(totalDocsQuery, tenant.TenantRecordId.ToString());
        var totalDocs = service.RetrieveMultiple(totalDocsQuery).Entities.Count;

        /* =============================
           HIGH RISK RESULTS (ALL RUNS)
        ============================== */

        var highRiskQuery = new QueryExpression("ilx_analysisresult")
        {
            ColumnSet = new ColumnSet(false)
        };
        TenantQueryHelper.AddTenantFilter(highRiskQuery, tenant.TenantRecordId.ToString());
        highRiskQuery.Criteria.AddCondition("ilx_risklevel", ConditionOperator.Equal, 857270002); // High
        var totalHighRisk = service.RetrieveMultiple(highRiskQuery).Entities.Count;

        /* =============================
           RECENT RUNS
        ============================== */

        var runQuery = new QueryExpression("ilx_analysisrun")
        {
            ColumnSet = new ColumnSet(
                "ilx_name",
                "createdon",
                "ilx_analysis",
                "ilx_documenttype",
                "ilx_executedbyuser",
                "ilx_runstatus",
                "ilx_mode"
            )
        };

        TenantQueryHelper.AddTenantFilter(runQuery, tenant.TenantRecordId.ToString());
        runQuery.TopCount = 8;
        runQuery.AddOrder("createdon", OrderType.Descending);

        /* =============================
           JOIN DOCUMENT TYPE (FIX)
        ============================== */

        var docTypeLink = runQuery.AddLink(
            "ilx_documenttype",
            "ilx_documenttype",
            "ilx_documenttypeid",
            JoinOperator.LeftOuter);

        docTypeLink.Columns = new ColumnSet("ilx_name");
        docTypeLink.EntityAlias = "doctype";

        var runResults = service.RetrieveMultiple(runQuery).Entities;


        /* =============================
           COLLECT RUN IDS
        ============================== */

        var runIds = runResults.Select(r => r.Id).ToList();


        /* =============================
           GET DOCUMENT COUNTS (ONE QUERY)
        ============================== */

        var docCounts = new Dictionary<Guid, int>();

        if (runIds.Any())
        {
            var docQuery = new QueryExpression("ilx_analysisdocument")
            {
                ColumnSet = new ColumnSet("ilx_analysisrun")
            };

            docQuery.Criteria.AddCondition(
                "ilx_analysisrun",
                ConditionOperator.In,
                runIds.Cast<object>().ToArray()
            );

            var docs = service.RetrieveMultiple(docQuery).Entities;

            docCounts = docs
                .GroupBy(d => d.GetAttributeValue<EntityReference>("ilx_analysisrun").Id)
                .ToDictionary(g => g.Key, g => g.Count());
        }


        /* =============================
           GET COMPARISON NAMES
        ============================== */

        var comparisonIds = runResults
            .Select(r => r.GetAttributeValue<EntityReference>("ilx_analysis")?.Id)
            .Where(id => id != null)
            .Distinct()
            .ToList();

        var comparisonNames = new Dictionary<Guid, string>();

        if (comparisonIds.Any())
        {
            var compQuery = new QueryExpression("ilx_analysis")
            {
                ColumnSet = new ColumnSet("ilx_name")
            };

            compQuery.Criteria.AddCondition(
                "ilx_analysisid",
                ConditionOperator.In,
                comparisonIds.Cast<object>().ToArray()
            );

            var comps = service.RetrieveMultiple(compQuery).Entities;

            comparisonNames = comps.ToDictionary(
                c => c.Id,
                c => c.GetAttributeValue<string>("ilx_name")
            );
        }


        /* =============================
           BUILD RESULT
        ============================== */

        var recentRuns = runResults.Select(run =>
        {
            var runId = run.Id;

            var comparisonRef = run.GetAttributeValue<EntityReference>("ilx_analysis");

            string insightName = "";

            if (comparisonRef != null && comparisonNames.ContainsKey(comparisonRef.Id))
                insightName = comparisonNames[comparisonRef.Id];

            if (string.IsNullOrEmpty(insightName))
                insightName = run.GetAttributeValue<string>("ilx_name");

            int documentCount = docCounts.ContainsKey(runId)
                ? docCounts[runId]
                : 0;

            string status = "Completed";

            if (run.FormattedValues.Contains("ilx_runstatus"))
                status = run.FormattedValues["ilx_runstatus"];

            /* =============================
               DOCUMENT TYPE (FIX)
            ============================== */

            string documentType = run.Contains("doctype.ilx_name")
                ? ((AliasedValue)run["doctype.ilx_name"]).Value?.ToString()
                : null;

            string mode = "Compare";
            var modeValue = run.GetAttributeValue<OptionSetValue>("ilx_mode")?.Value;

            if (modeValue == MODE_SUMMARISE)
                mode = "Summarise";
            else if (modeValue == MODE_SCORE)
                mode = "Scoring";

            return new
            {
                id = runId,
                runName = run.GetAttributeValue<string>("ilx_name"),
                insightName = insightName,

                // existing fields kept
                documentType = documentType,
                documentCount = documentCount,

                createdOn = run.GetAttributeValue<DateTime>("createdon"),

                // keep consistent with other APIs
                createdBy = run.GetAttributeValue<string>("ilx_executedbyuser"),

                mode = mode,
                status = status
            };
        });


        /* =============================
           RESPONSE
        ============================== */

        var result = new
        {
            totalInsights = totalInsights,
            insightsThisMonth = insightsThisMonth,
            totalRuns = totalRuns,
            totalDocs = totalDocs,
            totalHighRisk = totalHighRisk,
            usageLast7Days = usageLastPeriod,
            modeSplit = new
            {
                compare = compareCount,
                summarise = summariseCount
            },
            recentRuns = recentRuns
        };

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(result);

        return response;
    }
}
