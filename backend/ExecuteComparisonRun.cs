using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using QubixInsight.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services.Domain;
using Azure.Storage.Blobs;
using System.Diagnostics;
using Azure.Identity;
using Azure.Storage.Blobs;

namespace QubixInsight.Functions;

public class ExecuteComparisonRun
{
    private readonly ILogger _logger;
    private readonly AiSummaryService _aiSummaryService;

    private const int MODE_COMPARE         = 857270000;
    private const int MODE_SUMMARISE       = 857270001;
    private const int MODE_SCORE = 857270002;

    private const int USAGE_SUMMARISE_ONLY = 857270000;
    private const int USAGE_COMPARE_ONLY = 857270001;
    private const int USAGE_ALL_MODES = 857270003;
    private const int USAGE_SCORING_ONLY = 857270002;

    // =============================
    // AI Insight Status Values
    // =============================
    private const int INSIGHT_PENDING = 857270000;
    private const int INSIGHT_COMPLETED = 857270001;
    private const int INSIGHT_FAILED = 857270002;

    // =============================
    // AI Scope Values
    // =============================
    private const int SCOPE_STRUCTURED_ONLY = 857270000;
    private const int SCOPE_FULL = 857270001;
    private const int SCOPE_HYBRID = 857270002;

    private readonly AttributeService _attributeService;

    private readonly CompareService _compareService;

    private readonly SummariseService _summariseService;

    private readonly AiInsightsService _aiInsightsService;

    private readonly AzureOcrService _ocrService;

    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;


private (int? Page, string? PolygonJson) FindPosition(
    string value,
    List<(string Text, int Page, IReadOnlyList<float> Polygon)> words,
    string? attributeHint = null)
{
    if (string.IsNullOrWhiteSpace(value) || words == null || !words.Any())
        return (null, null);

    var normalizedValue = NormalizeForAnchorMatch(value);
    var normalizedHint = NormalizeForAnchorMatch(attributeHint ?? "");

    if (string.IsNullOrWhiteSpace(normalizedValue))
        return (null, null);

    // Group by page so we can score nearby lines together
    var byPage = words
        .GroupBy(w => w.Page)
        .Select(g => new
        {
            Page = g.Key,
            Lines = g.Select(x => new
            {
                Text = x.Text ?? "",
                Normalized = NormalizeForAnchorMatch(x.Text ?? ""),
                Polygon = x.Polygon
            }).ToList()
        })
        .ToList();

    int bestPage = 0;
    int bestScore = 0;
    IReadOnlyList<float>? bestPolygon = null;

    foreach (var page in byPage)
    {
        for (int i = 0; i < page.Lines.Count; i++)
        {
            var current = page.Lines[i];

            if (string.IsNullOrWhiteSpace(current.Normalized))
                continue;

            // Build a small OCR context window: previous + current + next
            var windowParts = new List<string>();

            if (i > 0) windowParts.Add(page.Lines[i - 1].Normalized);
            windowParts.Add(current.Normalized);
            if (i < page.Lines.Count - 1) windowParts.Add(page.Lines[i + 1].Normalized);

            var windowText = string.Join(" ", windowParts);

            int score = 0;

            // Strongest signal: exact value on current line
            if (current.Normalized == normalizedValue)
                score += 200;

            // Very strong: current line contains full value
            if (current.Normalized.Contains(normalizedValue))
                score += 160;

            // Strong: nearby window contains full value
            if (windowText.Contains(normalizedValue))
                score += 120;

            // Value similarity
            score += GetAnchorMatchScore(normalizedValue, current.Normalized);
            score += GetAnchorMatchScore(normalizedValue, windowText);

            // Attribute hint similarity
            if (!string.IsNullOrWhiteSpace(normalizedHint))
            {
                score += GetAnchorMatchScore(normalizedHint, current.Normalized);
                score += GetAnchorMatchScore(normalizedHint, windowText) * 2;
            }

            // Numeric fallback
            var cleanedValue = Regex.Replace(normalizedValue, @"[^\d\.]", "");
            if (!string.IsNullOrWhiteSpace(cleanedValue))
            {
                var cleanedCurrent = Regex.Replace(current.Normalized, @"[^\d\.]", "");
                var cleanedWindow = Regex.Replace(windowText, @"[^\d\.]", "");

                if (!string.IsNullOrWhiteSpace(cleanedCurrent) && cleanedCurrent.Contains(cleanedValue))
                    score += 80;

                if (!string.IsNullOrWhiteSpace(cleanedWindow) && cleanedWindow.Contains(cleanedValue))
                    score += 60;
            }

            if (score > bestScore)
            {
                bestScore = score;
                bestPage = page.Page;
                bestPolygon = current.Polygon;
            }
        }
    }

    if (bestScore <= 0)
        return (null, null);

    return (
        bestPage,
        bestPolygon != null && bestPolygon.Count > 0
            ? JsonSerializer.Serialize(bestPolygon)
            : null
    );
}


    public class ExecuteRunRequest
    {
        public Guid ComparisonRunId { get; set; }
        public bool IncludeExecutiveSummary { get; set; }
        public bool IncludeAttributeInsight { get; set; }
    }

    public ExecuteComparisonRun(
        ILoggerFactory loggerFactory,
        AiExtractionService aiExtractionService,
        AiSummaryService aiSummaryService,
        AzureOcrService ocrService,
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)  // 👈 ADD THIS)
    {
        _logger = loggerFactory.CreateLogger<ExecuteComparisonRun>();
         _attributeService = new AttributeService(aiExtractionService);
        _aiSummaryService = aiSummaryService;  // 👈 ADD THIS
        _ocrService = ocrService;
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
        _compareService = new CompareService(
            loggerFactory.CreateLogger<CompareService>(),
            aiSummaryService,
            loggerFactory
        );
        _summariseService = new SummariseService(
            loggerFactory.CreateLogger<SummariseService>(),
            aiSummaryService,
            loggerFactory
        );

        _aiInsightsService = new AiInsightsService(aiSummaryService, loggerFactory);
    }

    [Function("ExecuteComparisonRun")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")]
        HttpRequestData req)
    {
        var totalSw = Stopwatch.StartNew();

        try
        {
            
            _logger.LogInformation("ExecuteComparisonRun started.");

            var aadTenantId = JwtTenantExtractor.GetAadTenantId(req);

            if (string.IsNullOrWhiteSpace(aadTenantId))
            {
                var bad = req.CreateResponse(System.Net.HttpStatusCode.Unauthorized);
                await bad.WriteStringAsync("Unable to determine tenant from Bearer token.");
                return bad;
            }

            var tenant = _tenantResolver.ResolveTenant(aadTenantId);
           

            void LogStage(string stage, Stopwatch sw)
            {
                _logger.LogWarning($"⏱️ TIMER | {stage} | {sw.ElapsedMilliseconds} ms | {sw.Elapsed.TotalSeconds:F2} s");
            }

            var parseBodySw = Stopwatch.StartNew();

            JsonElement body;
            try
            {
                body = await JsonSerializer.DeserializeAsync<JsonElement>(
                    req.Body,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch
            {
                return await BadRequest(req, "Invalid JSON body.");
            }

            if (!body.TryGetProperty("comparisonRunId", out var runProp) ||
                !Guid.TryParse(runProp.GetString(), out var runId))
            {
                return await BadRequest(req, "comparisonRunId is required.");
            }

            // ✅ ADD THIS (nothing removed)
            bool includeExecutiveSummary = false;
            bool includeAttributeInsight = false;

            if (body.TryGetProperty("includeExecutiveSummary", out var execProp))
            {
                includeExecutiveSummary = execProp.GetBoolean();
            }

            if (body.TryGetProperty("includeAttributeInsight", out var attrProp))
            {
                includeAttributeInsight = attrProp.GetBoolean();
            }

            bool includeScoring = true;

            if (body.TryGetProperty("includeScoring", out var scoringProp))
            {
                includeScoring = scoringProp.GetBoolean();
            }

            _logger.LogWarning($"FLAGS → Exec: {includeExecutiveSummary}, Attr: {includeAttributeInsight}, Scoring: {includeScoring}");

            LogStage("Parse request body + flags", parseBodySw);

            var dataverseConnectSw = Stopwatch.StartNew();

            using var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

            if (!service.IsReady)
                throw new Exception("Dataverse connection failed. ServiceClient.IsReady=false");

                LogStage("Dataverse connection", dataverseConnectSw);

            // ============================
            // ✅ STEP 3: Save AI flags to Run
            // ============================

            var saveFlagsSw = Stopwatch.StartNew();

            try
            {                
                
                var runUpdate = new Entity("ilx_analysisrun", runId);

                runUpdate["ilx_includeexecutivesummary"] = includeExecutiveSummary;
                runUpdate["ilx_includeattributeinsight"] = includeAttributeInsight;

                service.Update(runUpdate);

                _logger.LogInformation("AI flags saved to run successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Failed to save AI flags: {ex.Message}");
                // DO NOT STOP EXECUTION

                
            }
            LogStage("Save AI flags to run", saveFlagsSw);
            /* =========================================================
             * 1️⃣ Load Run + Mode
             * ========================================================= */

            var loadRunSw = Stopwatch.StartNew();

            var runLoaderService = new RunLoaderService(service);
            var run = runLoaderService.LoadRun(runId);

            var mode =
                run.GetAttributeValue<OptionSetValue>("ilx_mode")?.Value
                ?? MODE_COMPARE;

            var aiScope =
                run.GetAttributeValue<OptionSetValue>("ilx_aiinsightscope")?.Value
                ?? 857270002; // default Hybrid
            
            bool runExtraction = aiScope == SCOPE_STRUCTURED_ONLY || aiScope == SCOPE_HYBRID;
            bool runAi = aiScope == SCOPE_FULL || aiScope == SCOPE_HYBRID;

            _logger.LogInformation($"Run Mode Value: {mode}");

            // Trial tenants may only run Summarise mode
            if (tenant.IsTrial && mode != MODE_SUMMARISE)
            {
                var forbidden = req.CreateResponse(System.Net.HttpStatusCode.Forbidden);
                await forbidden.WriteStringAsync("Trial accounts can only use Quick Extract. Upgrade to run full comparisons.");
                return forbidden;
            }

            LogStage("Load run + mode + AI scope", loadRunSw);

            /* =========================================================
            * 🔵 Load AI Prompt Layers (Document Type + Template)
            * ========================================================= */
            var promptLayerSw = Stopwatch.StartNew();

            string basePrompt = "";
            string templatePrompt = "";

            // ---- Document Type ----
            var docTypeRef = run.GetAttributeValue<EntityReference>("ilx_documenttype");

            if (docTypeRef != null)
            {
                var docType = service.Retrieve(
                    "ilx_documenttype",
                    docTypeRef.Id,
                    new ColumnSet("ilx_baseaiprompt"));

                basePrompt = docType.GetAttributeValue<string>("ilx_baseaiprompt") ?? "";
            }

            // ---- Template ----
            var templateRef = run.GetAttributeValue<EntityReference>("ilx_analysistemplate");

            if (templateRef != null)
            {
                var template = service.Retrieve(
                    "ilx_analysistemplate",
                    templateRef.Id,
                    new ColumnSet("ilx_templateaiprompt"));

                templatePrompt = template.GetAttributeValue<string>("ilx_templateaiprompt") ?? "";
            }

            _logger.LogInformation("AI Prompt Layers Loaded.");

            LogStage("Load AI prompt layers", promptLayerSw);

            /* =========================================================
             * 2️⃣ Load Documents
             * ========================================================= */

            var loadDocsSw = Stopwatch.StartNew();

            var documentService = new DocumentService(service);
            var docs = documentService.LoadDocuments(runId, tenant.TenantRecordId);

            _logger.LogInformation($"[DEBUG] Docs loaded count: {docs.Count}");

            LogStage("Load documents", loadDocsSw);

            if ((mode == MODE_COMPARE || mode == MODE_SCORE) && docs.Count < 2)
                throw new Exception("At least two documents are required for comparison.");

            if (mode == MODE_SUMMARISE && docs.Count < 1)
                throw new Exception("At least one document is required for summarisation.");

            
            /* =========================================================
             * 3️⃣ HARDENING — Delete Existing Records for this Run
             * ========================================================= */
            var cleanupSw = Stopwatch.StartNew();

            DeleteByRun(service, "ilx_analysisresult", runId);
            DeleteByRun(service, "ilx_analysiscandidate", runId);
            /*  DeleteByRun(service, "ilx_analysisevaluation", runId);*/

            LogStage("Delete existing run records", cleanupSw);

            /* =========================================================
             * 4️⃣ Extract Values (and persist ComparisonResults)
             * ========================================================= */
            
            templateRef = run.GetAttributeValue<EntityReference>("ilx_analysistemplate");

            var loadAttributesSw = Stopwatch.StartNew();

            var attributes = await LoadAttributes(service, templateRef.Id, tenant.TenantRecordId);

            var attributesForMode = attributes.ToList(); // 🔥 DO NOT FILTER HERE

            _logger.LogInformation($"Total attributes loaded: {attributes.Count}");
            _logger.LogInformation($"Attributes used for this mode: {attributesForMode.Count}");

            LogStage("Load template attributes", loadAttributesSw);

            var attributeServiceSw = Stopwatch.StartNew();

            var extracted = await _attributeService.ExtractAttributesAsync(
                service,
                docs,
                attributesForMode,
                basePrompt,
                templatePrompt
            );

            LogStage("AttributeService.ExtractAttributesAsync", attributeServiceSw);

            if (templateRef == null)
            {
                throw new Exception("Comparison template is missing on the run.");
            }

            // Rules are only needed when scoring is enabled — loaded later in the compare-scoring path
            
            foreach (var doc in docs)
            {

                var docSw = Stopwatch.StartNew();
                var docName = doc.GetAttributeValue<string>("ilx_name") ?? doc.Id.ToString();
                
                var blobDownloadSw = Stopwatch.StartNew();

                var fileBytes = await GetDocumentBytesAsync(doc, tenant.BlobContainerName);

                LogStage($"Blob download | {docName}", blobDownloadSw);

                
                var ocrSw = Stopwatch.StartNew();

                string text = "";
                List<(string Text, int Page, IReadOnlyList<float> Polygon)> lines = new();

                // Always run OCR — line coordinates are required for the PDF connector UI.
                // The Dataverse text cache is written on the first run only to avoid
                // redundant updates; it is NOT used to skip OCR.
                var extraction = await _ocrService.ExtractTextWithAnchorsAsync(fileBytes);

                text = extraction.FullText;

                lines = extraction.Pages
                    .SelectMany(p => p.Lines.Select(l =>
                        (
                            Text: l.Text,
                            Page: p.PageNumber,
                            Polygon: l.Polygon != null
                                ? (IReadOnlyList<float>)l.Polygon
                                    .SelectMany(pt => new[] { (float)pt.X, (float)pt.Y })
                                    .ToList()
                                : (IReadOnlyList<float>)new List<float>()
                        )
                    ))
                    .ToList();

                // Trial accounts are limited to the first 5 pages
                if (tenant.IsTrial)
                    lines = lines.Where(l => l.Page <= 5).ToList();

                // Cache text to Dataverse on first run only (memo field, max ~1 MB).
                var existingText = doc.GetAttributeValue<string>("ilx_extractedtext");
                if (string.IsNullOrWhiteSpace(existingText))
                {
                    const int MAX_TEXT_LENGTH = 1_048_576;
                    doc["ilx_extractedtext"] = string.IsNullOrEmpty(text)
                        ? ""
                        : text.Length > MAX_TEXT_LENGTH
                            ? text.Substring(0, MAX_TEXT_LENGTH)
                            : text;
                    service.Update(doc);
                    _logger.LogInformation($"OCR text cached | {docName}");
                }
                else
                {
                    _logger.LogInformation($"OCR ran fresh | {docName} (text already cached, skipping write)");
                }

                LogStage($"OCR extract text + anchors | {docName}", ocrSw);


                if (string.IsNullOrWhiteSpace(text))
                {
                    _logger.LogError($"OCR extraction missing for document: {doc.Id}");
                    throw new Exception($"OCR extraction failed for document {doc.Id} - no text available.");
                }

               var aiExtractSw = Stopwatch.StartNew();

               var extractionService = new ExtractionService(_aiSummaryService);

                var values = await extractionService.ExtractAttributesAsync(
                    text,
                    attributesForMode,
                    basePrompt,
                    templatePrompt
                );

                LogStage($"AI structured extraction | {docName}", aiExtractSw);

                // 🔵 NORMALISE AI EXTRACTION KEYS
                var normalizedValues = new Dictionary<string, object>();

                foreach (var kv in values)
                {
                    var normalizedKey = Normalize(kv.Key);
                    normalizedValues[normalizedKey] = kv.Value;
                }

                values = normalizedValues;



                foreach (var attr in attributesForMode)
{
                    var key = Normalize(attr.GetAttributeValue<string>("ilx_attributekey"));

                    if (!values.ContainsKey(key))
                    {
                        values[key] = "Not Found";
                    }
                }

                // 🔵 STEP 1B: Fallback to structured extraction (SAFE ADD)

                var fallbackExtractSw = Stopwatch.StartNew();


                var structuredValues = ExtractValues(text);

                foreach (var kv in structuredValues)
{
                    var normalizedKey = Normalize(kv.Key);

                    // ✅ ONLY allow keys that exist in template
                    var existsInTemplate = attributesForMode.Any(a =>
                        Normalize(a.GetAttributeValue<string>("ilx_attributekey")) == normalizedKey
                    );

                    if (!existsInTemplate)
                        continue;

                    if (!values.ContainsKey(normalizedKey) || 
                        string.IsNullOrWhiteSpace(values[normalizedKey]?.ToString()))
                    {
                        values[normalizedKey] = kv.Value;
                    }
                }

                LogStage($"Fallback structured extraction merge | {docName}", fallbackExtractSw);

                extracted[doc.Id] = values;
               

                // ✅ STEP 2: SAVE RESULTS (this is the important fix)

                var saveResultsSw = Stopwatch.StartNew();
                int savedResultCount = 0;
                
                foreach (var kv in values)
                    {

                        string valueText = "";

                            if (kv.Value is JsonElement el)
                            {
                                if (el.ValueKind == JsonValueKind.String)
                                    valueText = el.GetString() ?? "";

                                else if (el.ValueKind == JsonValueKind.Null)
                                    valueText = "";

                                else if (el.ValueKind == JsonValueKind.Object)
                                {
                                    foreach (var prop in el.EnumerateObject())
                                    {
                                        if (Normalize(prop.Name) == kv.Key)
                                        {
                                            valueText = prop.Value.ToString();
                                            break;
                                        }
                                    }
                                }
                            }
                            else
                            {
                                valueText = kv.Value?.ToString() ?? "";
                            }

                        decimal confidenceScore = 0.85m;

                        if (string.IsNullOrWhiteSpace(valueText) || valueText == "N/A")
                        {
                            confidenceScore = 0.30m;
                        }
                        else if (valueText.Length < 5)
                        {
                            confidenceScore = 0.60m;
                        }

                        var result = new Entity("ilx_analysisresult");
                       

                        // Name
                        result["ilx_name"] =
                            $"{doc.GetAttributeValue<string>("ilx_name")} - {kv.Key}";

                        // Value
                        result["ilx_normalisedvalue"] =
                            kv.Value != null ? kv.Value.ToString() : "—";

                        int riskLevelValue;

                        // SIMPLE RULES (Phase 1)
                        if (string.IsNullOrWhiteSpace(valueText) || valueText == "N/A")
                        {
                            riskLevelValue = 857270002; // High
                        }
                        else if (valueText.Length < 5)
                        {
                            riskLevelValue = 857270001; // Medium
                        }
                        else
                        {
                            riskLevelValue = 857270000; // Low
                        }

                        // SET FIELD
                        result["ilx_risklevel"] = new OptionSetValue(riskLevelValue);

                        // Document
                        result["ilx_analysisdocument"] = doc.ToEntityReference();

                        // Run
                        result["ilx_analysisrun"] =
                            new EntityReference("ilx_analysisrun", runId);

                        // NEW: find page + polygon before using them

                        result["ilx_confidencescore"] = confidenceScore;



                        // =========================================================
                        // SIMPLE & STABLE POSITION MATCH (LINE-ONLY)
                        // =========================================================

                            var matchedAttrForPosition = attributesForMode.FirstOrDefault(a =>
                                Normalize(a.GetAttributeValue<string>("ilx_attributekey")) == kv.Key
                            );

                            var attributeHintForPosition =
                                matchedAttrForPosition?.GetAttributeValue<string>("ilx_name") ?? kv.Key;

                            var (page, polygonJson) = FindPosition(
                                valueText,
                                lines,
                                attributeHintForPosition
                            );

                        // 🔥 FALLBACK: WORD MATCH (if line fails)
                        // 🚫 DISABLED: Word fallback was causing incorrect page matches
                        if (page == null)
                        {
                            _logger.LogWarning($"❌ No reliable line match found for: {valueText}");
                        }

                        _logger.LogDebug($"POSITION → {kv.Key} | Page: {page}");

                        if (page.HasValue)
                            result["ilx_pagenumber"] = page.Value;
                    

                        if (!string.IsNullOrEmpty(polygonJson))
                            result["ilx_coordinates"] = polygonJson;

                        // ✅ CRITICAL FIX → MATCH ATTRIBUTE PROPERLY
                        var matchedAttr = attributesForMode.FirstOrDefault(a =>
                                Normalize(a.GetAttributeValue<string>("ilx_attributekey")) == kv.Key
                            );
                       
                        if (matchedAttr != null)
                        {
                            result["ilx_templateattribute"] =
                                new EntityReference("ilx_templateattribute", matchedAttr.Id);
                        }

                        result["ilx_tenantid"] = tenant.TenantRecordId.ToString();

                        var resultId = service.Create(result);
                        result.Id = resultId;
                        savedResultCount++;
                    }
                    _logger.LogWarning($"📦 SAVED RESULTS | {docName} | Count: {savedResultCount}");
                    LogStage($"Persist comparison results | {docName}", saveResultsSw);
                    LogStage($"TOTAL document pipeline | {docName}", docSw);



                
            }



            // =========================================================
            // ATTRIBUTE AI EXECUTION (SAFE - OUTSIDE LOOP)
            // =========================================================

            var attributeAiSw = Stopwatch.StartNew();

            if (includeAttributeInsight)
            {
                _logger.LogInformation("Starting Attribute-level AI insights...");
                LogStage("Execute attribute AI insights", attributeAiSw);

                try
                {
                    await ExecuteAttributeAiInsights(
                        service,
                        runId,
                        attributesForMode,
                        docs.ToList(),
                        extracted,
                        mode,
                        tenant.TenantRecordId
                    );
                }
                catch (Exception ex)
                {
                    _logger.LogWarning($"Attribute AI failed: {ex.Message}");
                }
            }
            else
            {
                _logger.LogInformation("Attribute AI skipped (disabled in UI).");
                LogStage("Execute attribute AI insights (skipped)", attributeAiSw);
            }




            /* ========================================================= 
            * 5️⃣ SUMMARISE MODE
            * ========================================================= */
            if (mode == MODE_SUMMARISE)
            {
                

                var summariseSw = Stopwatch.StartNew();

                var summariseResponse  = await _summariseService.ExecuteSummarise(
                    req,
                    service,
                    runId,
                    docs.ToList(),
                    attributesForMode,
                    extracted,
                    aiScope,
                    includeExecutiveSummary,
                    includeAttributeInsight,
                    runExtraction,
                    runAi,
                    tenant.TenantRecordId
                );

                LogStage("SummariseService.ExecuteSummarise", summariseSw);

                // 🔥 SAME JSON SAVE BLOCK HERE

                var runOutput  = new
                {
                    RunId = runId,
                    Mode = "Summarise",
                    Extracted = extracted
                };

                var runUpdateEntity = new Entity("ilx_analysisrun", runId);
                runUpdateEntity["ilx_rawresultjson"] = JsonSerializer.Serialize(runOutput);
                runUpdateEntity["ilx_runstatus"] = new OptionSetValue(857270002);

                service.Update(runUpdateEntity);

                _logger.LogInformation("Run updated with results JSON");

                LogStage("TOTAL ExecuteComparisonRun", totalSw);

                return summariseResponse ;














            }




            /* =========================================================
             * 6️⃣ COMPARE MODE — with or without scoring
             * ========================================================= */

            if (includeScoring)
            {
                var loadRulesSw = Stopwatch.StartNew();

                var rules = LoadRules(service, templateRef.Id, tenant.TenantRecordId);

                var allowedAttributeIds = attributesForMode.Select(a => a.Id).ToHashSet();

                rules = rules
                    .Where(r => allowedAttributeIds.Contains(r.TemplateAttributeId))
                    .ToList();

                LogStage("Load + filter comparison rules", loadRulesSw);

                var compareSw = Stopwatch.StartNew();

                var response = await _compareService.ExecuteCompare(
                    req,
                    service,
                    runId,
                    docs.ToList(),
                    rules,
                    extracted,
                    attributesForMode,
                    includeAttributeInsight,
                    aiScope,
                    tenant.TenantRecordId
                );

                LogStage("CompareService.ExecuteCompare", compareSw);

                var outputScoring = new
                {
                    RunId = runId,
                    Mode = "Compare",
                    Documents = docs.Select(d => new
                    {
                        Id = d.Id,
                        Name = d.GetAttributeValue<string>("ilx_name")
                    }),
                    Extracted = extracted
                };

                var updateRunScoring = new Entity("ilx_analysisrun", runId);
                updateRunScoring["ilx_rawresultjson"] = JsonSerializer.Serialize(outputScoring);
                updateRunScoring["ilx_runstatus"] = new OptionSetValue(857270002);
                service.Update(updateRunScoring);

                _logger.LogInformation("Run updated with results JSON (with scoring)");

                LogStage("TOTAL ExecuteComparisonRun", totalSw);

                return response;
            }
            else
            {
                // Compare without scoring: extraction already saved, no rules/candidates needed
                var outputPlain = new
                {
                    RunId = runId,
                    Mode = "Compare",
                    Documents = docs.Select(d => new
                    {
                        Id = d.Id,
                        Name = d.GetAttributeValue<string>("ilx_name")
                    }),
                    Extracted = extracted
                };

                var updateRunPlain = new Entity("ilx_analysisrun", runId);
                updateRunPlain["ilx_rawresultjson"] = JsonSerializer.Serialize(outputPlain);
                updateRunPlain["ilx_runstatus"] = new OptionSetValue(857270002);
                service.Update(updateRunPlain);

                _logger.LogInformation("Run updated with results JSON (no scoring)");

                try
                {
                    await _aiInsightsService.ExecuteAiInsightsForRun(
                        service, runId, docs, extracted, outputPlain, aiScope, tenant.TenantRecordId);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning($"AI Insights execution failed: {ex.Message}");
                }

                LogStage("TOTAL ExecuteComparisonRun", totalSw);

                var ok = req.CreateResponse(System.Net.HttpStatusCode.OK);
                await ok.WriteAsJsonAsync(outputPlain);
                return ok;
            }



        }
        catch (Exception ex)
        {
            _logger.LogError($"⏱️ TIMER | TOTAL ExecuteComparisonRun FAILED | {totalSw.ElapsedMilliseconds} ms | {totalSw.Elapsed.TotalSeconds:F2} s");

            _logger.LogError($"ExecuteComparisonRun failed: {ex}");

            var error = req.CreateResponse(HttpStatusCode.InternalServerError);
            await error.WriteStringAsync(ex.ToString());
            return error;
        }
    }



    /* ============================= Helpers ============================= */

    private static async Task<HttpResponseData> BadRequest(HttpRequestData req, string msg)
    {
        var r = req.CreateResponse(HttpStatusCode.BadRequest);
        await r.WriteStringAsync(msg);
        return r;
    }

    private static void DeleteByRun(ServiceClient service, string entityName, Guid runId)
    {
        var query = new QueryExpression(entityName)
        {
            ColumnSet = new ColumnSet(false)
        };

        query.Criteria.AddCondition(
            "ilx_analysisrun",
            ConditionOperator.Equal,
            runId);

        var results = service.RetrieveMultiple(query);

        foreach (var entity in results.Entities)
            service.Delete(entityName, entity.Id);
    }

    private static Dictionary<string, object> ExtractValues(string text)
    {
        var d = new Dictionary<string, object>();
        //Match m;

       // m = Regex.Match(
        //    text,
        //    @"(total\s+value|total\s+price|contract\s+value).*?[^\d\s]*([\d,]+)",
          //  RegexOptions.IgnoreCase | RegexOptions.Singleline);

        //if (m.Success)
          //  d["total_price"] = int.Parse(m.Groups[2].Value.Replace(",", ""));

        //m = Regex.Match(
          //  text,
           // @"payment.*?(\d+)\s+days",
            //RegexOptions.IgnoreCase);

        //if (m.Success)
          //  d["payment_terms"] = int.Parse(m.Groups[1].Value);

        //d["vat_included"] = text.Contains("VAT", StringComparison.OrdinalIgnoreCase);

        return d;
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

    var str = input?.ToString()?.ToLowerInvariant();

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

    private static string Normalize(string input)
{
    return (input ?? "")
        .Replace(" ", "")
        .Replace("_", "")
        .ToLowerInvariant();
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
    private static List<ComparisonRule> LoadRules(ServiceClient client, Guid templateId, Guid tenantRecordId)
    {
        var rules = new List<ComparisonRule>();

        /* =========================================
        * 1️⃣ Get Template Attributes for Template
        * ========================================= */
        var attrQuery = new QueryExpression("ilx_templateattribute")
        {
            ColumnSet = new ColumnSet("ilx_attributekey")
        };

        attrQuery.Criteria.AddCondition(
            "ilx_analysistemplate",
            ConditionOperator.Equal,
            templateId
        );

        TenantQueryHelper.AddTenantFilter(attrQuery, tenantRecordId.ToString());

        var attributes = client.RetrieveMultiple(attrQuery).Entities;

        if (!attributes.Any())
            return rules;

        var attributeIds = attributes.Select(a => a.Id).ToArray();

        /* =========================================
        * 2️⃣ Get Rules linked to those attributes
        * ========================================= */
        var ruleQuery = new QueryExpression("ilx_analysisrule")
        {
            ColumnSet = new ColumnSet(
                "ilx_templateattribute",
                "ilx_analysisdirection",
                "ilx_weight")
        };

        ruleQuery.Criteria.AddCondition(
            "ilx_templateattribute",
            ConditionOperator.In,
            attributeIds.Cast<object>().ToArray()
        );

        TenantQueryHelper.AddTenantFilter(ruleQuery, tenantRecordId.ToString());

        foreach (var entity in client.RetrieveMultiple(ruleQuery).Entities)
        {
            var attrRef =
                entity.GetAttributeValue<EntityReference>("ilx_templateattribute");

            if (attrRef == null)
                continue;

            var attr = attributes.FirstOrDefault(a => a.Id == attrRef.Id);

            var key = attr?.GetAttributeValue<string>("ilx_attributekey");

            if (string.IsNullOrWhiteSpace(key))
                continue;

            rules.Add(new ComparisonRule
            {
                RuleId = entity.Id,
                TemplateAttributeId = attrRef.Id,
                AttributeKey = key,
                ComparisonLogic =
                    entity.GetAttributeValue<OptionSetValue>("ilx_analysisdirection")?.Value switch
                    {
                        857270000 => "HigherIsBetter",
                        857270001 => "LowerIsBetter",
                        857270003 => "TrueIsBetter",
                        857270004 => "FalseIsBetter",
                        _ => "Neutral"
                    },
                Weight = entity.GetAttributeValue<int?>("ilx_weight") ?? 0
            });
        }

        return rules;
    }




// =========================================================
// AI INSIGHT EXECUTION LAYER
// =========================================================




    private async Task ExecuteAttributeAiInsights(
    ServiceClient service,
    Guid runId,
    List<Entity> attributes,
    List<Entity> docs,
    Dictionary<Guid, Dictionary<string, object>> extracted,
    int mode,
    Guid tenantRecordId)
    {
        _logger.LogWarning("🔥 ENTERED ExecuteAttributeAiInsights");
        _logger.LogInformation("Starting Attribute AI Insight generation...");

        var overallAiSw = Stopwatch.StartNew();

        var runName = runId.ToString(); // fallback

        try
        {
            var runEntity = service.Retrieve(
                "ilx_analysisrun",
                runId,
                new ColumnSet("ilx_name"));

            runName = runEntity.GetAttributeValue<string>("ilx_name") ?? runName;
        }
        catch
        {
            _logger.LogWarning("Failed to retrieve run name, using fallback.");
        }

        foreach (var attr in attributes)        
        {
            var attrAiSw = Stopwatch.StartNew();

            var attributeName = attr.GetAttributeValue<string>("ilx_name");
            var expectation = attr.GetAttributeValue<string>("ilx_attributenarrative");
            var enableAiInsight = attr.GetAttributeValue<bool?>("ilx_enableaiinsight") ?? true;

            _logger.LogWarning($"➡️ Processing attribute: {attributeName}");

            if (!enableAiInsight)
            {
                _logger.LogInformation($"AI Insight disabled for attribute: {attributeName}");
                continue;
            }

            if (string.IsNullOrWhiteSpace(expectation))
                continue;
            var normalizedKey = Normalize(attr.GetAttributeValue<string>("ilx_attributekey"));

            var candidateValues = new Dictionary<string, string>();

            foreach (var doc in docs)            
            {            
                if (!extracted.ContainsKey(doc.Id))
                    continue;

                var docValues = extracted[doc.Id];

                if (docValues.TryGetValue(normalizedKey, out var val))
                {
                    var docName = doc.GetAttributeValue<string>("ilx_name");
                    candidateValues[docName] = val?.ToString() ?? "—";
                }
            }

            if (!candidateValues.Any())
                continue;

            try
            {
                var serviceAi = new AttributeAiInsightsService(_aiSummaryService, _logger);

                var insight = await serviceAi.GenerateInsight(
                    attributeName,
                    expectation,
                    candidateValues,
                    mode == MODE_COMPARE
                );

                var entity = new Entity("ilx_analysisattributeinsight");
                

                entity["ilx_name"] = $"{runName} - {attributeName}";
                entity["ilx_analysisrun"] = new EntityReference("ilx_analysisrun", runId);
                entity["ilx_templateattribute"] = new EntityReference("ilx_templateattribute", attr.Id);
                entity["ilx_aioutput"] = insight;
                entity["ilx_tenantid"] = tenantRecordId.ToString();
                service.Create(entity);               
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Attribute AI failed for {attributeName}: {ex.Message}");
            }
        }

        _logger.LogWarning($"⏱️ TIMER | TOTAL ExecuteAttributeAiInsights | {overallAiSw.ElapsedMilliseconds} ms | {overallAiSw.Elapsed.TotalSeconds:F2} s");

    }


private async Task<List<Entity>> LoadAttributes(ServiceClient service, Guid templateId, Guid tenantRecordId)
{
    var query = new QueryExpression("ilx_templateattribute")
    {
        ColumnSet = new ColumnSet(
        "ilx_name",
        "ilx_attributekey",
        "ilx_aiextractionhint",
        "ilx_expecteddatatype",
        "ilx_attributenarrative",
        "ilx_usagemode",
        "ilx_enableaiinsight"
    ),
        Criteria =
        {
            Conditions =
            {
                new ConditionExpression(
                    "ilx_analysistemplate",
                    ConditionOperator.Equal,
                    templateId
                )
            }
        }
    };

    TenantQueryHelper.AddTenantFilter(query, tenantRecordId.ToString());

    var result = await service.RetrieveMultipleAsync(query);

    return result.Entities.ToList();
}

private async Task<byte[]> GetDocumentBytesAsync(Entity doc, string containerName)
{
    var blobPath = doc.GetAttributeValue<string>("ilx_blobpath");

    if (string.IsNullOrWhiteSpace(blobPath))
        throw new Exception("Blob path missing on document");

    if (string.IsNullOrWhiteSpace(containerName))
        throw new Exception("Container name missing");

    var blobBaseUrl = Environment.GetEnvironmentVariable("BlobBaseUrl");

    if (string.IsNullOrWhiteSpace(blobBaseUrl))
        throw new Exception("BlobBaseUrl missing");

    var blobService = new BlobServiceClient(
        new Uri(blobBaseUrl),
        new DefaultAzureCredential());

    var container = blobService.GetBlobContainerClient(containerName);

    var blobClient = container.GetBlobClient(blobPath);

    using var stream = new MemoryStream();
    await blobClient.DownloadToAsync(stream);

    return stream.ToArray();
}
private static string NormalizeForAnchorMatch(string input)
{
    if (string.IsNullOrWhiteSpace(input))
        return string.Empty;

    var value = input.Trim().ToLowerInvariant();

    value = value
        .Replace("’", "'")
        .Replace("‘", "'")
        .Replace("“", "\"")
        .Replace("”", "\"")
        .Replace("–", "-")
        .Replace("—", "-");

    value = Regex.Replace(value, @"\s+", " ");
    value = Regex.Replace(value, @"[^\w\s\.\-/%£$€]", "");

    return value.Trim();
}

private static int GetAnchorMatchScore(string source, string candidate)
{
    if (string.IsNullOrWhiteSpace(source) || string.IsNullOrWhiteSpace(candidate))
        return 0;

    var sourceWords = source
        .Split(' ', StringSplitOptions.RemoveEmptyEntries)
        .Where(w => w.Length > 2)
        .Distinct()
        .ToList();

    var candidateWords = candidate
        .Split(' ', StringSplitOptions.RemoveEmptyEntries)
        .Where(w => w.Length > 2)
        .Distinct()
        .ToHashSet();

    if (!sourceWords.Any() || !candidateWords.Any())
        return 0;

    var matchedCount = sourceWords.Count(w => candidateWords.Contains(w));

    return (int)Math.Round((double)matchedCount / sourceWords.Count * 100);
}


}

