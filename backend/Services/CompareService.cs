using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using System.Text.RegularExpressions;
using QubixInsight.Services.Domain;

namespace QubixInsight.Services
{
    public class CompareService
    {
        private readonly ILogger _logger;
        private readonly AiSummaryService _aiSummaryService;
        private readonly AiInsightsService _aiInsightsService;

        public CompareService(
            ILogger<CompareService> logger,
            AiSummaryService aiSummaryService,
            ILoggerFactory loggerFactory)
        {
            _logger = logger;
            _aiSummaryService = aiSummaryService;
            _aiInsightsService = new AiInsightsService(aiSummaryService, loggerFactory);
        }

        private const int INSIGHT_PENDING = 857270000;
        private const int INSIGHT_COMPLETED = 857270001;
        private const int INSIGHT_FAILED = 857270002;

        public async Task<HttpResponseData> ExecuteCompare(
            HttpRequestData req,
            ServiceClient service,
            Guid runId,
            List<Entity> docs,
            List<ComparisonRule> rules,
            Dictionary<Guid, Dictionary<string, object>> extracted,
            List<Entity> attributes,
            bool includeAttributeInsight,
            int aiScope,
            Guid tenantRecordId
            )
        {
                    _logger.LogInformation("Entering Compare Mode");                        

                    var candidateMap = new Dictionary<Guid, Guid>();
                    var candidateScores = new Dictionary<Guid, int>();

                    int index = 1;
                    

                    foreach (var doc in docs)
                    {
                        var candidate = new Entity("ilx_analysiscandidate");

                        candidate["ilx_analysisrun"] =
                            new EntityReference("ilx_analysisrun", runId);

                        candidate["ilx_candidateindex"] = index++;
                        candidate["ilx_label"] = doc.GetAttributeValue<string>("ilx_name");

                        candidate["ilx_analysisdocument"] =
                            new EntityReference("ilx_analysisdocument", doc.Id);

                        candidate["ilx_tenantid"] = tenantRecordId.ToString();

                        var candidateId = service.Create(candidate);

                        candidateMap[doc.Id] = candidateId;
                        candidateScores[doc.Id] = 0;
                    }

                    _logger.LogInformation("Candidates created");

                    var docList = docs.ToList();
                    
                    
                    /* =========================================================
                    * 7️⃣ CREATE EVALUATION + EVALUATION RESULTS
                    * ========================================================= */
                    foreach (var rule in rules)
                    {

                        var evaluation = new Entity("ilx_analysisevaluation");

                        

                        evaluation["ilx_analysisrun"] =
                            new EntityReference("ilx_analysisrun", runId);

                        evaluation["ilx_comparisonlogic"] = rule.ComparisonLogic;

                        var ruleEntity = service.Retrieve(
                            "ilx_analysisrule",
                            rule.RuleId,
                            new ColumnSet("ilx_advisorytext", "ilx_severity")
                        );

                        var advisory =
                            ruleEntity.GetAttributeValue<string>("ilx_advisorytext");

                        evaluation["ilx_advisorytext"] =
                            string.IsNullOrWhiteSpace(advisory)
                                ? $"Evaluation based on {rule.AttributeKey}"
                                : advisory;

                        // ✅ KEEP severity here ONLY
                        var severity = ruleEntity.GetAttributeValue<OptionSetValue>("ilx_severity");

                        if (severity != null)
                        {
                            evaluation["ilx_severity"] = severity;
                        }

                        evaluation["ilx_analysisrule"] =
                            new EntityReference("ilx_analysisrule", rule.RuleId);
        
                        evaluation["ilx_templateattribute"] =
                            new EntityReference("ilx_templateattribute", rule.TemplateAttributeId);

                        evaluation["ilx_weight"] = rule.Weight;

                        evaluation["ilx_tenantid"] = tenantRecordId.ToString();

                        var evaluationId = service.Create(evaluation);

                        var bestDoc = docList
                        .Where(d => extracted.ContainsKey(d.Id) &&
                                    extracted[d.Id].Keys.Any(k => Normalize(k) == Normalize(rule.AttributeKey)))
                        .Select(d => new
                        {
                            Doc = d,
                            Value = extracted[d.Id]
                                .First(kv => Normalize(kv.Key) == Normalize(rule.AttributeKey))
                                .Value
                        })
                        .Where(d => d.Value != null && !string.IsNullOrWhiteSpace(d.Value.ToString()))
                        .ToList();

                        if (!bestDoc.Any())
                            continue;

                        var winners = new List<Guid>();

                        // 1. Find best value
                        var bestValue = bestDoc[0].Value;

                        foreach (var item in bestDoc)
                        {
                            if (Compare(rule.ComparisonLogic, item.Value, bestValue))
                            {
                                bestValue = item.Value;
                            }
                        }

                        // 2. Find all docs matching best value
                        winners = bestDoc
                            .Where(b =>
                                    Normalize(b.Value?.ToString() ?? "") ==
                                    Normalize(bestValue?.ToString() ?? "")
                                )
                            .Select(b => b.Doc.Id)
                            .ToList();

                        // 3. If tie → no winners
                        if (winners.Count > 1)
                        {
                            winners.Clear();
                        }

                        
                        foreach (var doc in docList)
                        {
                            var evaluationResult = new Entity("ilx_analysisevaluationresult");

                            evaluationResult["ilx_analysiscandidate"] =
                                new EntityReference(
                                    "ilx_analysiscandidate",
                                    candidateMap[doc.Id]);

                            evaluationResult["ilx_analysisevaluation"] =
                                new EntityReference(
                                    "ilx_analysisevaluation",
                                    evaluationId);

                            bool isWinner = winners.Contains(doc.Id);

                            evaluationResult["ilx_iswinner"] = isWinner;

                            evaluationResult["ilx_scorecontribution"] =
                                isWinner ? rule.Weight : 0;

                            if (extracted.TryGetValue(doc.Id, out var docExtract))
        {
                                    var matchedKey = docExtract.Keys.FirstOrDefault(k =>
                                        Normalize(k) == Normalize(rule.AttributeKey));

                                    if (matchedKey != null)
                                    {
                                        var rawValue = docExtract[matchedKey];
                                        evaluationResult["ilx_value"] = rawValue?.ToString();
                                    }
                                }

                            evaluationResult["ilx_tenantid"] = tenantRecordId.ToString();

                            service.Create(evaluationResult);
                        }
                    }

                    // =========================================
                    // ✅ FINAL AGGREGATION FROM EVALUATIONRESULT
                    // =========================================

                    // 1. Get evaluations for this run
                    var runEvalQuery = new QueryExpression("ilx_analysisevaluation")
                    {
                        ColumnSet = new ColumnSet("ilx_analysisevaluationid")
                    };

                    runEvalQuery.Criteria.AddCondition(
                        "ilx_analysisrun",
                        ConditionOperator.Equal,
                        runId);

                    TenantQueryHelper.AddTenantFilter(runEvalQuery, tenantRecordId.ToString());

                    var runEvaluations = service.RetrieveMultiple(runEvalQuery).Entities;
                    var evaluationIds = runEvaluations.Select(e => e.Id).Cast<object>().ToArray();

                    if (evaluationIds.Length > 0)
                    {
                        // 2. Get evaluation results linked to those evaluations
                        var evalResultQuery = new QueryExpression("ilx_analysisevaluationresult")
                        {
                            ColumnSet = new ColumnSet(
                                "ilx_scorecontribution",
                                "ilx_analysiscandidate",
                                "ilx_analysisevaluation"
                            )
                        };

                        evalResultQuery.Criteria.AddCondition(
                            "ilx_analysisevaluation",
                            ConditionOperator.In,
                            evaluationIds);

                        var evalResults = service.RetrieveMultiple(evalResultQuery).Entities;

                        var totals = evalResults
                            .Where(e => e.GetAttributeValue<EntityReference>("ilx_analysiscandidate") != null)
                            .GroupBy(e => e.GetAttributeValue<EntityReference>("ilx_analysiscandidate").Id)
                            .ToDictionary(
                                g => g.Key,
                                g => g.Sum(e => e.GetAttributeValue<int?>("ilx_scorecontribution") ?? 0)
                            );

                        var maxTotalScore = totals.Any() ? totals.Values.Max() : 0;

                        foreach (var kvp in totals)
                        {
                            var update = new Entity("ilx_analysiscandidate", kvp.Key);
                            update["ilx_totalscore"] = kvp.Value;
                            update["ilx_iswinner"] = (kvp.Value == maxTotalScore);
                            service.Update(update);
                        }
                    }

                    /* =========================================================
                    * 8️⃣ UPDATE RUN STATUS + STORE SUMMARY JSON
                    * ========================================================= */

                    var candidatesFinalQuery = new QueryExpression("ilx_analysiscandidate")
        {
            ColumnSet = new ColumnSet(
                "ilx_label",
                "ilx_totalscore",
                "ilx_iswinner"
            )
        };

        candidatesFinalQuery.Criteria.AddCondition(
            "ilx_analysisrun",
            ConditionOperator.Equal,
            runId
        );

        TenantQueryHelper.AddTenantFilter(candidatesFinalQuery, tenantRecordId.ToString());

        var finalCandidates = service.RetrieveMultiple(candidatesFinalQuery).Entities;

        var winner = finalCandidates
            .OrderByDescending(c => c.GetAttributeValue<int?>("ilx_totalscore") ?? 0)
            .FirstOrDefault();


        var summaryObject = new
        {
            mode = "Compare",
            winner = winner != null ? new
            {
                label = winner.GetAttributeValue<string>("ilx_label"),
                score = winner.GetAttributeValue<int?>("ilx_totalscore") ?? 0
            } : null,
            candidates = finalCandidates.Select(c => new
            {
                label = c.GetAttributeValue<string>("ilx_label"),
                score = c.GetAttributeValue<int?>("ilx_totalscore") ?? 0
            }),

            totalRules = rules.Count,
            documentsProcessed = docs.Count
        };

                    var updateRunCompare = new Entity("ilx_analysisrun", runId);

                    // ✅ FIXED VALUE — Completed = 857270002
                    updateRunCompare["ilx_runstatus"] = new OptionSetValue(857270002);

                    updateRunCompare["ilx_rawresultjson"] =
                        JsonSerializer.Serialize(summaryObject);

                    service.Update(updateRunCompare);

                
                    // =============================
                    // AI Insight Execution Layer
                    // =============================
                    await _aiInsightsService.ExecuteAiInsightsForRun(
                        service,
                        runId,
                        docs,
                        extracted,
                        summaryObject,
                        aiScope,
                        tenantRecordId);
                    

                    var compareResponse = req.CreateResponse(HttpStatusCode.OK);
                    var candidatesQuery = new QueryExpression("ilx_analysiscandidate")
                    {
                        ColumnSet = new ColumnSet(
                            "ilx_label",
                            "ilx_totalscore",
                            "ilx_iswinner"
                        )
                    };

                    candidatesQuery.Criteria.AddCondition(
                        "ilx_analysisrun",
                        ConditionOperator.Equal,
                        runId
                    );

                    TenantQueryHelper.AddTenantFilter(candidatesQuery, tenantRecordId.ToString());

                    var candidates = service.RetrieveMultiple(candidatesQuery).Entities;

                    await compareResponse.WriteAsJsonAsync(new
                    {
                        runId,
                        mode = "Compare",
                        documentsProcessed = docs.Count,
                        candidates = candidates.Select(c => new
                        {
                            label = c.GetAttributeValue<string>("ilx_label"),
                            totalScore = c.GetAttributeValue<int?>("ilx_totalscore") ?? 0,
                            isWinner = c.GetAttributeValue<bool?>("ilx_iswinner") ?? false
                        }),
                        message = "Comparison completed successfully"
                    });

                    return compareResponse;
        }    

        private static string Normalize(string input)
        {
            return (input ?? "")
                .Replace(" ", "")
                .Replace("_", "")
                .ToLowerInvariant();
        }

        private static bool Compare(string logic, object a, object b)
        {
            var normalized =
                (logic ?? string.Empty)
                .Replace(" ", "")
                .Replace("_", "")
                .ToLowerInvariant();

            // Try DATE first
            if (TryParseDate(a, out var aDate) && TryParseDate(b, out var bDate))
            {
                return normalized switch
                {
                    "higherisbetter" => aDate > bDate,
                    "lowerisbetter" => aDate < bDate,
                    _ => false
                };
            }

            // Try NUMBER / MONEY / YEARS
            if (TryParseDecimalSafe(a, out var aNum) &&
                TryParseDecimalSafe(b, out var bNum))
            {
                return normalized switch
                {
                    "higherisbetter" => aNum > bNum,
                    "lowerisbetter" => aNum < bNum,
                    _ => false
                };
            }

            // Try BOOLEAN
            if (TryParseBool(a, out var aBool) &&
                TryParseBool(b, out var bBool))
            {
                return normalized switch
                {
                    "trueisbetter" => aBool && !bBool,
                    "falseisbetter" => !aBool && bBool,
                    _ => false
                };
            }

            return false;
        }

        private static bool TryParseDate(object input, out DateTime value)
        {
            value = DateTime.MinValue;

            if (input == null) return false;

            var str = input.ToString();

            return DateTime.TryParse(str, out value);
        }

        private static bool TryParseBool(object input, out bool value)
        {
            value = false;

            if (input == null) return false;

            var str = input?.ToString()?.ToLowerInvariant() ?? "";

            if (str == "true" || str == "yes" || str == "1")
            {
                value = true;
                return true;
            }

            if (str == "false" || str == "no" || str == "0")
            {
                value = false;
                return true;
            }

            return false;
        }

        private static bool TryParseDecimalSafe(object input, out decimal value)
        {
            value = 0;

            if (input == null) return false;

            var str = input.ToString();

            if (string.IsNullOrWhiteSpace(str)) return false;

            // Extract number (handles £, commas, years, etc.)
            var cleaned = Regex.Match(str, @"-?\d+(\.\d+)?").Value;

            return decimal.TryParse(cleaned, out value);
        }

}

}
