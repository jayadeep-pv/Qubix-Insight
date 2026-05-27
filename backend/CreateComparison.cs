using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class CreateComparison
{

    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;
    private readonly ILogger _logger;

    public CreateComparison(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService,
        ILoggerFactory loggerFactory)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
        _logger = loggerFactory.CreateLogger<CreateComparison>();
    }

    [Function("CreateComparison")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req)
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

        var body = await JsonSerializer.DeserializeAsync<JsonElement>(req.Body);

        if (!body.TryGetProperty("comparisonRunId", out var runIdProp) ||
            !Guid.TryParse(runIdProp.GetString(), out var runId))
        {
            return await BadRequest(req, "comparisonRunId required");
        }

        /* =====================================================
         * 1. Load Run (NOW INCLUDING MODE)
         * ===================================================== */
        var run = service.Retrieve(
            "ilx_analysisrun",
            runId,
            new ColumnSet("ilx_analysis", "ilx_mode"));

        if (run == null)
            return await BadRequest(req, "Comparison run not found");

        var modeOption = run.GetAttributeValue<OptionSetValue>("ilx_mode");
        var mode = modeOption?.Value ?? 1; // Default to Compare if null

        /* =====================================================
         * 2. Load Documents
         * ===================================================== */
        var docsQuery = new QueryExpression("ilx_analysisdocument")
        {
            ColumnSet = new ColumnSet("ilx_name")
        };

        docsQuery.Criteria.AddCondition(
            "ilx_analysisrun",
            ConditionOperator.Equal,
            runId);

        var docs = service.RetrieveMultiple(docsQuery).Entities;

        /* =====================================================
         * 3. Validate Document Count Based on Mode
         * ===================================================== */
        if (mode == 1 && docs.Count < 2) // Compare
            return await BadRequest(req, "At least 2 documents required for comparison");

        if (mode == 2 && docs.Count < 1) // Summarise
            return await BadRequest(req, "At least 1 document required for summarisation");

        /* =====================================================
         * 4. Create Candidates (ONLY IN COMPARE MODE)
         * ===================================================== */
        if (mode == 1) // Compare mode
        {
            int index = 1;

            foreach (var doc in docs)
            {
                var candidate = new Entity("ilx_analysiscandidate");
                candidate["ilx_analysisrun"] =
                    new EntityReference("ilx_analysisrun", runId);
                candidate["ilx_candidateindex"] = index++;
                candidate["ilx_label"] = doc.GetAttributeValue<string>("ilx_name");
                candidate["ilx_tenantid"] = tenant.TenantRecordId.ToString();

                service.Create(candidate);
            }
        }

        /* =====================================================
         * 5. Response
         * ===================================================== */
        var response = req.CreateResponse(HttpStatusCode.OK);

        if (mode == 1)
            await response.WriteStringAsync("Comparison candidates created");
        else
            await response.WriteStringAsync("Summarise run validated");

        return response;
    }

    static async Task<HttpResponseData> BadRequest(HttpRequestData req, string msg)
{
    var r = req.CreateResponse(HttpStatusCode.BadRequest);
    await r.WriteStringAsync(msg);
    return r;
}
}
