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

namespace QubixInsight.Services
{
    public class SummariseService
    {
        private readonly ILogger _logger;
        private readonly AiSummaryService _aiSummaryService;

        private readonly AiInsightsService _aiInsightsService;

        public SummariseService(
            ILogger<SummariseService> logger,
            AiSummaryService aiSummaryService,
            ILoggerFactory loggerFactory)
        {
            _logger = logger;
            _aiSummaryService = aiSummaryService;
            _aiInsightsService = new AiInsightsService(aiSummaryService, loggerFactory);
        }        

        private const int SCOPE_STRUCTURED_ONLY = 857270000;
        private const int SCOPE_FULL = 857270001;
        private const int SCOPE_HYBRID = 857270002;


        // =============================
        // AI Insight Status Values
        // =============================
        private const int INSIGHT_PENDING = 857270000;
        private const int INSIGHT_COMPLETED = 857270001;
        private const int INSIGHT_FAILED = 857270002;

        public  async Task<HttpResponseData> ExecuteSummarise(
            HttpRequestData req,
            ServiceClient service,
            Guid runId,
            List<Entity> docs,
            List<Entity> attributes,
            Dictionary<Guid, Dictionary<string, object>> extracted,
            int aiScope,
            bool includeExecutiveSummary,
            bool includeAttributeInsight,
            bool runExtraction,
            bool runAi,
            Guid tenantRecordId)
        {
            _logger.LogInformation("Entering Summarise Mode (profile-driven)");
                        
                        // docs will typically be 1, but we support 1+
                        var fullText = string.Join("\n\n",
                            docs.Select(d => d.GetAttributeValue<string>("ilx_extractedtext") ?? ""));

                        // Build a simple summary object for context
                        var summariseSummaryObject = new
                        {
                            mode = "Summarise",
                            documentsProcessed = docs.Count,
                            documents = docs.Select(d => new
                            {
                                documentId = d.Id,
                                name = d.GetAttributeValue<string>("ilx_name")
                            })
                        };

                        /* =========================================================
                        * 🔥 NEW: CONTROL EXECUTION BASED ON AI SCOPE
                        * ========================================================= */

                        var scopeValue = aiScope;

                        runExtraction =
                            scopeValue == SCOPE_STRUCTURED_ONLY ||
                            scopeValue == SCOPE_HYBRID;

                        runAi =
                            scopeValue == SCOPE_FULL ||
                            scopeValue == SCOPE_HYBRID;

                        
                        _logger.LogInformation($"Scope: {scopeValue}, RunExtraction: {runExtraction}, RunAI: {runAi}");

                        /* =========================================================
                        * 🧩 STRUCTURED EXTRACTION (WE WILL RETURN THIS)
                        * ========================================================= */

                        // 🔥 THIS IS THE KEY ADD
                        


                        var resultQuery = new QueryExpression("ilx_analysisresult")
                        {
                            ColumnSet = new ColumnSet(
                                "ilx_normalisedvalue",
                                "ilx_templateattribute",
                                "ilx_analysisattributeinsight"
                            )
                        };

                        resultQuery.Criteria.AddCondition(
                            "ilx_analysisrun",
                            ConditionOperator.Equal,
                            runId);

                        TenantQueryHelper.AddTenantFilter(resultQuery, tenantRecordId.ToString());

                        var results = service.RetrieveMultiple(resultQuery).Entities;

                        var attributeOutput = results                           
                            .Select(r =>
                            {
                                var attrRef = r.GetAttributeValue<EntityReference>("ilx_templateattribute");

                                var attr = attrRef != null
                                    ? attributes.FirstOrDefault(a => a.Id == attrRef.Id)
                                    : null;

                                var attributeName =
                                    attr?.GetAttributeValue<string>("ilx_name") ??
                                    r.GetAttributeValue<string>("ilx_name") ??   // fallback to stored name
                                    "Unknown";

                                var rawValue = r.GetAttributeValue<string>("ilx_normalisedvalue");

                                return new
                                {
                                    attributeName = attributeName,
                                    value = CleanJsonValue(rawValue) ?? "",
                                    attributeAiInsight = r.GetAttributeValue<string>("ilx_analysisattributeinsight")
                                };
                            })
                            .ToList<dynamic>();
                        


                        foreach (var doc in docs)
                        {
                            if (!extracted.ContainsKey(doc.Id)) continue;

                            var docExtract = extracted[doc.Id];

                            foreach (var kv in docExtract)
                            {
                                var key = kv.Key;
                                var value = kv.Value?.ToString();

                                if (string.IsNullOrWhiteSpace(value)) continue;

                                var exists = attributeOutput.Any(a =>
                                    Normalize(a.attributeName) == Normalize(key)
                                );

                                if (!exists)
                                {
                                    attributeOutput.Add(new
                                    {
                                        attributeName = key,
                                        value = value,
                                        attributeAiInsight = (string?)null
                                    });
                                }
                            }
                        }





                        /* =========================================================
                        * 🤖 AI INSIGHTS (CONTROLLED BY UI)
                        * ========================================================= */

                        if (runAi && includeExecutiveSummary)
                        {
                            _logger.LogInformation("Executing AI Insight generation (Executive Summary enabled)...");

                            try
                            {
                                await _aiInsightsService.ExecuteAiInsightsForRun(
                                    service,
                                    runId,
                                    docs,
                                    extracted,
                                    summariseSummaryObject,
                                    aiScope,
                                    tenantRecordId
                                );
                            }
                            catch (Exception ex)
                            {
                                _logger.LogWarning($"AI Insight execution failed: {ex.Message}");
                            }
                        }
                        else
                        {
                            _logger.LogInformation("AI Insight execution skipped (disabled in UI or scope).");
                        }

                        /* =========================================================
                        * ✅ FINAL RUN UPDATE
                        * ========================================================= */

                        var updateRun = new Entity("ilx_analysisrun", runId);

                        updateRun["ilx_runstatus"] = new OptionSetValue(857270002); // Completed
                        updateRun["ilx_rawresultjson"] = JsonSerializer.Serialize(summariseSummaryObject);

                        service.Update(updateRun);

                        /* =========================================================
                        * 🚀 RETURN RESPONSE (NOW WITH ATTRIBUTES)
                        * ========================================================= */

                        var response = req.CreateResponse(HttpStatusCode.OK);
                        await response.WriteAsJsonAsync(new
                        {
                            runId,
                            mode = "Summarise",
                            documentsProcessed = docs.Count,
                            runExtraction,
                            runAi,
                            attributes = attributeOutput,   // 🔥 THIS FIXES YOUR UI
                            message = "Summarisation completed with selected analysis options"
                        });

                        return response;
        }      

            private static string Normalize(string input)
            {
                return (input ?? "")
                    .Replace(" ", "")
                    .Replace("_", "")
                    .ToLowerInvariant();
            }


           private static string CleanJsonValue(string raw)
{
    if (string.IsNullOrWhiteSpace(raw))
        return "";

    raw = raw.Trim();

    try
    {
        // 🔥 Convert fragment → valid JSON object
        var json = "{" + raw.Trim().TrimEnd(',') + "}";

        using var doc = JsonDocument.Parse(json);

        var root = doc.RootElement;

        if (root.ValueKind == JsonValueKind.Object)
        {
            var prop = root.EnumerateObject().FirstOrDefault();

            if (prop.Value.ValueKind == JsonValueKind.Null)
                return "";

            if (prop.Value.ValueKind == JsonValueKind.String)
                return prop.Value.GetString() ?? "";

            return prop.Value.ToString();
        }
    }
    catch
    {
        // If parsing fails, return empty (no hacks)
        return "";
    }

    return "";
}



    }


}
