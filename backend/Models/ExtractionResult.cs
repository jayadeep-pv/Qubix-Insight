public class ExtractionResult
{
    public Dictionary<string, object> Values { get; set; } = new();

    public List<(string Text, int Page, IReadOnlyList<float> Polygon)> Words { get; set; }
        = new();
}