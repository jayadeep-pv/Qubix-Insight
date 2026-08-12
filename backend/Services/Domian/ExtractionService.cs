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

        public async Task<(Dictionary<string, object> Values, Dictionary<string, string> Anchors)> ExtractAttributesAsync(
            string text,
            IEnumerable<Entity> attributes,
            string basePrompt,
            string templatePrompt)
        {
            var aiExtractionService = new AiExtractionService(_aiSummaryService);

            return await aiExtractionService.ExtractAttributesAsync(
                text,
                attributes,
                basePrompt,
                templatePrompt
            );
        }
    }
}