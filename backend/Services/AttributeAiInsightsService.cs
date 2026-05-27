using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace QubixInsight.Services
{
    public class AttributeAiInsightsService
    {
        private readonly AiSummaryService _ai;   // ✅ FIXED NAME
        
        private readonly ILogger _logger;

        public AttributeAiInsightsService(
            AiSummaryService ai,
            ILogger logger)
        {
            _ai = ai;
            _logger = logger;
        }

        public async Task<string> GenerateInsight(
            string attributeName,
            string expectation,
            Dictionary<string, string> candidateValues,
            bool isCompareMode)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(attributeName))
                    return "";

                if (string.IsNullOrWhiteSpace(expectation))
                    return "";

                var valuesText = string.Join("\n",
                    candidateValues.Select(v => $"{v.Key}: {v.Value}")
                );

                var modeInstruction = isCompareMode
                    ? "Compare the candidates against the expectation."
                    : "Evaluate the document against the expectation.";

                var prompt = $@"
                    You are analysing a SINGLE document attribute.

                    ATTRIBUTE NAME:
                    {attributeName}

                    EXPECTED BEHAVIOUR:
                    {expectation}

                    VALUES ACROSS DOCUMENT(S):
                    {valuesText}

                    TASK:
                    {modeInstruction}

                    IMPORTANT RULES:
                    - You MUST analyse ONLY this attribute
                    - Do NOT analyse the full document
                    - Do NOT mention other clauses (e.g. rent review, termination, etc)
                    - Stay strictly focused on {attributeName}
                    - If value is missing or 'Not Found', treat it as a risk

                    OUTPUT FORMAT (STRICT JSON ONLY):
                    {{
                    ""title"": ""short attribute-specific insight"",
                    ""impact"": ""High | Medium | Low"",
                    ""description"": ""clear explanation specific to this attribute only""
                    }}

                    DO NOT:
                    - Return markdown
                    - Return multiple insights
                    - Return document-level summary
                    ";

                // ✅ IMPORTANT: Use your actual method
                var response = await _ai.RunPromptAsync(prompt);

                return response ?? "";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Attribute AI failed for {Attribute}", attributeName);
                return "";
            }
        }
    }
}