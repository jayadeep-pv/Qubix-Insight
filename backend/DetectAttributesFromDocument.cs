using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions
{
    public class DetectAttributesFromDocument
    {
        private readonly ILogger _logger;
        private readonly AzureOcrService _ocrService;
        private readonly AiSummaryService _aiService;
        private readonly TenantResolverService _tenantResolver;
        private readonly TenantDataverseService _tenantDataverseService;

        public DetectAttributesFromDocument(
            ILogger<DetectAttributesFromDocument> logger,
            AzureOcrService ocrService,
            AiSummaryService aiService,
            TenantResolverService tenantResolver,
            TenantDataverseService tenantDataverseService)
        {
            _logger = logger;
            _ocrService = ocrService;
            _aiService = aiService;
            _tenantResolver = tenantResolver;
            _tenantDataverseService = tenantDataverseService;
        }

        // ── Clause-mode heuristic ─────────────────────────────────────────────
        // If the detected document context contains any of these words, the AI
        // returns full clause text for legal provisions rather than short values.
        // No hardcoded field lists — the AI decides what to extract based on its
        // own knowledge of the document type.
        private static readonly string[] ClauseKeywords =
        {
            "agreement", "contract", "lease", "deed", "tenancy",
            "licence", "license", "terms", "policy", "nda", "covenant"
        };

        private static bool IsClauseMode(string context) =>
            ClauseKeywords.Any(w => context.ToLower().Contains(w));

        [Function("DetectAttributesFromDocument")]
        public async Task<HttpResponseData> Run(
            [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req)
        {
            try
            {
                _logger.LogInformation("DetectAttributesFromDocument triggered");

                // ── Query params ───────────────────────────────────────────────
                var contextOverride  = req.Query["context"];
                var templateIdParam  = req.Query["templateId"];

                // ── Tenant ─────────────────────────────────────────────────────
                var tenantKey = req.Headers.TryGetValues("X-Tenant-Key", out var vals)
                    ? vals.FirstOrDefault() : null;

                // ── Read file ──────────────────────────────────────────────────
                byte[] fileBytes;
                using (var ms = new MemoryStream())
                {
                    await req.Body.CopyToAsync(ms);
                    fileBytes = ms.ToArray();
                }

                if (fileBytes == null || fileBytes.Length == 0)
                {
                    var bad = req.CreateResponse(HttpStatusCode.BadRequest);
                    await bad.WriteStringAsync("File is required");
                    return bad;
                }

                // ── OCR ────────────────────────────────────────────────────────
                var ocrResult = await _ocrService.ExtractTextWithAnchorsAsync(fileBytes);
                var extractedText = ocrResult?.FullText;

                if (string.IsNullOrWhiteSpace(extractedText))
                {
                    var bad = req.CreateResponse(HttpStatusCode.BadRequest);
                    await bad.WriteStringAsync("Could not extract text from document");
                    return bad;
                }

                // =============================================================
                // PASS 1 — CONTEXT DETECTION
                // Fast, cheap: first 1,000 chars only.
                // Skipped when caller supplies ?context= override.
                // =============================================================
                string documentContext;

                if (!string.IsNullOrWhiteSpace(contextOverride))
                {
                    documentContext = contextOverride.Trim();
                    _logger.LogInformation($"Context override: {documentContext}");
                }
                else
                {
                    var snippet = extractedText.Length > 1000
                        ? extractedText.Substring(0, 1000)
                        : extractedText;

                    var contextPrompt = $@"Read the following document excerpt and respond with ONLY a 2-5 word document type label.
Examples: commercial lease, employment contract, non-disclosure agreement, loan agreement, invoice, service agreement.
Do NOT include explanations, punctuation, or extra words. Just the label.

Document excerpt:
{snippet}";

                    var rawContext = await _aiService.RunPromptAsync(contextPrompt);
                    documentContext = rawContext?.Trim().Trim('"').Trim() ?? "document";
                    _logger.LogInformation($"Detected context: {documentContext}");
                }

                // =============================================================
                // FETCH TEMPLATE ATTRIBUTES (if templateId supplied)
                // These become the "configured fields" section of the prompt.
                // =============================================================
                var configuredAttributes = new List<TemplateAttributeRecord>();
                string templateAiPrompt = null;

                if (!string.IsNullOrWhiteSpace(templateIdParam) &&
                    !string.IsNullOrWhiteSpace(tenantKey))
                {
                    try
                    {
                        var tenant  = _tenantResolver.ResolveTenant(tenantKey);
                        var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

                        // Fetch template record (for its TemplateAiPrompt)
                        if (Guid.TryParse(templateIdParam, out var templateGuid))
                        {
                            try
                            {
                                var template = service.Retrieve(
                                    "ilx_analysistemplate",
                                    templateGuid,
                                    new ColumnSet("ilx_templateaiprompt", "ilx_name"));

                                templateAiPrompt = template
                                    .GetAttributeValue<string>("ilx_templateaiprompt");
                            }
                            catch { /* template not found — proceed without prompt */ }

                            // Fetch template attributes
                            var attrQuery = new QueryExpression("ilx_templateattribute")
                            {
                                ColumnSet = new ColumnSet(
                                    "ilx_name",
                                    "ilx_displayname",
                                    "ilx_aiextractionhint",
                                    "ilx_displayorder"),
                                Criteria = new FilterExpression()
                            };

                            attrQuery.Criteria.AddCondition(
                                "ilx_analysistemplate",
                                ConditionOperator.Equal,
                                templateGuid);

                            attrQuery.AddOrder("ilx_displayorder", OrderType.Ascending);

                            var attrResults = service.RetrieveMultiple(attrQuery);

                            configuredAttributes = attrResults.Entities.Select(e => new TemplateAttributeRecord
                            {
                                Name        = e.GetAttributeValue<string>("ilx_displayname")
                                              ?? e.GetAttributeValue<string>("ilx_name")
                                              ?? "Unknown",
                                ExtractionHint = e.GetAttributeValue<string>("ilx_aiextractionhint") ?? ""
                            }).ToList();

                            _logger.LogInformation(
                                $"Loaded {configuredAttributes.Count} configured attributes from template {templateIdParam}");
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Could not load template attributes — falling back to discovery-only");
                    }
                }

                // =============================================================
                // PASS 2 — HYBRID EXTRACTION
                // If template attributes exist: configured fields + discovery.
                // If no template: pure AI-inferred discovery for document type.
                // =============================================================
                var clauseMode  = IsClauseMode(documentContext);
                // ── Chunk size: 4,000 chars with 10-attribute cap per chunk ──
                // Smaller chunks = shorter AI responses = no mid-JSON truncation.
                // Deduplication later merges results across chunks.
                var extractionText = extractedText.Length > 20000
                    ? extractedText.Substring(0, 20000)
                    : extractedText;

                var chunks      = SplitIntoChunks(extractionText, 4000);
                var allAttributes = new List<DetectedAttribute>();

                foreach (var chunk in chunks)
                {
                    var prompt = BuildPrompt(
                        documentContext,
                        templateAiPrompt,
                        configuredAttributes,
                        clauseMode,
                        chunk);

                    var aiResponse = await _aiService.RunPromptAsync(prompt);

                    _logger.LogInformation("AI RESPONSE START");
                    _logger.LogInformation(aiResponse);
                    _logger.LogInformation("AI RESPONSE END");

                    if (string.IsNullOrWhiteSpace(aiResponse))
                        continue;

                    var cleaned = CleanJson(aiResponse);
                    List<DetectedAttribute> parsed;

                    try
                    {
                        parsed = JsonSerializer.Deserialize<List<DetectedAttribute>>(cleaned,
                            new JsonSerializerOptions
                            {
                                PropertyNameCaseInsensitive = true,
                                NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowReadingFromString
                            }) ?? new List<DetectedAttribute>();
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning("JSON parse failed — attempting salvage then retry");

                        // Try to salvage complete objects from the truncated response first
                        // before spending another AI call on a retry
                        var salvaged = CleanJson(aiResponse ?? "");
                        if (salvaged != "[]")
                        {
                            try
                            {
                                parsed = JsonSerializer.Deserialize<List<DetectedAttribute>>(salvaged,
                                    new JsonSerializerOptions
                                    {
                                        PropertyNameCaseInsensitive = true,
                                        NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowReadingFromString
                                    }) ?? new List<DetectedAttribute>();

                                _logger.LogInformation($"Salvaged {parsed.Count} attributes from truncated response");
                                allAttributes.AddRange(parsed);
                                continue;
                            }
                            catch
                            {
                                // Salvage parse also failed — fall through to AI retry
                            }
                        }

                        // AI retry — send only a compact version of what we received
                        var truncatedPreview = (aiResponse?.Length > 500)
                            ? aiResponse.Substring(0, 500) + "..."
                            : aiResponse;

                        var retryResponse = await _aiService.RunPromptAsync(
                            $"The following is a truncated JSON array. Complete it as a valid JSON array. " +
                            $"Only include objects that were complete in the original. " +
                            $"Return ONLY the JSON array, nothing else.\n\n{truncatedPreview}");

                        try
                        {
                            parsed = JsonSerializer.Deserialize<List<DetectedAttribute>>(
                                CleanJson(retryResponse ?? ""),
                                new JsonSerializerOptions
                                {
                                    PropertyNameCaseInsensitive = true,
                                    NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowReadingFromString
                                }) ?? new List<DetectedAttribute>();
                        }
                        catch
                        {
                            _logger.LogError(ex, "Retry failed — skipping chunk");
                            continue;
                        }
                    }

                    allAttributes.AddRange(parsed);
                }

                // =============================================================
                // MERGE + DEDUPLICATE
                // Keep highest-confidence result per attribute name.
                // =============================================================
                var finalAttributes = allAttributes
                    .GroupBy(a => a.AttributeName?.Trim().ToLower())
                    .Select(g => g.OrderByDescending(a => a.ConfidenceValue).First())
                    .Where(a =>
                        !string.IsNullOrWhiteSpace(a.AttributeName) &&
                        !string.IsNullOrWhiteSpace(a.SampleValueText))
                    .ToList();

                // Mark configured vs discovered based on template attribute names
                var configuredNames = configuredAttributes
                    .Select(c => c.Name.Trim().ToLower())
                    .ToHashSet();

                foreach (var attr in finalAttributes)
                {
                    // isConfigured = true when the AI extracted a field that
                    // matches a template attribute name
                    attr.IsConfigured = configuredNames.Count > 0 &&
                        configuredNames.Contains(attr.AttributeName?.Trim().ToLower() ?? "");
                }

                // =============================================================
                // RESPONSE
                // =============================================================
                var response = req.CreateResponse(HttpStatusCode.OK);
                response.Headers.Add("Content-Type", "application/json; charset=utf-8");
                var serializerOptions = new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                };
                var json = JsonSerializer.Serialize(new
                {
                    documentContext,
                    hasTemplate          = configuredAttributes.Count > 0,
                    configuredFieldCount = configuredAttributes.Count,
                    attributes           = finalAttributes
                }, serializerOptions);
                await response.WriteStringAsync(json);

                return response;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in DetectAttributesFromDocument");
                var error = req.CreateResponse(HttpStatusCode.InternalServerError);
                await error.WriteStringAsync(ex.Message);
                return error;
            }
        }

        // ── Prompt builder ─────────────────────────────────────────────────────
        private string BuildPrompt(
            string documentContext,
            string templateAiPrompt,
            List<TemplateAttributeRecord> configuredAttributes,
            bool clauseMode,
            string chunk)
        {
            var hasTemplate = configuredAttributes.Count > 0;

            var clauseInstruction = clauseMode
                ? "For legal provisions, obligations, restrictions, and clauses — return the FULL clause text as sampleValue, not a summary."
                : "Return concise extracted values.";

            var templatePromptSection = !string.IsNullOrWhiteSpace(templateAiPrompt)
                ? $"\nTemplate guidance from administrator:\n{templateAiPrompt}\n"
                : "";

            string configuredSection;
            if (hasTemplate)
            {
                var fieldLines = string.Join("\n", configuredAttributes.Select((a, i) =>
                {
                    var hint = string.IsNullOrWhiteSpace(a.ExtractionHint)
                        ? ""
                        : $" — {a.ExtractionHint}";
                    return $"{i + 1}. {a.Name}{hint}";
                }));

                configuredSection = $@"
SECTION A — CONFIGURED FIELDS (extract these precisely):
These fields are defined in the template. Extract each one if present.
Set ""isConfigured"": true for all of these.

{fieldLines}

SECTION B — DISCOVERY (extract any additional fields):
After extracting the configured fields above, identify any other business-relevant
fields present in this document that are NOT already covered by Section A.
Set ""isConfigured"": false and ""suggestAddToTemplate"": true for all of these.
";
            }
            else
            {
                configuredSection = $@"
Based on your knowledge of {documentContext} documents, extract all key business-relevant fields.
Set ""isConfigured"": false for all fields.
";
            }

            return $@"You are extracting structured data from a {documentContext}.
{templatePromptSection}
{clauseInstruction}
{configuredSection}
STRICT RULES:
- Return ONLY a valid JSON array — no markdown, no explanations
- Every object must include: attributeName, sampleValue, category, confidence, description, suggestedDataType, isConfigured, suggestAddToTemplate
- suggestedDataType: Text | Date | Currency | Number | Boolean
- confidence: decimal 0–1
- isConfigured: true | false
- suggestAddToTemplate: true | false
- Only extract fields clearly present in the document
- Maximum 10 attributes per response — quality over quantity
- Keep sampleValue and description concise (under 200 characters each)

Document:
{chunk}";
        }

        // ── Helpers ────────────────────────────────────────────────────────────

        private List<string> SplitIntoChunks(string text, int chunkSize)
        {
            var chunks = new List<string>();
            for (int i = 0; i < text.Length; i += chunkSize)
            {
                var length = Math.Min(chunkSize, text.Length - i);
                chunks.Add(text.Substring(i, length));
            }
            return chunks;
        }

        /// <summary>
        /// Extracts a valid JSON array from the AI response, handling three cases:
        ///   1. Clean response  — extract between first [ and last ]
        ///   2. Truncated mid-array — no closing ], salvage complete objects only
        ///   3. Truncated mid-string — close the open string, close the object,
        ///      close the array and attempt parse on salvaged content
        /// </summary>
        private string CleanJson(string input)
        {
            if (string.IsNullOrWhiteSpace(input))
                return "[]";

            input = input.Trim();

            // ── Step 1: strip markdown fences ──────────────────────────────────
            if (input.StartsWith("```"))
            {
                var fence = input.IndexOf('\n');
                if (fence >= 0) input = input.Substring(fence + 1);
                var end = input.LastIndexOf("```");
                if (end > 0) input = input.Substring(0, end);
                input = input.Trim();
            }

            // ── Step 2: locate array bounds ────────────────────────────────────
            var firstBracket = input.IndexOf('[');
            var lastBracket  = input.LastIndexOf(']');

            // Happy path — complete array present
            if (firstBracket >= 0 && lastBracket > firstBracket)
            {
                return input.Substring(firstBracket, lastBracket - firstBracket + 1);
            }

            // ── Step 3: no closing bracket — response was truncated ────────────
            // Salvage every complete object (ends with }) that appeared before truncation.
            if (firstBracket < 0)
                return "[]";

            var partial    = input.Substring(firstBracket + 1).TrimEnd();
            var salvaged   = new System.Text.StringBuilder("[");
            var depth      = 0;
            var inString   = false;
            var escape     = false;
            var objStart   = -1;
            var lastGoodEnd = -1;

            for (int i = 0; i < partial.Length; i++)
            {
                var c = partial[i];

                if (escape)           { escape = false; continue; }
                if (c == '\\' && inString) { escape = true; continue; }
                if (c == '"')         { inString = !inString; continue; }
                if (inString)         { continue; }

                if (c == '{')
                {
                    if (depth == 0) objStart = i;
                    depth++;
                }
                else if (c == '}')
                {
                    depth--;
                    if (depth == 0 && objStart >= 0)
                    {
                        // Complete object found
                        if (salvaged.Length > 1) salvaged.Append(',');
                        salvaged.Append(partial.Substring(objStart, i - objStart + 1));
                        lastGoodEnd = i;
                        objStart    = -1;
                    }
                }
            }

            salvaged.Append(']');
            var result = salvaged.ToString();

            // If we salvaged nothing, return empty array rather than crashing
            return result.Length > 2 ? result : "[]";
        }

        // ── Internal DTOs ──────────────────────────────────────────────────────
        private class TemplateAttributeRecord
        {
            public string Name           { get; set; } = "";
            public string ExtractionHint { get; set; } = "";
        }
    }

    // ── Public response DTO ────────────────────────────────────────────────────
    public class DetectedAttribute
    {
        public string  AttributeName         { get; set; }
        public object  SampleValue           { get; set; }
        public string  Category              { get; set; }
        public object  Confidence            { get; set; }
        public string  Description           { get; set; }
        public string  SuggestedDataType     { get; set; }
        public bool    IsConfigured          { get; set; }
        public bool    SuggestAddToTemplate  { get; set; }

        public string SampleValueText =>
            SampleValue?.ToString() ?? string.Empty;

        public double ConfidenceValue
        {
            get
            {
                if (Confidence == null) return 0;
                if (double.TryParse(Confidence.ToString(), out var result))
                    return result;
                return 0;
            }
        }
    }
}

