using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.Xrm.Sdk;

namespace QubixInsight.Services.Domain
{
    public class ExtractionService
    {
        private readonly AiSummaryService _aiSummaryService;

        public ExtractionService(AiSummaryService aiSummaryService)
        {
            _aiSummaryService = aiSummaryService;
        }

        public async Task<Dictionary<string, object>> ExtractAttributesAsync(
            string text,
            IEnumerable<Entity> attributes,   // ✅ FIXED
            string basePrompt,
            string templatePrompt)
        {
            var aiExtractionService = new AiExtractionService(_aiSummaryService);

            return await aiExtractionService.ExtractAttributesAsync(
                text,
                attributes,   // ✅ now matches expected type
                basePrompt,
                templatePrompt
            );
        }
    }
}