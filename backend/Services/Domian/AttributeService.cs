using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace QubixInsight.Services
{
    public class AttributeService
    {
        private readonly AiExtractionService _aiExtractionService;

        public AttributeService(AiExtractionService aiExtractionService)
        {
            _aiExtractionService = aiExtractionService;
        }

        // ✅ MAIN ENTRY POINT (UNCHANGED BEHAVIOUR)
        public async Task<Dictionary<Guid, Dictionary<string, object>>> ExtractAttributesAsync(
            ServiceClient service,
            List<Entity> documents,
            List<Entity> attributes,
            string basePrompt,
            string templatePrompt
        )
        {
            var extractedResults = new Dictionary<Guid, Dictionary<string, object>>();

            foreach (var doc in documents)
            {
                var docId = doc.Id;

                // ✅ EXACT SAME AS BEFORE
                var text = doc.GetAttributeValue<string>("ilx_extractedtext");

                // 🔥 DO NOT CHANGE CALL — SAME METHOD
                var aiResult = await _aiExtractionService.ExtractAttributesAsync(
                    text,
                    attributes,
                    basePrompt,
                    templatePrompt
                );

                // ✅ SAME FALLBACK
                var fallback = ExtractFallbackValues(text);

                // ✅ SAME MERGE
                var merged = MergeResults(aiResult, fallback, attributes);

                extractedResults[docId] = merged;
            }

            return extractedResults;
        }

        // =====================================================
        // 🔁 MERGE LOGIC (UNCHANGED)
        // =====================================================
        private Dictionary<string, object> MergeResults(
            Dictionary<string, object> aiResult,
            Dictionary<string, object> fallback,
            List<Entity> attributes
        )
        {
            var result = new Dictionary<string, object>();

            foreach (var attr in attributes)
            {
                var key = attr.GetAttributeValue<string>("ilx_attributekey");

                if (string.IsNullOrWhiteSpace(key))
                    continue;

                var normalizedKey = NormalizeKey(key);

                object value = null;

                // ✅ AI value
                if (aiResult != null && aiResult.TryGetValue(normalizedKey, out var aiVal))
                {
                    value = aiVal;
                }

                // ✅ fallback only if AI missing
                if ((value == null || string.IsNullOrWhiteSpace(value.ToString())) &&
                    fallback.TryGetValue(normalizedKey, out var fallbackVal))
                {
                    value = fallbackVal;
                }

                // ✅ ensure not missing (same behaviour)
                if (value == null)
                    value = "Not Found";

                result[normalizedKey] = value;
            }

            return result;
        }

        // =====================================================
        // 🧪 FALLBACK (UNCHANGED)
        // =====================================================
        private Dictionary<string, object> ExtractFallbackValues(string text)
        {
            var result = new Dictionary<string, object>();

            if (string.IsNullOrWhiteSpace(text))
                return result;

            text = text.ToLower();

            if (text.Contains("break clause"))
                result["break_clause"] = "Present";

            if (text.Contains("termination"))
                result["termination"] = "Mentioned";

            return result;
        }

        // =====================================================
        // 🔤 NORMALIZATION (UNCHANGED)
        // =====================================================
        private string NormalizeKey(string key)
        {
            return key.Trim().ToLower().Replace(" ", "_");
        }
    }
}
