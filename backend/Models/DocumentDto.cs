namespace QubixInsight.Models;

public class DocumentDto
{
    public Guid Id { get; set; }
    public string Name { get; set; }
    public string BlobPath { get; set; }
    public string ExtractedText { get; set; }

    public string DocumentUrl { get; set; }
}