using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using QubixInsight.Models;
using QubixInsight.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System.Collections.Generic;

namespace QubixInsight.Functions
{
    public class AskRunQuestion
    {
        private readonly ILogger _logger;
        private readonly AiSummaryService _aiSummaryService;
        private readonly TenantResolverService _tenantResolver;
        private readonly TenantDataverseService _tenantDataverseService;

        public AskRunQuestion(
            ILogger<AskRunQuestion> logger,
            AiSummaryService aiSummaryService,
            TenantResolverService tenantResolver,
            TenantDataverseService tenantDataverseService)
        {
            _logger = logger;
            _aiSummaryService = aiSummaryService;
            _tenantResolver = tenantResolver;
            _tenantDataverseService = tenantDataverseService;
        }

        [Function("AskRunQuestion")]
        public async Task<HttpResponseData> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req)
        {
            try
            {
                var requestBody = await new StreamReader(req.Body).ReadToEndAsync();

                var request = JsonSerializer.Deserialize<AskRunQuestionRequest>(
                    requestBody,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (request == null ||
                    string.IsNullOrWhiteSpace(request.RunId) ||
                    string.IsNullOrWhiteSpace(request.Question))
                {
                    var bad = req.CreateResponse(HttpStatusCode.BadRequest);
                    await bad.WriteStringAsync("RunId and Question are required.");
                    return bad;
                }

                if (!Guid.TryParse(request.RunId, out var runId))
                {
                    var bad = req.CreateResponse(HttpStatusCode.BadRequest);
                    await bad.WriteStringAsync("Invalid RunId.");
                    return bad;
                }

                _logger.LogInformation($"AskRunQuestion → RunId: {runId}");

                var aadTenantId = JwtTenantExtractor.GetAadTenantId(req);
                if (string.IsNullOrWhiteSpace(aadTenantId))
                {
                    var unauth = req.CreateResponse(HttpStatusCode.Unauthorized);
                    await unauth.WriteStringAsync("Unable to determine tenant from Bearer token.");
                    return unauth;
                }

                var tenant = _tenantResolver.ResolveTenant(aadTenantId);
                var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

                if (!service.IsReady)
                {
                    var err = req.CreateResponse(HttpStatusCode.InternalServerError);
                    await err.WriteStringAsync("Dataverse connection failed.");
                    return err;
                }

                // 🔹 Load documents
                var docQuery = new QueryExpression("ilx_analysisdocument")
                {
                    ColumnSet = new ColumnSet("ilx_name", "ilx_extractedtext")
                };
                docQuery.Criteria.AddCondition("ilx_analysisrun", ConditionOperator.Equal, runId);
                TenantQueryHelper.AddTenantFilter(docQuery, tenant.TenantRecordId.ToString());

                var docs = service.RetrieveMultiple(docQuery).Entities;

                if (docs == null || !docs.Any())
                {
                    var notFound = req.CreateResponse(HttpStatusCode.NotFound);
                    await notFound.WriteStringAsync("No documents found for this run.");
                    return notFound;
                }

                // 🔹 Load structured attribute data
                var attrQuery = new QueryExpression("ilx_analysisresult")
                {
                    ColumnSet = new ColumnSet("ilx_name", "ilx_normalisedvalue")
                };
                attrQuery.Criteria.AddCondition("ilx_analysisrun", ConditionOperator.Equal, runId);
                TenantQueryHelper.AddTenantFilter(attrQuery, tenant.TenantRecordId.ToString());

                var attributes = service.RetrieveMultiple(attrQuery).Entities;

                // 🔹 Build prompt
                var prompt = BuildPrompt(docs, attributes, request.Question);

                _logger.LogInformation("Sending prompt to AI...");

                var ai = await _aiSummaryService.GenerateRawPromptAsync(prompt);

                var cleaned = CleanAiResponse(ai?.Content);
                cleaned = NormalizeAnswerKeys(cleaned);

                var ok = req.CreateResponse(HttpStatusCode.OK);
                
                object parsedAnswer;

                try
                {
                    parsedAnswer = JsonSerializer.Deserialize<object>(cleaned);
                }
                catch
                {
                    parsedAnswer = cleaned;
                }

                await ok.WriteAsJsonAsync(new { answer = parsedAnswer });

                return ok;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "AskRunQuestion failed");

                var err = req.CreateResponse(HttpStatusCode.InternalServerError);
                await err.WriteStringAsync(ex.Message);
                return err;
            }
        }

        // 🔥 HYBRID PROMPT BUILDER (FIXED)
        private string BuildPrompt(
            IEnumerable<Entity> docs,
            IEnumerable<Entity> attributes,
            string question)
        {
            var sb = new StringBuilder();

            sb.AppendLine("You are an expert reviewing property documents.");
            sb.AppendLine("Use BOTH structured data and document context to answer.");
            sb.AppendLine("If information is not found, say: Not found in the provided documents.");
            sb.AppendLine();

            // ================================
            // ✅ STRUCTURED DATA
            // ================================
            sb.AppendLine("STRUCTURED DATA:");

            var fieldKeys = new List<string>();

            foreach (var attr in attributes)
            {
                var name = attr.GetAttributeValue<string>("ilx_name");
                var value = attr.GetAttributeValue<string>("ilx_normalisedvalue");

                if (!string.IsNullOrWhiteSpace(name))
                {
                    var key = name.ToLower().Replace(" ", "_");
                    fieldKeys.Add(key);

                    if (!string.IsNullOrWhiteSpace(value))
                    {
                        sb.AppendLine($"{key}: {value}");
                    }
                }
            }

            // ================================
            // 🔥 FIELD CONTROL
            // ================================
            sb.AppendLine();
            sb.AppendLine("VALID FIELD NAMES (use ONLY these IF relevant):");
            sb.AppendLine(string.Join(", ", fieldKeys));

            sb.AppendLine();
            sb.AppendLine("IMPORTANT: The output JSON keys MUST exactly match this list:");
            sb.AppendLine(string.Join(", ", fieldKeys));

            // ================================
            // 📄 DOCUMENT CONTEXT
            // ================================
            sb.AppendLine();
            sb.AppendLine("DOCUMENT CONTEXT:");

            foreach (var d in docs)
            {
                var name = d.GetAttributeValue<string>("ilx_name") ?? "Document";
                var text = d.GetAttributeValue<string>("ilx_extractedtext") ?? "";

                var relevant = ExtractRelevantSections(text, question);

                if (string.IsNullOrWhiteSpace(relevant))
                {
                    relevant = Trim(text, 4000);
                }

                sb.AppendLine($"DOCUMENT: {name}");
                sb.AppendLine(relevant);
                sb.AppendLine("-----");
            }

            // ================================
            // ❓ QUESTION
            // ================================
            sb.AppendLine();
            sb.AppendLine("QUESTION:");
            sb.AppendLine(question);

            // ================================
            // 🎯 OUTPUT RULES
            // ================================
            sb.AppendLine();
            sb.AppendLine("Return ONLY valid JSON.");
            sb.AppendLine("You MUST use EXACT field names from the VALID FIELD NAMES list.");
            sb.AppendLine("Return ONLY the fields that directly answer the question.");
            sb.AppendLine("Do NOT return all fields. Only include relevant ones.");
            sb.AppendLine("Do NOT remove underscores.");
            sb.AppendLine("Do NOT create variations.");
            sb.AppendLine("Do NOT include explanations.");
            sb.AppendLine("Your response must start with '{' and end with '}'.");

            return sb.ToString();
        }

        private string ExtractRelevantSections(string text, string question)
        {
            if (string.IsNullOrWhiteSpace(text)) return "";

            var keywords = ExtractKeywords(question);
            var lower = text.ToLower();
            var matches = new List<string>();

            foreach (var keyword in keywords)
            {
                int index = 0;

                while ((index = lower.IndexOf(keyword, index)) != -1)
                {
                    int start = Math.Max(0, index - 400);
                    int end = Math.Min(text.Length, index + 800);

                    matches.Add(text.Substring(start, end - start));
                    index += keyword.Length;
                }
            }

            return string.Join("\n\n---\n\n", matches.Take(5));
        }

        private List<string> ExtractKeywords(string question)
        {
            if (string.IsNullOrWhiteSpace(question))
                return new List<string>();

            return question
                .ToLower()
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Where(w => w.Length > 2)
                .Distinct()
                .ToList();
        }

        private string Trim(string text, int max)
        {
            if (string.IsNullOrWhiteSpace(text)) return "";
            return text.Length <= max ? text : text.Substring(0, max);
        }

        private string CleanAiResponse(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return "No answer returned.";

            var cleaned = raw.Trim();

            try
            {
                var unwrapped = JsonSerializer.Deserialize<string>(cleaned);

                if (!string.IsNullOrWhiteSpace(unwrapped) && unwrapped.Trim().StartsWith("{"))
                {
                    cleaned = unwrapped;
                }
            }
            catch { }

            return cleaned;
        }


        private string NormalizeAnswerKeys(string jsonString)
            {
                if (string.IsNullOrWhiteSpace(jsonString))
                    return jsonString;

                try
                {
                    var parsed = JsonDocument.Parse(jsonString);
                    var root = parsed.RootElement;

                    var normalized = new Dictionary<string, object>();

                    foreach (var prop in root.EnumerateObject())
                    {
                        var key = prop.Name.ToLower();

                        // 🔥 REMOVE DOCUMENT PREFIXES (segro.pdf_-_)
                        if (key.Contains("_-_"))
                        {
                            key = key.Split("_-_").Last();
                        }

                        // 🔥 REMOVE .pdf OR FILE NAME REMAINS
                        key = key.Replace(".pdf", "");

                        // 🔥 CLEAN KEY (FINAL NORMALIZATION)
                        key = key
                            .Replace("-", "")
                            .Replace(" ", "")
                            .Trim();

                        // 🔥 MAP TO EXPECTED FORMAT
                        key = key switch
                        {
                            "leasestartdate" => "lease_start_date",
                            "leaseenddate" => "lease_end_date",
                            "leaseterm" => "lease_term",
                            "rentamount" => "rent_amount",
                            "rentreview" => "rent_review",
                            "vatincluded" => "vat_included",
                            "breakclause" => "break_clause",
                            "servicecharge" => "service_charge",
                            "alienationrights" => "alienation_rights",
                            "repairobligations" => "repair_obligations",
                            _ => key
                        };

                        normalized[key] = prop.Value.ToString();
                    }

                    return JsonSerializer.Serialize(normalized, new JsonSerializerOptions
                    {
                        WriteIndented = true
                    });
                }
                catch
                {
                    return jsonString; // fallback safe
                }
            }
    }
}
