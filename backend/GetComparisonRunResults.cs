using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Models;
using System.Text.Json;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetComparisonRunResults
{

    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public GetComparisonRunResults(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetComparisonRunResults")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get")]
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

            var queryParams = System.Web.HttpUtility.ParseQueryString(req.Url.Query);
            var runIdString = queryParams["comparisonRunId"];

            if (string.IsNullOrEmpty(runIdString))
                return BadRequest(req, "comparisonRunId is required.");

            if (!Guid.TryParse(runIdString, out var runId))
                return BadRequest(req, "Invalid comparisonRunId.");

            var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

            if (!service.IsReady)
                throw new Exception("Dataverse connection failed.");

            var orgName = service.ConnectedOrgUniqueName;

            /* =========================================================
             * 1️⃣ Load Run
             * ========================================================= */

            var run = service.Retrieve(
                "ilx_analysisrun",
                runId,
                new ColumnSet("ilx_name", "ilx_mode", "ilx_rawresultjson", "ilx_executedbyuser", "createdon", "ilx_analysis"));

            var modeValue =
                run.GetAttributeValue<OptionSetValue>("ilx_mode")?.Value ?? 857270000;

            var rawSummaryJson =
                run.GetAttributeValue<string>("ilx_rawresultjson");


            var comparisonRef =
                run.GetAttributeValue<EntityReference>("ilx_analysis");

            string comparisonName = null;

            if (comparisonRef != null)
            {
                var comparison = service.Retrieve(
                    comparisonRef.LogicalName,
                    comparisonRef.Id,
                    new ColumnSet("ilx_name")
                );

                comparisonName = comparison.GetAttributeValue<string>("ilx_name");
            }

            var modeText = modeValue == 857270001 ? "Summarise" : "Compare";

            /* =========================================================
             * 2️⃣ Load Candidates
             * ========================================================= */

            var candidateQuery = new QueryExpression("ilx_analysiscandidate")
            {
                ColumnSet = new ColumnSet(
                    "ilx_label",
                    "ilx_totalscore",
                    "ilx_iswinner",
                    "ilx_analysisdocument")
            };

            candidateQuery.Criteria.AddCondition("ilx_analysisrun", ConditionOperator.Equal, runId);
            TenantQueryHelper.AddTenantFilter(candidateQuery, tenant.TenantRecordId.ToString());

            var candidateEntities =
                service.RetrieveMultiple(candidateQuery).Entities;

            var candidateDtos = new List<CandidateDto>();
            var documentMap = new Dictionary<Guid, Guid>();

            foreach (var c in candidateEntities)
            {
                candidateDtos.Add(new CandidateDto
                {
                    Id = c.Id,
                    Label = c.GetAttributeValue<string>("ilx_label"),
                    TotalScore = c.GetAttributeValue<int?>("ilx_totalscore") ?? 0,
                    IsWinner = c.GetAttributeValue<bool?>("ilx_iswinner") ?? false
                });

                var docRef =
                    c.GetAttributeValue<EntityReference>("ilx_analysisdocument");

                if (docRef != null)
                    documentMap[docRef.Id] = c.Id;
            }

            var candidateIds = candidateEntities
                .Select(c => c.Id)
                .Cast<object>()
                .ToArray();

            /* =========================================================
             * 3️⃣ Load Evaluation Results
             * ========================================================= */

            var evaluationDtos = new List<EvaluationDto>();

            if (candidateIds.Length > 0)
            {
                var evalQuery = new QueryExpression("ilx_analysisevaluationresult")
                {
                    ColumnSet = new ColumnSet(
                        "ilx_scorecontribution",
                        "ilx_analysiscandidate",
                        "ilx_analysisevaluation",
                        "ilx_iswinner")
                };

                evalQuery.Criteria.AddCondition(
                    "ilx_analysiscandidate",
                    ConditionOperator.In,
                    candidateIds);

                var evalEntities =
                    service.RetrieveMultiple(evalQuery).Entities;

              foreach (var e in evalEntities)
                {
                    var evaluationRef =
                        e.GetAttributeValue<EntityReference>("ilx_analysisevaluation");

                    if (evaluationRef == null) continue;

                    // 🔧 Add ilx_analysisrule to columnset so we can fallback to rule advisory text
                    var evaluation = service.Retrieve(
                        "ilx_analysisevaluation",
                        evaluationRef.Id,
                        new ColumnSet(
                            "ilx_templateattribute",
                            "ilx_severity",
                            "ilx_advisorytext",
                            "ilx_analysisrule"
                        ));

                    string attributeName = "Attribute";

                    var attrRef =
                        evaluation.GetAttributeValue<EntityReference>("ilx_templateattribute");

                    if (attrRef != null)
                    {
                        var attr = service.Retrieve(
                            "ilx_templateattribute",
                            attrRef.Id,
                            new ColumnSet("ilx_name"));

                        attributeName =
                            attr.GetAttributeValue<string>("ilx_name") ?? "Attribute";
                    }

                    var severityOption =
                        evaluation.GetAttributeValue<OptionSetValue>("ilx_severity");

                    string severityColor = severityOption?.Value switch
                    {
                        857270000 => "green",
                        857270001 => "amber",
                        857270002 => "red",
                        _ => "green"
                    };

                    // ✅ Advisory text (Evaluation first)
                    var advisoryText =
                        evaluation.GetAttributeValue<string>("ilx_advisorytext");

                    // ✅ Fallback: if advisory text is actually stored on the Rule record
                    if (string.IsNullOrWhiteSpace(advisoryText))
                    {
                        var ruleRef =
                            evaluation.GetAttributeValue<EntityReference>("ilx_analysisrule"); 
                            // ^ adjust schema name if your lookup is named differently

                        if (ruleRef != null)
                        {
                            var rule = service.Retrieve(
                                ruleRef.LogicalName,
                                ruleRef.Id,
                                new ColumnSet("ilx_advisorytext"));

                            var ruleText = rule.GetAttributeValue<string>("ilx_advisorytext");
                            if (!string.IsNullOrWhiteSpace(ruleText))
                                advisoryText = ruleText;
                        }
                    }

                            // ✅ Now build DTO (no inline declarations inside initializer)
                            evaluationDtos.Add(new EvaluationDto
                            {
                                CandidateId =
                                    e.GetAttributeValue<EntityReference>("ilx_analysiscandidate")?.Id,
                                EvaluationId = evaluationRef.Id,
                                Score =
                                    e.GetAttributeValue<int?>("ilx_scorecontribution") ?? 0,
                                IsWinner =
                                    e.GetAttributeValue<bool?>("ilx_iswinner") ?? false,
                                AttributeName = attributeName,
                                AdvisoryText = advisoryText ?? string.Empty,
                                SeverityColor = severityColor
                            });
                }
            }

            /* =========================================================
             * 4️⃣ Load Comparison Results
             * ========================================================= */

            var attributeDtos = new List<AttributeDto>();

            var resultQuery = new QueryExpression("ilx_analysisresult")
            {
                ColumnSet = new ColumnSet(
                    "ilx_analysisdocument",
                    "ilx_templateattribute",
                    "ilx_normalisedvalue",
                    "ilx_risklevel",
                    "ilx_coordinates",
                    "ilx_pagenumber",
                    "ilx_confidencescore",
                    "ilx_analysisattributeinsight")
            };

            resultQuery.Criteria.AddCondition("ilx_analysisrun", ConditionOperator.Equal, runId);
            TenantQueryHelper.AddTenantFilter(resultQuery, tenant.TenantRecordId.ToString());

            var comparisonResults =
                service.RetrieveMultiple(resultQuery).Entities;

            // =========================================================
            // 🔥 LOAD ATTRIBUTE AI FROM NEW TABLE
            // =========================================================

            var aiQuery = new QueryExpression("ilx_analysisattributeinsight")
            {
                ColumnSet = new ColumnSet(
                    "ilx_templateattribute",
                    "ilx_aioutput"
                )
            };

            aiQuery.Criteria.AddCondition("ilx_analysisrun", ConditionOperator.Equal, runId);
            TenantQueryHelper.AddTenantFilter(aiQuery, tenant.TenantRecordId.ToString());

            var aiRecords = service.RetrieveMultiple(aiQuery).Entities;

            // Map: AttributeId → AI Output
            var aiMap = aiRecords
                .Where(a => a.Contains("ilx_templateattribute"))
                .ToDictionary(
                    a => a.GetAttributeValue<EntityReference>("ilx_templateattribute").Id,
                    a => a.GetAttributeValue<string>("ilx_aioutput")
                );

            if (comparisonResults.Any())
            {
                var templateAttributeIds = comparisonResults
                    .Where(r => r.Contains("ilx_templateattribute"))
                    .Select(r =>
                        r.GetAttributeValue<EntityReference>("ilx_templateattribute")?.Id)
                    .Where(id => id != null)
                    .Distinct()
                    .Cast<Guid>()
                    .ToList();

                var templateNameMap = new Dictionary<Guid, string>();

                if (templateAttributeIds.Any())
                {
                    var templateQuery = new QueryExpression("ilx_templateattribute")
                    {
                        ColumnSet = new ColumnSet("ilx_name")
                    };

                    templateQuery.Criteria.AddCondition(
                        "ilx_templateattributeid",
                        ConditionOperator.In,
                        templateAttributeIds.Cast<object>().ToArray());

                    var templateEntities =
                        service.RetrieveMultiple(templateQuery).Entities;

                    foreach (var t in templateEntities)
                        templateNameMap[t.Id] =
                            t.GetAttributeValue<string>("ilx_name") ?? "Attribute";
                }

                var grouped = comparisonResults
                    .Where(r => r.Contains("ilx_templateattribute"))
                    .GroupBy(r =>
                        r.GetAttributeValue<EntityReference>("ilx_templateattribute")?.Id);

                foreach (var group in grouped)
                {
                    var attrId = group.Key ?? Guid.Empty;

                    var firstRecord = group.First();

                    var riskLabel = firstRecord.FormattedValues.Contains("ilx_risklevel")
                        ? firstRecord.FormattedValues["ilx_risklevel"]
                        : null;

                    var attributeDto = new AttributeDto
                        {
                            AttributeId = attrId,
                            AttributeName = templateNameMap.ContainsKey(attrId)
                                ? templateNameMap[attrId]
                                : "Attribute",

                            RiskLevel = riskLabel, // 🔥 ADD THIS LINE

                            Values = new List<AttributeValueDto>()
                        };

                    foreach (var r in group)
                    {
                        var attrRef = r.GetAttributeValue<EntityReference>("ilx_templateattribute");
                        var docId =
                            r.GetAttributeValue<EntityReference>("ilx_analysisdocument")?.Id;

                        Guid? candidateId = null;

                        if (docId != null && documentMap.ContainsKey(docId.Value))
                            candidateId = documentMap[docId.Value];

                        attributeDto.Values.Add(new AttributeValueDto
                        {
                            CandidateId = candidateId,
                            DocumentId = docId,
                            Value = r.GetAttributeValue<string>("ilx_normalisedvalue"),

                            AttributeAiInsight =
                                aiMap.ContainsKey(attrId)
                                    ? aiMap[attrId]
                                    : null,

                            // ✅ ADD THESE TWO
                            Coordinates = r.GetAttributeValue<string>("ilx_coordinates"),
                            PageNumber = r.GetAttributeValue<int?>("ilx_pagenumber"),

                            // ✅ ADD THIS LINE ONLY
                            ConfidenceScore = r.Contains("ilx_confidencescore")
                                ? r.GetAttributeValue<decimal?>("ilx_confidencescore")
                                : null
                        });
                    }

                    attributeDtos.Add(attributeDto);
                }
            }

            /* =========================================================
 * 5️⃣ Load Documents (WITH OCR TEXT)
 * ========================================================= */

var documentDtos = new List<DocumentDto>();

var docQuery = new QueryExpression("ilx_analysisdocument")
{
    ColumnSet = new ColumnSet(
        "ilx_name",
        "ilx_documentname",
        "ilx_blobpath",
        "ilx_extractedtext"
    )
};

docQuery.Criteria.AddCondition("ilx_analysisrun", ConditionOperator.Equal, runId);
TenantQueryHelper.AddTenantFilter(docQuery, tenant.TenantRecordId.ToString());

var docEntities = service.RetrieveMultiple(docQuery).Entities;

var blobBaseUrl = Environment.GetEnvironmentVariable("BlobBaseUrl");

var storageAccount = Environment.GetEnvironmentVariable("STORAGE_ACCOUNT_NAME");

if (string.IsNullOrWhiteSpace(blobBaseUrl))
    throw new Exception("BlobBaseUrl missing");

foreach (var d in docEntities)
{
    var blobPath = d.GetAttributeValue<string>("ilx_blobpath");
    var containerName = tenant.BlobContainerName;

    documentDtos.Add(new DocumentDto
    {
        Id = d.Id,
        Name = d.GetAttributeValue<string>("ilx_documentname"),
        BlobPath = blobPath,
        ExtractedText = d.GetAttributeValue<string>("ilx_extractedtext"),

        DocumentUrl = string.IsNullOrEmpty(blobPath)
            ? null
            : $"{blobBaseUrl}/{containerName}/{blobPath}"
            });
        }


            var response = req.CreateResponse(HttpStatusCode.OK);


            /* =========================================================
            * 6️⃣ Get Executed By User (REAL USER)
            * ========================================================= */

            var executedByName = run.GetAttributeValue<string>("ilx_executedbyuser");
            var createdOn = run.GetAttributeValue<DateTime?>("createdon");


                var resultDto = new ComparisonRunResultDto
{
                    RunId = runId,
                    Mode = modeText,

                    CreatedBy = executedByName,
                    CreatedOn = createdOn,

                    InsightName = comparisonName,
                    RunName = run.GetAttributeValue<string>("ilx_name") ?? "",

                    Candidates = candidateDtos,
                    Attributes = attributeDtos,
                    Evaluations = evaluationDtos,
                    Documents = documentDtos,
                    SummaryJson = string.IsNullOrWhiteSpace(rawSummaryJson)
                        ? null
                        : JsonSerializer.Deserialize<object>(rawSummaryJson),

                    DebugOrg = orgName
                };

            await response.WriteAsJsonAsync(resultDto);

            return response;
        }
        catch (Exception ex)
        {
            var error = req.CreateResponse(HttpStatusCode.InternalServerError);
            await error.WriteStringAsync(ex.ToString());
            return error;
        }
    }

    static HttpResponseData BadRequest(HttpRequestData req, string msg)
    {
        var r = req.CreateResponse(HttpStatusCode.BadRequest);
        r.WriteString(msg);
        return r;
    }
}
