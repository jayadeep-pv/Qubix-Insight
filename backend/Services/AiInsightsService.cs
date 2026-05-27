using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

using Microsoft.Extensions.Logging;

using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

using QubixInsight.Services; // 🔥 IMPORTANT (for AiSummaryService)

        public class AiInsightsService
        {
            private readonly ILogger _logger;
            private readonly AiSummaryService _aiSummaryService;

            private const int INSIGHT_PENDING = 857270000;
            private const int INSIGHT_COMPLETED = 857270001;
            private const int INSIGHT_FAILED = 857270002;

            public AiInsightsService(
                AiSummaryService aiSummaryService,
                ILoggerFactory loggerFactory)
            {
                _aiSummaryService = aiSummaryService;
                _logger = loggerFactory.CreateLogger<AiInsightsService>();
            }



            public async Task ExecuteAiInsightsForRun(
                    ServiceClient service,
                    Guid runId,
                    IEnumerable<Entity> docs,
                    Dictionary<Guid, Dictionary<string, object>> extracted,
                    object comparisonSummary,
                    int aiScope,
                    Guid tenantRecordId)
                {
                    try
                    {
                        _logger.LogInformation("Starting AI Insight execution...");
                        var insightQuery = new QueryExpression("ilx_analysisruninsight")
                {
                    ColumnSet = new ColumnSet(
                        "ilx_aiinsightprofile",
                        "ilx_runstatus")
                };

                insightQuery.Criteria.AddCondition(
                    "ilx_analysisrun",
                    ConditionOperator.Equal,
                    runId);

                insightQuery.Criteria.AddCondition(
                    "ilx_runstatus",
                    ConditionOperator.Equal,
                    INSIGHT_PENDING);

                TenantQueryHelper.AddTenantFilter(insightQuery, tenantRecordId.ToString());

                var pendingInsights =
                service.RetrieveMultiple(insightQuery).Entities;

                if (!pendingInsights.Any())
                {
                    _logger.LogInformation("No pending insights found for this run.");
                    return;
                }

                // ============================
                // ✅ ADD THIS BLOCK HERE
                // ============================
                var run = service.Retrieve(
                    "ilx_analysisrun",
                    runId,
                    new ColumnSet("ilx_includeexecutivesummary"));

                var includeExec = run.GetAttributeValue<bool?>("ilx_includeexecutivesummary") ?? false;

                if (!includeExec)
                {
                    _logger.LogInformation("Skipping AI Insights — disabled on run.");
                    return;
                }
                

                // Build shared context
                var fullText = string.Join("\n\n",
                    docs.Select(d =>
                        d.GetAttributeValue<string>("ilx_extractedtext") ?? ""));

                var firstExtract =
                    extracted.Values.FirstOrDefault()
                    ?? new Dictionary<string, object>();

                var comparisonContext =
                    JsonSerializer.Serialize(comparisonSummary);

                foreach (var insightRecord in pendingInsights)
                {
                    var profileRef =
                        insightRecord.GetAttributeValue<EntityReference>(
                            "ilx_aiinsightprofile");

                    if (profileRef == null)
                        continue;

                    var profile = service.Retrieve(
                        "ilx_aiinsightprofile",
                        profileRef.Id,
                        new ColumnSet("ilx_prompt"));

                    var profilePrompt =
                        profile.GetAttributeValue<string>("ilx_prompt") ?? "";

                    var insightId = insightRecord.Id;

                    var stopwatch = System.Diagnostics.Stopwatch.StartNew();

                    try
                    {

                        var scopeInstruction = aiScope switch
                        {
                            857270000 => @"
                        AI SCOPE: Structured Only
                        Use ONLY the extracted structured data and comparison summary.
                        Do NOT raise additional clauses/risks outside configured parameters.
                        ",

                            857270001 => @"
                        AI SCOPE: Full Document Context
                        Analyse the entire document text and identify material risks and observations,
                        even if not present in extracted structured data.
                        ",

                            _ => @"
                        AI SCOPE: Hybrid (Recommended)
                        Analyse the entire document text.
                        Prioritise the extracted structured data as the configured evaluation points.
                        Also identify additional material risks not captured in the extracted structured data.
                        "
                        };
                                        var layeredPrompt = $@"
                        DOCUMENT TEXT:
                        {fullText}

                        EXTRACTED DATA:
                        {JsonSerializer.Serialize(firstExtract)}

                        COMPARISON SUMMARY:
                        {comparisonContext}

                        PROFILE INSTRUCTION:
                        {profilePrompt}

                        {scopeInstruction}

                        IMPORTANT:
                        Return a valid JSON object in the structure below.

                        Do not include markdown formatting.
                        Do not wrap in code blocks.

                        If unsure, still return the JSON structure with best possible values.
                        Do not leave the response empty.

                        {{
                        ""executiveSummary"": ""clear executive overview of the document(s)"", 
                        ""keyInsights"": [
                            {{
                            ""title"": ""short insight heading"",
                            ""impact"": ""High | Medium | Low"",
                            ""description"": ""clear explanation of the risk, advantage, or observation""
                            }}
                        ],
                        ""confidenceLevel"": 0.0
                        }}

                        Rules:
                        - keyInsights MUST be an array of structured objects (NOT strings).
                        - Every insight MUST include: title, impact, description.
                        - impact must be exactly one of: High, Medium, Low.
                        - If no major issues exist, still return at least one Low impact insight.
                        - confidenceLevel must be a number between 0 and 1.
                        ";

                        var aiExec =
                            await _aiSummaryService.GenerateRawPromptAsync(layeredPrompt);
                       
                        stopwatch.Stop();

                        var update = new Entity(
                            "ilx_analysisruninsight",
                            insightId);

                        var aiContent = aiExec.Content;

                        if (string.IsNullOrWhiteSpace(aiContent))
                        {
                            aiContent = JsonSerializer.Serialize(new
                            {
                                executiveSummary = "AI did not return a response.",
                                keyInsights = new object[0],
                                confidenceLevel = 0
                            });
                        }

                        update["ilx_aisummaryjsonoutput"] = aiContent;
                        update["ilx_prompttokens"] = aiExec.PromptTokens;
                        update["ilx_completiontokens"] = aiExec.CompletionTokens;
                        update["ilx_tokenusage"] = aiExec.TotalTokens;
                        update["ilx_modelname"] = aiExec.Model;
                        update["ilx_executiontime"] = stopwatch.Elapsed.TotalSeconds;
                        update["ilx_runstatus"] =
                            new OptionSetValue(INSIGHT_COMPLETED);

                        service.Update(update);
                    }
                    catch (Exception ex)
                    {
                        stopwatch.Stop();

                        var update = new Entity(
                            "ilx_analysisruninsight",
                            insightId);

                        update["ilx_executiontime"] =
                            stopwatch.Elapsed.TotalSeconds;

                        update["ilx_runstatus"] =
                            new OptionSetValue(INSIGHT_FAILED);

                        update["ilx_errormessage"] =
                            ex.ToString();

                        service.Update(update);
                    }
                }

                _logger.LogInformation("AI Insight execution completed.");
            }
            catch (Exception ex)
            {
                _logger.LogError($"AI Insight layer crashed: {ex}");
            }
        }









}
