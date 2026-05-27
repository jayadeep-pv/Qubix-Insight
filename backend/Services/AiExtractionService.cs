using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Xrm.Sdk;
using Azure;
using System.Linq;
using Azure.AI.DocumentIntelligence;

namespace QubixInsight.Services;

public class AiExtractionService
{
    private readonly AiSummaryService _ai;

    public AiExtractionService(AiSummaryService ai)
    {
        _ai = ai;
    }

    public async Task<Dictionary<string, object>> ExtractAttributesAsync(
            string text,
            IEnumerable<Entity> attributes,
            string basePrompt,
            string templatePrompt)
    {
        var prompt = BuildPrompt(text, attributes, basePrompt, templatePrompt);

        var result = await _ai.GenerateRawPromptAsync(prompt);
        var response = result.Content;

        return ParseJson(response, attributes);
    }

    private string BuildPrompt(
        string text,
        IEnumerable<Entity> attributes,
        string basePrompt,
        string templatePrompt)
    {
        var sb = new StringBuilder();

        // =============================
        // 🔵 Document Type Layer
        // =============================
        if (!string.IsNullOrWhiteSpace(basePrompt))
        {
            sb.AppendLine(basePrompt);
            sb.AppendLine();
        }

        // =============================
        // 🟢 Template Layer
        // =============================
        if (!string.IsNullOrWhiteSpace(templatePrompt))
        {
            sb.AppendLine(templatePrompt);
            sb.AppendLine();
        }

        // =============================
        // 🟡 Extraction Instructions
        // =============================
        sb.AppendLine("Extract the following fields from the document.");
        sb.AppendLine("You MUST return ONLY valid JSON.");
        sb.AppendLine("Your response must start with '{' and end with '}'.");
        sb.AppendLine("Do NOT include any text before or after the JSON.");
        sb.AppendLine("Do NOT include markdown like ```json.");
        sb.AppendLine("Do NOT explain anything.");
        sb.AppendLine("If you break this rule, the system will fail.");

        sb.AppendLine("You MUST return ALL fields.");

        sb.AppendLine("For each field:");
        sb.AppendLine("- Extract the value if present in the document");
        sb.AppendLine("- If not explicitly stated, infer from the surrounding context in the document");
        sb.AppendLine("- Only return null if the field is genuinely not mentioned anywhere in the document");

        sb.AppendLine("Do NOT skip any fields, even if the wording is indirect or requires interpretation.");

        sb.AppendLine("Fields may appear as clauses or paragraphs, not exact labels.");
        sb.AppendLine("If a field is described in a sentence or clause, extract a short summary.");
        sb.AppendLine("Do not require exact wording match between field name and document text.");
        sb.AppendLine();

        // =============================
        // 🔥 JSON TEMPLATE
        // =============================
        sb.AppendLine("{");

        int count = attributes.Count();
        int index = 0;

        foreach (var attr in attributes)
        {
           var key = attr.GetAttributeValue<string>("ilx_attributekey");

            index++;

            var comma = index < count ? "," : "";

            sb.AppendLine($"  \"{key}\": \"Not Found\"{comma}");
        }

        sb.AppendLine("}");
        sb.AppendLine();

        // =============================
        // 🔴 THIS WAS MISSING (CRITICAL FIX)
        // =============================
        sb.AppendLine("Document:");
        sb.AppendLine(text);

        return sb.ToString();
    }


private Dictionary<string, object> ParseJson(
    string response,
    IEnumerable<Entity> attributes)
{
    var result = new Dictionary<string, object>();

    if (string.IsNullOrWhiteSpace(response))
        return result;

    try
    {
        var json = JsonDocument.Parse(response);
        var root = json.RootElement;

        foreach (var attr in attributes)
        {
            var key = attr.GetAttributeValue<string>("ilx_attributekey");

            if (string.IsNullOrWhiteSpace(key))
                continue;

            // ✅ STRICT match only
            if (root.TryGetProperty(key, out var val))
            {
                string value = val.ValueKind == JsonValueKind.String
                    ? val.GetString()
                    : val.ToString();

                // Normalize "Not Found"
                if (value != null && value.Trim().Equals("Not Found", StringComparison.OrdinalIgnoreCase))
                    result[key] = null;
                else
                    result[key] = value;
            }
            else
            {
                result[key] = null;
            }
        }
    }
    catch
    {
        // ❌ DO NOT fallback to string parsing
        foreach (var attr in attributes)
        {
            var key = attr.GetAttributeValue<string>("ilx_attributekey");

            if (!string.IsNullOrWhiteSpace(key))
                result[key] = null;
        }
    }

    return result;
}



private string ExtractSimpleValue(string text, string key)
{
    var lines = text.Split('\n');

    foreach (var line in lines)
    {
        if (line.Contains(key, StringComparison.OrdinalIgnoreCase))
        {
            return line.Trim();
        }
    }

    return "";
}

public async Task<List<(string Text, int Page, IReadOnlyList<float> Polygon)>> ExtractWordsWithPositionsAsync(
    Stream documentStream)
{
    var client = new DocumentIntelligenceClient(
        new Uri(Environment.GetEnvironmentVariable("DocumentIntelligenceEndpoint")!),
        new AzureKeyCredential(Environment.GetEnvironmentVariable("DocumentIntelligenceKey")!)
    );

    // Copy to MemoryStream — DocumentIntelligenceClient requires BinaryData
    using var ms = new MemoryStream();
    await documentStream.CopyToAsync(ms);

    var operation = await client.AnalyzeDocumentAsync(
        WaitUntil.Completed,
        "prebuilt-document",
        BinaryData.FromBytes(ms.ToArray())
    );

    var result = operation.Value;

    var words = new List<(string Text, int Page, IReadOnlyList<float> Polygon)>();

    foreach (var page in result.Pages)
    {
        foreach (var word in page.Words)
        {
            // In Azure.AI.DocumentIntelligence, Polygon is already IReadOnlyList<float>
            // with values interleaved as [x0,y0, x1,y1, ...] — no manual flattening needed
            words.Add((
                word.Content ?? string.Empty,
                page.PageNumber,
                word.Polygon ?? (IReadOnlyList<float>)Array.Empty<float>()
            ));
        }
    }

    return words;
}



}
