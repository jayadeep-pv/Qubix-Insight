namespace QubixInsight.Services.Domain
{
    public class ComparisonRule
    {
        public Guid RuleId { get; set; }
        public Guid TemplateAttributeId { get; set; }
        public string AttributeKey { get; set; } = string.Empty;
        public string ComparisonLogic { get; set; } = string.Empty;
        public int Weight { get; set; }
    }
}