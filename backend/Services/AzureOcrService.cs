using Azure;
using System.Text;
using System.Text.RegularExpressions;
using Azure.AI.DocumentIntelligence;

namespace QubixInsight.Services;

public class AzureOcrService
{
    private readonly DocumentIntelligenceClient _client;

    public AzureOcrService()
    {
        var endpoint = Environment.GetEnvironmentVariable("DocumentIntelligenceEndpoint");
        var key      = Environment.GetEnvironmentVariable("DocumentIntelligenceKey");

        _client = new DocumentIntelligenceClient(
            new Uri(endpoint),
            new AzureKeyCredential(key));
    }

    // ==========================================
    // LEGACY METHOD (kept for backward compat)
    // ==========================================
    public async Task<string> ExtractTextAsync(byte[] fileBytes)
    {
        using var stream = new MemoryStream(fileBytes);

        var operation = await _client.AnalyzeDocumentAsync(
            WaitUntil.Completed,
            "prebuilt-layout",
            BinaryData.FromStream(stream));

        var result = operation.Value;
        var sb     = new StringBuilder();

        foreach (var page in result.Pages)
        {
            sb.AppendLine($"--- Page {page.PageNumber} ---");
            sb.AppendLine();
        }

        return sb.ToString();
    }

    // ==========================================
    // MAIN METHOD
    // Returns structured markdown FullText + line anchors for PDF highlighting
    // ==========================================
    public async Task<OcrExtractionResult> ExtractTextWithAnchorsAsync(byte[] fileBytes)
    {
        using var stream = new MemoryStream(fileBytes);

        var operation = await _client.AnalyzeDocumentAsync(
            WaitUntil.Completed,
            "prebuilt-layout",
            BinaryData.FromStream(stream));

        var result = operation.Value;

        // --- Structured markdown text (used by AI services) ---
        string fullText = BuildStructuredMarkdown(result);

        // Fallback: if structured pass yielded nothing meaningful, use flat lines
        if (string.IsNullOrWhiteSpace(fullText.Replace("-", "").Replace("\n", "").Replace("\r", "").Trim()))
            fullText = BuildFlatText(result);

        // --- Line anchors (unchanged — used for PDF coordinate highlighting) ---
        var pages = new List<OcrPageAnchor>();

        foreach (var page in result.Pages)
        {
            var pageAnchor = new OcrPageAnchor
            {
                PageNumber = page.PageNumber,
                Width      = page.Width,
                Height     = page.Height,
                Unit       = page.Unit?.ToString() ?? "pixel",
                Lines      = new List<OcrLineAnchor>()
            };

            int lineIndex = 0;

            foreach (var line in page.Lines)
            {
                var polygon = new List<OcrPoint>();

                try
                {
                    var bounding = line.Polygon;
                    if (bounding != null && bounding.Count >= 4)
                    {
                        for (int i = 0; i < bounding.Count; i += 2)
                            polygon.Add(new OcrPoint { X = bounding[i], Y = bounding[i + 1] });
                    }
                }
                catch { /* safe fallback */ }

                pageAnchor.Lines.Add(new OcrLineAnchor
                {
                    LineIndex      = lineIndex,
                    Text           = line.Content ?? string.Empty,
                    NormalizedText = NormalizeText(line.Content ?? string.Empty),
                    Polygon        = polygon
                });

                lineIndex++;
            }

            pages.Add(pageAnchor);
        }

        return new OcrExtractionResult { FullText = fullText, Pages = pages };
    }

    // ==========================================
    // STRUCTURED MARKDOWN BUILDER
    // Uses Paragraphs (with roles) + Tables from Azure Document Intelligence
    // ==========================================
    private string BuildStructuredMarkdown(AnalyzeResult result)
    {
        var sb = new StringBuilder();

        // Build table bounding regions so we can skip paragraphs inside tables
        var tableRegions  = new List<TableRegion>();
        var tablesByPage  = new Dictionary<int, List<(float Y, DocumentTable Table)>>();

        if (result.Tables != null)
        {
            foreach (var table in result.Tables)
            {
                if (table.BoundingRegions == null) continue;

                foreach (var region in table.BoundingRegions)
                {
                    var poly = region.Polygon;
                    if (poly == null || poly.Count < 8) continue;

                    tableRegions.Add(new TableRegion
                    {
                        Page = region.PageNumber,
                        MinX = Min4(poly[0], poly[2], poly[4], poly[6]),
                        MaxX = Max4(poly[0], poly[2], poly[4], poly[6]),
                        MinY = Min4(poly[1], poly[3], poly[5], poly[7]),
                        MaxY = Max4(poly[1], poly[3], poly[5], poly[7])
                    });

                    float topY = poly[1];
                    if (!tablesByPage.ContainsKey(region.PageNumber))
                        tablesByPage[region.PageNumber] = new List<(float Y, DocumentTable Table)>();
                    tablesByPage[region.PageNumber].Add((topY, table));
                }
            }
        }

        // Build per-page paragraph list, skipping items inside tables
        var parasByPage = new Dictionary<int, List<(float Y, DocumentParagraph Para)>>();

        if (result.Paragraphs != null)
        {
            foreach (var para in result.Paragraphs)
            {
                if (para.BoundingRegions == null) continue;

                foreach (var region in para.BoundingRegions)
                {
                    var poly = region.Polygon;
                    float topY = poly?.Count >= 2 ? poly[1] : 0f;

                    // Skip paragraphs whose centre falls inside a table region
                    if (IsInsideTable(region.PageNumber, poly, tableRegions)) continue;

                    // Skip page furniture
                    if (para.Role == ParagraphRole.PageHeader ||
                        para.Role == ParagraphRole.PageFooter  ||
                        para.Role == ParagraphRole.PageNumber)
                        continue;

                    if (!parasByPage.ContainsKey(region.PageNumber))
                        parasByPage[region.PageNumber] = new List<(float Y, DocumentParagraph Para)>();

                    parasByPage[region.PageNumber].Add((topY, para));
                }
            }
        }

        // Render page by page, merging paragraphs + tables in Y order
        if (result.Pages == null) return sb.ToString();

        foreach (var page in result.Pages)
        {
            int pageNum = page.PageNumber;
            sb.AppendLine($"--- Page {pageNum} ---");
            sb.AppendLine();

            var paras  = parasByPage.TryGetValue(pageNum,  out var pp) ? pp : new List<(float Y, DocumentParagraph Para)>();
            var tables = tablesByPage.TryGetValue(pageNum, out var tt) ? tt : new List<(float Y, DocumentTable Table)>();

            // Deduplicate tables that span multiple pages
            var seenTables = new HashSet<DocumentTable>(ReferenceEqualityComparer.Instance);

            var items = new List<(float Y, string Kind, int Idx)>();
            for (int i = 0; i < paras.Count;  i++) items.Add((paras[i].Y,  "para",  i));
            for (int i = 0; i < tables.Count; i++) items.Add((tables[i].Y, "table", i));
            items.Sort((a, b) => a.Y.CompareTo(b.Y));

            foreach (var item in items)
            {
                if (item.Kind == "para")
                {
                    AppendParagraph(sb, paras[item.Idx].Para);
                }
                else
                {
                    var tbl = tables[item.Idx].Table;
                    if (!seenTables.Contains(tbl))
                    {
                        seenTables.Add(tbl);
                        AppendTable(sb, tbl);
                        sb.AppendLine();
                    }
                }
            }

            sb.AppendLine();
        }

        return sb.ToString();
    }

    private static void AppendParagraph(StringBuilder sb, DocumentParagraph para)
    {
        var content = para.Content?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(content)) return;

        if (para.Role == ParagraphRole.Title)
            sb.AppendLine($"# {content}");
        else if (para.Role == ParagraphRole.SectionHeading)
            sb.AppendLine($"## {content}");
        else if (para.Role == ParagraphRole.Footnote)
            sb.AppendLine($"*{content}*");
        else
            sb.AppendLine(content);

        sb.AppendLine();
    }

    private static void AppendTable(StringBuilder sb, DocumentTable table)
    {
        if (table.RowCount == 0 || table.ColumnCount == 0) return;

        // Build 2D grid (span origin cells only — markdown doesn't support merged cells)
        var grid = new string[table.RowCount, table.ColumnCount];
        for (int r = 0; r < table.RowCount; r++)
            for (int c = 0; c < table.ColumnCount; c++)
                grid[r, c] = "";

        foreach (var cell in table.Cells)
        {
            if (cell.RowIndex < table.RowCount && cell.ColumnIndex < table.ColumnCount)
                grid[cell.RowIndex, cell.ColumnIndex] = (cell.Content ?? "")
                    .Replace("|", "\\|").Replace("\n", " ").Trim();
        }

        for (int r = 0; r < table.RowCount; r++)
        {
            var cells = new List<string>();
            for (int c = 0; c < table.ColumnCount; c++)
                cells.Add(grid[r, c]);

            sb.AppendLine("| " + string.Join(" | ", cells) + " |");

            // Markdown separator after header row
            if (r == 0)
                sb.AppendLine("| " + string.Join(" | ", Enumerable.Repeat("---", table.ColumnCount)) + " |");
        }
    }

    // ==========================================
    // FLAT FALLBACK (original line-based format)
    // ==========================================
    private static string BuildFlatText(AnalyzeResult result)
    {
        var sb = new StringBuilder();
        foreach (var page in result.Pages)
        {
            sb.AppendLine($"--- Page {page.PageNumber} ---");
            foreach (var line in page.Lines)
                sb.AppendLine(line.Content);
            sb.AppendLine();
        }
        return sb.ToString();
    }

    // ==========================================
    // HELPERS
    // ==========================================
    private static bool IsInsideTable(int pageNum, IReadOnlyList<float>? poly, List<TableRegion> regions)
    {
        if (poly == null || poly.Count < 2) return false;

        float cx = poly.Count >= 8 ? (poly[0] + poly[2] + poly[4] + poly[6]) / 4f : poly[0];
        float cy = poly.Count >= 8 ? (poly[1] + poly[3] + poly[5] + poly[7]) / 4f : poly[1];

        foreach (var r in regions)
        {
            if (r.Page == pageNum && cx >= r.MinX && cx <= r.MaxX && cy >= r.MinY && cy <= r.MaxY)
                return true;
        }
        return false;
    }

    private static float Min4(float a, float b, float c, float d) => Math.Min(a, Math.Min(b, Math.Min(c, d)));
    private static float Max4(float a, float b, float c, float d) => Math.Max(a, Math.Max(b, Math.Max(c, d)));

    // ==========================================
    // NORMALIZATION (unchanged)
    // ==========================================
    private static string NormalizeText(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;

        var value = input.Trim().ToLowerInvariant();
        value = Regex.Replace(value, @"\s+", " ");
        value = value.Replace("'", "'").Replace("'", "'")
                     .Replace(""", "\"").Replace(""", "\"")
                     .Replace("–", "-").Replace("—", "-");
        return value;
    }

    private class TableRegion
    {
        public int   Page { get; set; }
        public float MinX { get; set; }
        public float MaxX { get; set; }
        public float MinY { get; set; }
        public float MaxY { get; set; }
    }
}

// ==========================================
// DTOs (unchanged)
// ==========================================
public class OcrExtractionResult
{
    public string FullText { get; set; } = string.Empty;
    public List<OcrPageAnchor> Pages { get; set; } = new();
}

public class OcrPageAnchor
{
    public int    PageNumber { get; set; }
    public float? Width      { get; set; }
    public float? Height     { get; set; }
    public string Unit       { get; set; } = "pixel";
    public List<OcrLineAnchor> Lines { get; set; } = new();
}

public class OcrLineAnchor
{
    public int    LineIndex      { get; set; }
    public string Text           { get; set; } = string.Empty;
    public string NormalizedText { get; set; } = string.Empty;
    public List<OcrPoint> Polygon { get; set; } = new();
}

public class OcrPoint
{
    public float X { get; set; }
    public float Y { get; set; }
}
