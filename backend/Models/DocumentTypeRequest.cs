namespace QubixInsight.Models
{
    public class DocumentTypeRequest
    {
        public string Name { get; set; } = "";
        public string? Description { get; set; }
        public bool IsActive { get; set; } = true;
        public bool EnableCompare { get; set; } = false;
        public bool EnableScoring { get; set; } = false;
        public bool EnableSummarise { get; set; } = false;
    }
}