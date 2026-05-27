using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk.Query;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;
using Microsoft.Xrm.Sdk;
using System.Text.Json;
using QubixInsight.Services;

public class ExportComparisonPdf
{
    private readonly ILogger _logger;
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public ExportComparisonPdf(ILoggerFactory loggerFactory,
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _logger = loggerFactory.CreateLogger<ExportComparisonPdf>();
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("ExportComparisonPdf")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "get")] HttpRequestData req)
    {
        var aadTenantId = JwtTenantExtractor.GetAadTenantId(req);
        if (string.IsNullOrWhiteSpace(aadTenantId))
        {
            var bad = req.CreateResponse(System.Net.HttpStatusCode.Unauthorized);
            await bad.WriteStringAsync("Unable to determine tenant from Bearer token.");
            return bad;
        }

        var tenant = _tenantResolver.ResolveTenant(aadTenantId);

        if (tenant.IsTrial)
        {
            var forbidden = req.CreateResponse(HttpStatusCode.Forbidden);
            await forbidden.WriteStringAsync("PDF export is not available on trial accounts. Upgrade to export reports.");
            return forbidden;
        }

        var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

        var query = System.Web.HttpUtility.ParseQueryString(req.Url.Query);
        var runId = query["comparisonRunId"];

        if (string.IsNullOrWhiteSpace(runId))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("Missing comparisonRunId");
            return bad;
        }

        var runGuid = Guid.Parse(runId);

        // =============================================================
        // 1. RUN DETAILS
        // =============================================================
        var run = service.Retrieve(
            "ilx_analysisrun", runGuid,
            new ColumnSet(
                "ilx_name", "createdby", "createdon",
                "ilx_documenttype", "ilx_analysis",
                "ilx_executedbyuser", "ilx_mode",
                "ilx_rawresultjson"
            ));

        var modeValue = run.GetAttributeValue<OptionSetValue>("ilx_mode")?.Value;
        bool isSummariseMode = modeValue == 857270001;
        string modeText = isSummariseMode ? "Summarise" : "Compare";

        string runName     = run.GetAttributeValue<string>("ilx_name") ?? "";
        string reportTitle = run.GetAttributeValue<EntityReference>("ilx_analysis")?.Name ?? "";
        if (string.IsNullOrWhiteSpace(reportTitle))
            reportTitle = !string.IsNullOrWhiteSpace(runName) ? runName : "Comparison Report";

        string runBy = run.GetAttributeValue<string>("ilx_executedbyuser") ?? "";
        if (string.IsNullOrWhiteSpace(runBy))
            runBy = (run.GetAttributeValue<EntityReference>("createdby")?.Name ?? "")
                    .Replace("# Portals-", "").Trim();

        string runDate = run.GetAttributeValue<DateTime?>("createdon")?.ToString("dd MMM yyyy") ?? "";
        string docType = run.GetAttributeValue<EntityReference>("ilx_documenttype")?.Name ?? "";
        string rawResultJson = run.GetAttributeValue<string>("ilx_rawresultjson") ?? "";

        // =============================================================
        // 2. CANDIDATES — queried here (not inside the PDF lambda) with tenant filter
        // =============================================================
        var candidateQuery = new QueryExpression("ilx_analysiscandidate")
        {
            ColumnSet = new ColumnSet("ilx_label", "ilx_totalscore", "ilx_iswinner")
        };
        candidateQuery.Criteria.AddCondition("ilx_analysisrun", ConditionOperator.Equal, runGuid);
        TenantQueryHelper.AddTenantFilter(candidateQuery, tenant.TenantRecordId.ToString());
        var candidateEntities = service.RetrieveMultiple(candidateQuery).Entities;

        var candidates = candidateEntities
            .Select(c => (
                Id: c.Id,
                Label: c.GetAttributeValue<string>("ilx_label") ?? "",
                Score: GetDecimalScore(c),
                IsWinner: c.GetAttributeValue<bool?>("ilx_iswinner") == true
            ))
            .OrderByDescending(c => c.Score)
            .ToList();

        string winner = candidates.FirstOrDefault(c => c.IsWinner).Label
                     ?? candidates.FirstOrDefault().Label
                     ?? "";

        // GUID string → candidate label, used to map rawResultJson CandidateId values
        var candidateIdToLabel = candidates
            .Where(c => !string.IsNullOrWhiteSpace(c.Label))
            .ToDictionary(c => c.Id.ToString(), c => c.Label);

        // =============================================================
        // 3. COMPARISON RESULTS → grouped dict (attrKey → docName → value)
        // =============================================================
        var resultQuery = new QueryExpression("ilx_analysisresult")
        {
            ColumnSet = new ColumnSet("ilx_name", "ilx_normalisedvalue")
        };
        resultQuery.Criteria.AddCondition("ilx_analysisrun", ConditionOperator.Equal, runGuid);
        TenantQueryHelper.AddTenantFilter(resultQuery, tenant.TenantRecordId.ToString());
        var results = service.RetrieveMultiple(resultQuery).Entities;

        var documents = results
            .Select(r => ExtractDocName(r.GetAttributeValue<string>("ilx_name")))
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct()
            .ToList();

        var grouped = results
            .GroupBy(r => NormalizeKey(ExtractAttributeName(r.GetAttributeValue<string>("ilx_name"))))
            .ToDictionary(
                g => g.Key,
                g => g
                    .GroupBy(x => ExtractDocName(x.GetAttributeValue<string>("ilx_name")))
                    .ToDictionary(
                        dg => dg.Key,
                        dg => dg
                            .Select(x => x.GetAttributeValue<string>("ilx_normalisedvalue"))
                            .FirstOrDefault(v => !string.IsNullOrWhiteSpace(v)) ?? "-"
                    )
            );

        // =============================================================
        // 4. ATTRIBUTE DISPLAY NAMES
        // =============================================================
        var attrQuery = new QueryExpression("ilx_templateattribute")
        {
            ColumnSet = new ColumnSet("ilx_attributekey", "ilx_name")
        };
        TenantQueryHelper.AddTenantFilter(attrQuery, tenant.TenantRecordId.ToString());
        var attrRecords = service.RetrieveMultiple(attrQuery).Entities;

        var attributeLookup = attrRecords
            .Where(a => a.Contains("ilx_attributekey"))
            .GroupBy(a => NormalizeKey(a.GetAttributeValue<string>("ilx_attributekey")))
            .ToDictionary(
                g => g.Key,
                g => g.Select(x => x.GetAttributeValue<string>("ilx_name"))
                       .FirstOrDefault(n => !string.IsNullOrEmpty(n)) ?? g.Key
            );

        var displayNameToKey = attrRecords
            .Where(a => a.Contains("ilx_name") && a.Contains("ilx_attributekey"))
            .GroupBy(a => NormalizeKey(a.GetAttributeValue<string>("ilx_name")))
            .ToDictionary(
                g => g.Key,
                g => NormalizeKey(
                    g.Select(x => x.GetAttributeValue<string>("ilx_attributekey"))
                     .FirstOrDefault(k => !string.IsNullOrEmpty(k)) ?? g.Key
                )
            );

        // =============================================================
        // 5. SCORING DATA — queried directly from ilx_analysisevaluationresult
        //    evalScores[normAttrKey][candidateLabel]  = score contribution
        //    winnersByAttribute[normAttrKey]           = set of winning candidate labels
        //    advisoryByAttribute[normAttrKey]          = advisory / notes text
        // =============================================================
        // normAttrKey → (candidateLabel → scoreContribution)
        var evalScores = new Dictionary<string, Dictionary<string, int>>();
        var winnersByAttribute = new Dictionary<string, HashSet<string>>();
        var advisoryByAttribute = new Dictionary<string, string>();

        if (candidates.Any())
        {
            var candidateIds = candidates.Select(c => (object)c.Id).ToArray();

            var evalResultQuery = new QueryExpression("ilx_analysisevaluationresult")
            {
                ColumnSet = new ColumnSet(
                    "ilx_analysiscandidate",
                    "ilx_iswinner",
                    "ilx_scorecontribution")
            };
            evalResultQuery.Criteria.AddCondition(
                "ilx_analysiscandidate", ConditionOperator.In, candidateIds);

            // Join → ilx_analysisevaluation (advisory text)
            var evalLink = evalResultQuery.AddLink(
                "ilx_analysisevaluation",
                "ilx_analysisevaluation",
                "ilx_analysisevaluationid");
            evalLink.Columns    = new ColumnSet("ilx_advisorytext");
            evalLink.EntityAlias = "ev";
            evalLink.JoinOperator = JoinOperator.LeftOuter;

            // Join → ilx_templateattribute (attribute display name)
            var attrLink = evalLink.AddLink(
                "ilx_templateattribute",
                "ilx_templateattribute",
                "ilx_templateattributeid");
            attrLink.Columns    = new ColumnSet("ilx_name");
            attrLink.EntityAlias = "attr";
            attrLink.JoinOperator = JoinOperator.LeftOuter;

            try
            {
                var evalEntities = service.RetrieveMultiple(evalResultQuery).Entities;

                foreach (var e in evalEntities)
                {
                    var candRef = e.GetAttributeValue<EntityReference>("ilx_analysiscandidate");
                    if (candRef == null) continue;

                    var candLabel = candidates.FirstOrDefault(c => c.Id == candRef.Id).Label ?? "";
                    if (string.IsNullOrWhiteSpace(candLabel)) continue;

                    var attrNameRaw = (e.GetAttributeValue<AliasedValue>("attr.ilx_name")?.Value as string) ?? "";
                    var normAttr    = NormalizeKey(attrNameRaw);
                    if (string.IsNullOrWhiteSpace(normAttr)) continue;

                    var score    = e.GetAttributeValue<int?>("ilx_scorecontribution") ?? 0;
                    var isWinner = e.GetAttributeValue<bool?>("ilx_iswinner") == true;
                    var advisory = (e.GetAttributeValue<AliasedValue>("ev.ilx_advisorytext")?.Value as string) ?? "";

                    // Score map
                    if (!evalScores.ContainsKey(normAttr))
                        evalScores[normAttr] = new Dictionary<string, int>();
                    evalScores[normAttr][candLabel] = score;

                    // Winner map
                    if (isWinner)
                    {
                        if (!winnersByAttribute.ContainsKey(normAttr))
                            winnersByAttribute[normAttr] = new HashSet<string>();
                        winnersByAttribute[normAttr].Add(candLabel);
                    }

                    // Advisory map
                    if (!string.IsNullOrWhiteSpace(advisory))
                        advisoryByAttribute[normAttr] = advisory;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Evaluation results query failed: {ex.Message}");
            }
        }

        // =============================================================
        // 6. DOCUMENTS LIST (for header)
        // =============================================================
        var docListQuery = new QueryExpression("ilx_analysisdocument")
        {
            ColumnSet = new ColumnSet("ilx_documentname", "ilx_name")
        };
        docListQuery.Criteria.AddCondition("ilx_analysisrun", ConditionOperator.Equal, runGuid);
        TenantQueryHelper.AddTenantFilter(docListQuery, tenant.TenantRecordId.ToString());
        var docNames = service.RetrieveMultiple(docListQuery).Entities
            .Select(d => d.GetAttributeValue<string>("ilx_documentname")
                      ?? d.GetAttributeValue<string>("ilx_name") ?? "")
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .ToList();

        // =============================================================
        // 7. AI INSIGHTS
        // =============================================================
        string executiveSummary = "";
        var keyInsights = new List<(string Title, string Text, string Risk)>();
        var attributeInsights = new Dictionary<string, (string Title, string Text, string Impact)>();

        var insightQuery = new QueryExpression("ilx_analysisruninsight")
        {
            ColumnSet = new ColumnSet("ilx_aisummaryjsonoutput")
        };
        insightQuery.Criteria.AddCondition("ilx_analysisrun", ConditionOperator.Equal, runGuid);
        TenantQueryHelper.AddTenantFilter(insightQuery, tenant.TenantRecordId.ToString());

        foreach (var rec in service.RetrieveMultiple(insightQuery).Entities)
        {
            var json = rec.GetAttributeValue<string>("ilx_aisummaryjsonoutput");
            if (string.IsNullOrWhiteSpace(json)) continue;
            try
            {
                var parsed = JsonDocument.Parse(json);

                if (parsed.RootElement.TryGetProperty("executiveSummary", out var s))
                    executiveSummary = s.GetString() ?? executiveSummary;

                if (parsed.RootElement.TryGetProperty("keyInsights", out var k) &&
                    k.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in k.EnumerateArray())
                    {
                        var title = item.TryGetProperty("title", out var t) ? t.GetString() ?? "" : "";
                        var text  = item.TryGetProperty("description", out var d) ? d.GetString() ?? "" : "";
                        var risk  = item.TryGetProperty("impact", out var i) ? i.GetString() ?? "" : "";
                        if (!string.IsNullOrWhiteSpace(title) || !string.IsNullOrWhiteSpace(text))
                            keyInsights.Add((title, text, risk));
                    }
                }

                if (parsed.RootElement.TryGetProperty("attributeInsights", out var aiArr) &&
                    aiArr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in aiArr.EnumerateArray())
                    {
                        string rawAttr = "";
                        if (item.TryGetProperty("attribute", out var a)) rawAttr = a.GetString() ?? "";
                        else if (item.TryGetProperty("attributeName", out var an)) rawAttr = an.GetString() ?? "";

                        var key = ResolveAttributeKey(rawAttr, grouped, displayNameToKey);
                        if (string.IsNullOrWhiteSpace(key)) continue;
                        if (attributeInsights.ContainsKey(key)) continue;

                        attributeInsights[key] = (
                            item.TryGetProperty("title",       out var t) ? t.GetString() ?? "AI Insight" : "AI Insight",
                            item.TryGetProperty("description", out var d) ? d.GetString() ?? "" : "",
                            item.TryGetProperty("impact",      out var im) ? im.GetString() ?? "" : ""
                        );
                    }
                }
            }
            catch (Exception ex) { _logger.LogWarning($"Run insight parse error: {ex.Message}"); }
        }

        var attrInsightQuery = new QueryExpression("ilx_analysisattributeinsight")
        {
            ColumnSet = new ColumnSet("ilx_name", "ilx_aioutput", "ilx_templateattribute")
        };
        attrInsightQuery.Criteria.AddCondition("ilx_analysisrun", ConditionOperator.Equal, runGuid);
        TenantQueryHelper.AddTenantFilter(attrInsightQuery, tenant.TenantRecordId.ToString());

        foreach (var rec in service.RetrieveMultiple(attrInsightQuery).Entities)
        {
            var aiOutput = rec.GetAttributeValue<string>("ilx_aioutput");
            if (string.IsNullOrWhiteSpace(aiOutput)) continue;

            var candidateKeys = new List<string>();
            var templateAttrRef = rec.GetAttributeValue<EntityReference>("ilx_templateattribute");
            if (templateAttrRef?.Name != null) candidateKeys.Add(templateAttrRef.Name);
            var recName = rec.GetAttributeValue<string>("ilx_name");
            if (!string.IsNullOrWhiteSpace(recName)) candidateKeys.Add(recName);

            try
            {
                var parsed = JsonDocument.Parse(aiOutput);
                string rawAttr = "";
                if (parsed.RootElement.TryGetProperty("attribute", out var ap))      rawAttr = ap.GetString() ?? "";
                else if (parsed.RootElement.TryGetProperty("attributeName", out var anp)) rawAttr = anp.GetString() ?? "";
                if (!string.IsNullOrWhiteSpace(rawAttr)) candidateKeys.Insert(0, rawAttr);

                var key = ResolveAttributeKey(candidateKeys, grouped, displayNameToKey);
                if (string.IsNullOrWhiteSpace(key)) continue;

                attributeInsights[key] = (
                    parsed.RootElement.TryGetProperty("title",       out var t)  ? t.GetString()  ?? "AI Insight" : "AI Insight",
                    parsed.RootElement.TryGetProperty("description", out var d)  ? d.GetString()  ?? "" : aiOutput,
                    parsed.RootElement.TryGetProperty("impact",      out var im) ? im.GetString() ?? "" : ""
                );
            }
            catch
            {
                var key = ResolveAttributeKey(candidateKeys, grouped, displayNameToKey);
                if (!string.IsNullOrWhiteSpace(key))
                    attributeInsights[key] = ("AI Insight", aiOutput, "");
            }
        }

        // =============================================================
        // 8. GENERATE PDF
        // =============================================================
        QuestPDF.Settings.License = LicenseType.Community;

        var pdf = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.MarginHorizontal(36);
                page.MarginTop(0);
                page.MarginBottom(24);

                // ── HEADER ──────────────────────────────────────────────
                page.Header().Column(h =>
                {
                    // Dark title bar
                    h.Item().Background("#1e293b").PaddingVertical(12).PaddingHorizontal(14).Row(r =>
                    {
                        r.RelativeItem().Column(c =>
                        {
                            c.Item().Text(reportTitle)
                                .FontSize(14).Bold().FontColor("#ffffff");
                            c.Item().PaddingTop(3)
                                .Text($"{docType}  |  {modeText}  |  {runBy}  |  {runDate}")
                                .FontSize(8).FontColor("#94a3b8");
                        });

                        if (!isSummariseMode && !string.IsNullOrWhiteSpace(winner))
                        {
                            r.ConstantItem(130).AlignRight().Column(c =>
                            {
                                c.Item().AlignRight().Text("WINNER")
                                    .FontSize(7).FontColor("#6ee7b7");
                                c.Item().AlignRight().Text(winner)
                                    .FontSize(10).Bold().FontColor("#ffffff");
                            });
                        }
                    });

                    // Documents compared strip
                    if (docNames.Any())
                    {
                        h.Item().Background("#f8fafc").PaddingVertical(5).PaddingHorizontal(14).Row(r =>
                        {
                            r.AutoItem().Text("Documents compared: ")
                                .FontSize(8).FontColor("#64748b");
                            foreach (var dn in docNames)
                            {
                                r.AutoItem().PaddingLeft(8)
                                    .Text($"• {dn}")
                                    .FontSize(8).FontColor("#334155");
                            }
                        });
                    }

                    h.Item().LineHorizontal(1).LineColor("#e2e8f0");
                });

                // ── FOOTER ──────────────────────────────────────────────
                page.Footer().PaddingHorizontal(14).PaddingVertical(6).Row(r =>
                {
                    r.RelativeItem()
                        .Text($"Generated {DateTime.UtcNow:dd MMM yyyy HH:mm} UTC  •  Confidential")
                        .FontSize(7).FontColor("#94a3b8");
                    r.ConstantItem(80).AlignRight().Text(x =>
                    {
                        x.Span("Page ").FontSize(7).FontColor("#94a3b8");
                        x.CurrentPageNumber().FontSize(7).FontColor("#94a3b8");
                        x.Span(" of ").FontSize(7).FontColor("#94a3b8");
                        x.TotalPages().FontSize(7).FontColor("#94a3b8");
                    });
                });

                // ── CONTENT ─────────────────────────────────────────────
                page.Content().PaddingTop(16).PaddingHorizontal(14).Column(col =>
                {
                    col.Spacing(18);

                    // ── Executive Summary ────────────────────────────────
                    if (!string.IsNullOrWhiteSpace(executiveSummary))
                    {
                        col.Item().Column(s =>
                        {
                            s.Item().Text("Executive Summary")
                                .Bold().FontSize(11).FontColor("#0369a1");
                            s.Item().PaddingTop(5)
                                .BorderLeft(3).BorderColor("#0ea5e9")
                                .PaddingLeft(10).PaddingVertical(6).PaddingRight(8)
                                .Background("#f0f9ff")
                                .Text(executiveSummary)
                                .FontSize(10).FontColor("#1e3a5f").LineHeight(1.5f);
                        });
                    }

                    // ── Key Insights ─────────────────────────────────────
                    if (keyInsights.Any())
                    {
                        col.Item().Column(s =>
                        {
                            s.Item().Text("Key Insights")
                                .Bold().FontSize(11).FontColor("#111827");
                            s.Item().PaddingTop(6).Column(inner =>
                            {
                                inner.Spacing(5);
                                foreach (var insight in keyInsights)
                                {
                                    inner.Item()
                                        .Background("#fafafa")
                                        .Border(1).BorderColor("#e5e7eb")
                                        .Padding(8)
                                        .Row(r =>
                                        {
                                            r.RelativeItem().Column(c =>
                                            {
                                                if (!string.IsNullOrWhiteSpace(insight.Title))
                                                    c.Item().Text(insight.Title)
                                                        .SemiBold().FontSize(10).FontColor("#111827");
                                                if (!string.IsNullOrWhiteSpace(insight.Text))
                                                    c.Item().PaddingTop(2).Text(insight.Text)
                                                        .FontSize(9).FontColor("#374151").LineHeight(1.4f);
                                            });

                                            if (!string.IsNullOrWhiteSpace(insight.Risk))
                                            {
                                                r.ConstantItem(48).AlignRight().Column(c =>
                                                {
                                                    c.Item()
                                                        .Background(GetRiskColor(insight.Risk))
                                                        .PaddingVertical(4).PaddingHorizontal(4)
                                                        .AlignCenter()
                                                        .Text(insight.Risk.ToUpper())
                                                        .FontColor("#ffffff").FontSize(7).Bold();
                                                });
                                            }
                                        });
                                }
                            });
                        });
                    }

                    // ── Ranking (Compare only) ────────────────────────────
                    if (!isSummariseMode && candidates.Any())
                    {
                        col.Item().Column(s =>
                        {
                            s.Item().Text("Ranking")
                                .Bold().FontSize(11).FontColor("#111827");
                            s.Item().PaddingTop(6).Table(t =>
                            {
                                t.ColumnsDefinition(c =>
                                {
                                    c.ConstantColumn(28);
                                    c.RelativeColumn();
                                    c.ConstantColumn(70);
                                });
                                t.Header(h =>
                                {
                                    h.Cell().Element(HeaderCell).AlignCenter().Text("#").FontColor("#fff").FontSize(8).SemiBold();
                                    h.Cell().Element(HeaderCell).Text("Document").FontColor("#fff").FontSize(8).SemiBold();
                                    h.Cell().Element(HeaderCell).AlignRight().Text("Score").FontColor("#fff").FontSize(8).SemiBold();
                                });
                                int rank = 1;
                                foreach (var cand in candidates)
                                {
                                    bool isWin = cand.IsWinner;
                                    t.Cell().Element(isWin ? WinnerCell : DataCell).AlignCenter()
                                        .Text(rank.ToString()).FontSize(9);
                                    t.Cell().Element(isWin ? WinnerCell : DataCell)
                                        .Text(isWin ? $"{cand.Label}   (Winner)" : cand.Label)
                                        .FontSize(9);
                                    t.Cell().Element(isWin ? WinnerCell : DataCell).AlignRight()
                                        .Text($"{cand.Score}").FontSize(9);
                                    rank++;
                                }
                            });
                        });
                    }

                    // ── Scoring Breakdown (Compare only) ────────────────
                    if (!isSummariseMode && candidates.Any())
                    {
                        col.Item().Column(s =>
                        {
                            s.Item().Text("Scoring Breakdown")
                                .Bold().FontSize(11).FontColor("#111827");

                            bool hasAdvisory = advisoryByAttribute.Values
                                .Any(v => !string.IsNullOrWhiteSpace(v));

                            int cc = candidates.Count;

                            s.Item().PaddingTop(6).Table(t =>
                            {
                                t.ColumnsDefinition(c =>
                                {
                                    c.RelativeColumn(4);                        // attribute name
                                    for (int i = 0; i < cc; i++)
                                        c.RelativeColumn(3);                    // one column per document
                                    if (hasAdvisory) c.RelativeColumn(4);      // advisory notes
                                });

                                // Header
                                t.Header(h =>
                                {
                                    h.Cell().Element(HeaderCell)
                                        .Text("Attribute").FontColor("#fff").FontSize(8).SemiBold();

                                    foreach (var cand in candidates)
                                        h.Cell().Element(HeaderCell).AlignCenter()
                                            .Text(cand.Label).FontColor("#fff").FontSize(8).SemiBold();

                                    if (hasAdvisory)
                                        h.Cell().Element(HeaderCell)
                                            .Text("Notes").FontColor("#fff").FontSize(8).SemiBold();
                                });

                                // Attribute rows
                                foreach (var kvp in grouped)
                                {
                                    var normKey = kvp.Key;
                                    var displayName = attributeLookup.ContainsKey(normKey)
                                        ? attributeLookup[normKey] : ToFriendly(normKey);
                                    var winners = winnersByAttribute.ContainsKey(normKey)
                                        ? winnersByAttribute[normKey] : new HashSet<string>();
                                    var advisory = advisoryByAttribute.ContainsKey(normKey)
                                        ? advisoryByAttribute[normKey] : "";

                                    t.Cell().Element(DataCell)
                                        .Text(displayName).FontSize(9).FontColor("#374151");

                                    foreach (var cand in candidates)
                                    {
                                        bool won = winners.Contains(cand.Label);
                                        int? pts = evalScores.ContainsKey(normKey) &&
                                                   evalScores[normKey].ContainsKey(cand.Label)
                                            ? evalScores[normKey][cand.Label]
                                            : (int?)null;

                                        t.Cell().Element(won ? WinnerCell : DataCell).Column(cell =>
                                        {
                                            cell.Item().AlignCenter()
                                                .Text(pts.HasValue ? $"{pts} pts" : (won ? "Win" : "-"))
                                                .FontSize(9)
                                                .FontColor(won ? "#166534" : (pts.HasValue ? "#374151" : "#9ca3af"));

                                            if (won)
                                                cell.Item().AlignCenter()
                                                    .Text("Winner")
                                                    .FontSize(7).Bold().FontColor("#166534");
                                        });
                                    }

                                    if (hasAdvisory)
                                        t.Cell().Element(DataCell)
                                            .Text(advisory).FontSize(8)
                                            .FontColor("#6b7280").LineHeight(1.35f);
                                }

                                // Totals row
                                t.Cell().Element(TotalCell)
                                    .Text("TOTAL").FontSize(9).Bold().FontColor("#111827");

                                foreach (var cand in candidates)
                                {
                                    bool isOverallWinner = cand.IsWinner;
                                    t.Cell().Element(isOverallWinner ? WinnerCell : TotalCell).Column(cell =>
                                    {
                                        cell.Item().AlignCenter()
                                            .Text($"{cand.Score} pts")
                                            .FontSize(9).Bold()
                                            .FontColor(isOverallWinner ? "#166534" : "#374151");

                                        if (isOverallWinner)
                                            cell.Item().AlignCenter()
                                                .Text("Winner")
                                                .FontSize(7).Bold().FontColor("#166534");
                                    });
                                }

                                if (hasAdvisory)
                                    t.Cell().Element(TotalCell).Text("").FontSize(8);
                            });
                        });
                    }

                    // ── Attribute Comparison ─────────────────────────────
                    col.Item().Column(s =>
                    {
                        s.Item().Text("Attribute Comparison")
                            .Bold().FontSize(11).FontColor("#111827");
                        s.Item().PaddingTop(8).Column(inner =>
                        {
                            inner.Spacing(10);

                            if (isSummariseMode)
                            {
                                foreach (var attr in grouped)
                                {
                                    var normKey = attr.Key;
                                    var displayName = attributeLookup.ContainsKey(normKey)
                                        ? attributeLookup[normKey] : ToFriendly(normKey);
                                    var value = attr.Value.Values.FirstOrDefault() ?? "-";

                                    inner.Item().Column(a =>
                                    {
                                        a.Item().Row(r =>
                                        {
                                            r.ConstantItem(170)
                                                .Text(displayName)
                                                .FontSize(9).SemiBold().FontColor("#374151");
                                            r.RelativeItem()
                                                .Text(value)
                                                .FontSize(9).FontColor("#111827").LineHeight(1.4f);
                                        });

                                        RenderAiInsight(a, attributeInsights, normKey);

                                        a.Item().PaddingTop(5)
                                            .LineHorizontal(1).LineColor("#e5e7eb");
                                    });
                                }
                            }
                            else
                            {
                                foreach (var attr in grouped)
                                {
                                    var normKey = attr.Key;
                                    var displayName = attributeLookup.ContainsKey(normKey)
                                        ? attributeLookup[normKey] : ToFriendly(normKey);

                                    inner.Item().Column(a =>
                                    {
                                        a.Item().Text(displayName)
                                            .SemiBold().FontSize(10).FontColor("#111827");

                                        foreach (var doc in documents)
                                        {
                                            attr.Value.TryGetValue(doc, out var val);
                                            a.Item().PaddingTop(3).Row(r =>
                                            {
                                                r.ConstantItem(145)
                                                    .Text(doc)
                                                    .FontSize(9).FontColor("#6b7280");
                                                r.RelativeItem()
                                                    .Text(val ?? "-")
                                                    .FontSize(9).FontColor("#111827").LineHeight(1.4f);
                                            });
                                        }

                                        RenderAiInsight(a, attributeInsights, normKey);

                                        a.Item().PaddingTop(6)
                                            .LineHorizontal(1).LineColor("#e5e7eb");
                                    });
                                }
                            }
                        });
                    });
                });
            });
        }).GeneratePdf();

        // Filename: Summarise_<RunName> or Compare_<RunName>
        var fileBase = !string.IsNullOrWhiteSpace(runName) ? runName : reportTitle;
        var cleanTitle = System.Text.RegularExpressions.Regex
            .Replace(fileBase, @"[^\w\s-]", "").Trim().Replace(" ", "_");
        if (string.IsNullOrWhiteSpace(cleanTitle)) cleanTitle = "Report";
        var safeName = $"{modeText}_{cleanTitle}";

        var res = req.CreateResponse(HttpStatusCode.OK);
        res.Headers.Add("Content-Type", "application/pdf");
        res.Headers.Add("Content-Disposition", $"attachment; filename=\"{safeName}.pdf\"");
        res.Headers.Add("Access-Control-Expose-Headers", "Content-Disposition");
        await res.WriteBytesAsync(pdf);
        return res;
    }

    // =============================================================
    // HELPERS
    // =============================================================

    private static void RenderAiInsight(
        ColumnDescriptor col,
        Dictionary<string, (string Title, string Text, string Impact)> insights,
        string normKey)
    {
        if (!insights.ContainsKey(normKey)) return;
        var ai = insights[normKey];

        col.Item().PaddingTop(5)
            .BorderLeft(2).BorderColor("#818cf8")
            .PaddingLeft(8).PaddingVertical(6).PaddingRight(6)
            .Background("#f5f3ff")
            .Column(aiCol =>
            {
                aiCol.Item().Text("AI Insight")
                    .FontSize(8).SemiBold().FontColor("#6d28d9");

                if (!string.IsNullOrWhiteSpace(ai.Text))
                    aiCol.Item().PaddingTop(2).Text(ai.Text)
                        .FontSize(9).FontColor("#374151").LineHeight(1.4f);

                if (!string.IsNullOrWhiteSpace(ai.Impact))
                {
                    aiCol.Item().PaddingTop(4).Row(r =>
                    {
                        r.AutoItem().Text("Impact: ")
                            .FontSize(8).FontColor("#6b7280");
                        r.AutoItem()
                            .Background(GetRiskColor(ai.Impact))
                            .PaddingVertical(2).PaddingHorizontal(5)
                            .Text(ai.Impact.ToUpper())
                            .FontColor("#ffffff").FontSize(7);
                    });
                }
            });
    }

    private static decimal GetDecimalScore(Entity c)
    {
        if (!c.Attributes.Contains("ilx_totalscore") || c["ilx_totalscore"] == null) return 0;
        return c["ilx_totalscore"] switch
        {
            int i    => i,
            decimal d => d,
            double db => (decimal)db,
            _         => 0
        };
    }

    private static string NormalizeKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key)) return "";
        return key.Replace("_", "").Replace(" ", "").Replace("-", "").ToLowerInvariant();
    }

    private static string ResolveAttributeKey(
        string rawKey,
        Dictionary<string, Dictionary<string, string>> grouped,
        Dictionary<string, string> displayNameToKey)
    {
        if (string.IsNullOrWhiteSpace(rawKey)) return "";
        var normalized = NormalizeKey(rawKey);
        if (grouped.ContainsKey(normalized)) return normalized;
        if (displayNameToKey.ContainsKey(normalized)) return displayNameToKey[normalized];
        return normalized;
    }

    private static string ResolveAttributeKey(
        IEnumerable<string> rawKeys,
        Dictionary<string, Dictionary<string, string>> grouped,
        Dictionary<string, string> displayNameToKey)
    {
        foreach (var raw in rawKeys)
        {
            var resolved = ResolveAttributeKey(raw, grouped, displayNameToKey);
            if (!string.IsNullOrWhiteSpace(resolved) && grouped.ContainsKey(resolved))
                return resolved;
        }
        foreach (var raw in rawKeys)
        {
            var norm = NormalizeKey(raw);
            if (displayNameToKey.ContainsKey(norm)) return displayNameToKey[norm];
        }
        return "";
    }

    private static string ToFriendly(string key)
    {
        if (string.IsNullOrEmpty(key)) return "";
        var text = System.Text.RegularExpressions.Regex.Replace(
            key.Replace("_", " "), "([a-z])([A-Z])", "$1 $2");
        return System.Globalization.CultureInfo.CurrentCulture.TextInfo
            .ToTitleCase(text.ToLower());
    }

    private static string GetRiskColor(string risk) =>
        risk?.ToLower() switch
        {
            "high"   => "#dc2626",
            "medium" => "#f59e0b",
            _        => "#16a34a"
        };

    private static string ExtractAttributeName(string name)
    {
        if (string.IsNullOrEmpty(name)) return "";
        var parts = name.Split('-');
        return parts.Length > 1 ? parts[1].Trim() : name;
    }

    private static string ExtractDocName(string name)
    {
        if (string.IsNullOrEmpty(name)) return "";
        return name.Split('-')[0].Trim();
    }

    static IContainer HeaderCell(IContainer c) =>
        c.Background("#1e293b").Padding(5);

    static IContainer DataCell(IContainer c) =>
        c.Border(1).BorderColor("#e5e7eb").Padding(5);

    static IContainer WinnerCell(IContainer c) =>
        c.Background("#f0fdf4").Border(1).BorderColor("#bbf7d0").Padding(5);

    static IContainer TotalCell(IContainer c) =>
        c.Background("#f8fafc").Border(1).BorderColor("#d1d5db").Padding(5);
}

