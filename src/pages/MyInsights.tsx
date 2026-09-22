import React, { useEffect, useState, useMemo } from "react";
import { configApi } from "../services/configApi";
import { useNavigate, useLocation } from "react-router-dom";
import { useUser } from "../context/UserContext";
import {
  ChevronUp, ChevronDown, ChevronsUpDown, Search,
  Table2, KanbanSquare, Plus, ArrowUpRight, Download, FileText, AlertTriangle,
} from "lucide-react";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { IMPACT_STYLE, parseSummaryToBullets } from "../components/AiInsightsSection";

type SortKey = "insightName" | "documentType" | "documentCount" | "createdDate" | "riskLevel" | "mode";
type SortDir = "asc" | "desc";
type ViewMode = "table" | "board";

interface InsightRow {
  id: string;
  insightName: string;
  runNumber: string;
  documentType: string;
  documentCount: number;
  createdDate: string;
  createdDateRaw: number;
  riskLevel: string | null;
  mode: string;
  isActive: boolean;
  createdBy: string;
}

const MODE_BADGE_CLS: Record<string, string> = { Summarise: "summarise", Compare: "compare", Scoring: "scoring" };
const RISK_BADGE_CLS: Record<string, string> = { High: "high", Medium: "medium", Low: "low" };
const ALL_MODES = ["Summarise", "Scoring", "Compare", "Discovery"];

const DATE_PRESETS = [
  { key: "any", label: "Any time" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
];

const MyInsights: React.FC = () => {
  const { userEmail } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [rows, setRows] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState((location.state as any)?.query ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("createdDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [viewMode, setViewMode] = useState<ViewMode>("board");

  const [modeFilter, setModeFilter] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [datePreset, setDatePreset] = useState("any");

  // Board view — selected run's detail, fetched from the same endpoints the
  // Results page itself uses (GetComparisonRunResults + GetRunInsights).
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"risk" | "insights" | "attributes" | "attributeInsights">("risk");
  const [detailLoading, setDetailLoading] = useState(false);
  type Finding = { title: string; description: string; impact: string; clauseReference?: string; quotedExcerpt?: string };
  const [detail, setDetail] = useState<{
    documents: { id: string; name: string; url: string }[];
    attributes: { attributeId: string; attributeName: string; riskLevel?: string; values: any[] }[];
    profiles: { profileName: string; executiveSummary: string; keyInsights: Finding[] }[];
    attributeInsights: { attributeName: string; title: string; description: string; impact: string; confidence?: number }[];
  } | null>(null);

  // Every finding across every profile, any severity, high-first — the single
  // list the Findings tab reads from.
  const allFindings = useMemo(() => {
    if (!detail) return [];
    const list = detail.profiles.flatMap(p => p.keyInsights);
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...list].sort((a, b) => (rank[a.impact] ?? 3) - (rank[b.impact] ?? 3));
  }, [detail]);

  useEffect(() => { if (userEmail) loadMyInsights(); }, [userEmail]);

  useEffect(() => {
    if (!selectedRunId) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    Promise.all([
      configApi.getComparisonRunResults(selectedRunId),
      configApi.getRunInsights(selectedRunId).catch(() => []),
    ]).then(([results, insightRows]: [any, any]) => {
      if (cancelled) return;

      const documents = (results.Documents ?? []).map((d: any) => ({
        id: d.Id, name: d.Name || "Document", url: d.DocumentUrl,
      }));
      const attributes = (results.Attributes ?? []).map((a: any) => ({
        attributeId: a.AttributeId,
        attributeName: a.AttributeName,
        riskLevel: a.RiskLevel,
        values: a.Values ?? [],
      }));

      // Per-attribute AI insight — a different source again (attribute-level
      // commentary, e.g. "this field looks off"), not the run-level profile
      // findings above. Skips attributes with no insight or "Not Found".
      const attributeInsights: any[] = [];
      (results.Attributes ?? []).forEach((a: any) => {
        const val = (a.Values ?? []).find((v: any) => v.AttributeAiInsight && v.AttributeAiInsight !== "Not Found");
        if (!val) return;
        try {
          const parsed = typeof val.AttributeAiInsight === "string" ? JSON.parse(val.AttributeAiInsight) : val.AttributeAiInsight;
          const title = parsed?.title ?? parsed?.Title;
          const description = parsed?.description ?? parsed?.Description;
          if (!title && !description) return;
          attributeInsights.push({
            attributeName: a.AttributeName,
            title: title ?? "",
            description: description ?? "",
            impact: (parsed?.impact ?? parsed?.Impact ?? "").toLowerCase(),
            confidence: val.ConfidenceScore,
          });
        } catch { /* not valid JSON — skip */ }
      });

      // One source of truth per profile — every severity, plus the executive
      // summary. The two tabs read different slices of this; neither repeats
      // the other's content.
      const profiles: any[] = [];
      (insightRows ?? []).forEach((row: any) => {
        try {
          const parsed = typeof row.output === "string" ? JSON.parse(row.output) : row.output;
          const executiveSummary = parsed?.executiveSummary ?? parsed?.ExecutiveSummary ?? "";
          const keyInsights = parsed?.keyInsights ?? parsed?.KeyInsights ?? [];
          const mapped = keyInsights.map((k: any) => ({
            title: k?.Title ?? k?.title ?? "Finding",
            description: k?.Description ?? k?.description ?? "",
            impact: (k?.Impact ?? k?.impact ?? "").toLowerCase(),
            clauseReference: k?.ClauseReference ?? k?.clauseReference,
            quotedExcerpt: k?.QuotedExcerpt ?? k?.quotedExcerpt,
          }));
          profiles.push({ profileName: row.profileName || "AI Insight", executiveSummary, keyInsights: mapped });
        } catch { /* skip a profile whose output isn't valid JSON */ }
      });

      const anyFindings = profiles.some(p => p.keyInsights.length > 0);
      setDetail({ documents, attributes, profiles, attributeInsights });
      setDetailTab(anyFindings ? "risk" : "attributes");
    }).catch(err => {
      console.error("Failed to load run detail", err);
      if (!cancelled) setDetail(null);
    }).finally(() => { if (!cancelled) setDetailLoading(false); });

    return () => { cancelled = true; };
  }, [selectedRunId]);

  async function loadMyInsights() {
    try {
      const data = await configApi.getMyInsights(userEmail);
      setRows(
        (data || []).map((r: any) => ({
          id: r.id,
          insightName: r.insightName || r.runName || "Untitled",
          runNumber: r.runName || "",
          documentType: r.documentType || "-",
          documentCount: r.documentCount ?? 0,
          createdDate: r.createdOn ? new Date(r.createdOn).toLocaleDateString("en-GB") : "",
          createdDateRaw: r.createdOn ? new Date(r.createdOn).getTime() : 0,
          riskLevel: r.riskLevel || null,
          mode: r.mode || "Compare",
          isActive: r.isActive ?? true,
          createdBy: r.createdBy || "",
        }))
      );
    } catch (err) {
      console.error("Failed to load My Insights", err);
    } finally {
      setLoading(false);
    }
  }

  // Distinct document types present, for the filter dropdown — never hardcoded,
  // since this is a generic tool and the mix varies entirely by tenant.
  const documentTypes = useMemo(
    () => Array.from(new Set(rows.map(r => r.documentType).filter(t => t && t !== "-"))).sort(),
    [rows]
  );

  const modeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach(r => { counts[r.mode] = (counts[r.mode] || 0) + 1; });
    return counts;
  }, [rows]);

  const docTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach(r => { if (r.documentType && r.documentType !== "-") counts[r.documentType] = (counts[r.documentType] || 0) + 1; });
    return counts;
  }, [rows]);

  const riskCounts = useMemo(() => {
    const counts: Record<string, number> = { High: 0, Medium: 0, Low: 0 };
    rows.forEach(r => { if (r.riskLevel && counts[r.riskLevel] !== undefined) counts[r.riskLevel]++; });
    return counts;
  }, [rows]);

  const totalDocuments = useMemo(() => rows.reduce((sum, r) => sum + r.documentCount, 0), [rows]);
  const totalRisked = riskCounts.High + riskCounts.Medium + riskCounts.Low;

  const clearAllFilters = () => {
    setModeFilter(""); setDocTypeFilter(""); setRiskFilter(""); setDatePreset("any"); setSearch("");
  };

  const hasActiveFilters = !!(modeFilter || docTypeFilter || riskFilter || datePreset !== "any" || search);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const now = Date.now();
    const cutoff = datePreset === "30" ? now - 30 * 86_400_000 : datePreset === "90" ? now - 90 * 86_400_000 : 0;

    return rows.filter(item => {
      if (q && !item.insightName.toLowerCase().includes(q) && !item.runNumber.toLowerCase().includes(q)) return false;
      if (modeFilter && item.mode !== modeFilter) return false;
      if (docTypeFilter && item.documentType !== docTypeFilter) return false;
      if (riskFilter && item.riskLevel !== riskFilter) return false;
      if (cutoff && item.createdDateRaw < cutoff) return false;
      return true;
    });
  }, [rows, search, modeFilter, docTypeFilter, riskFilter, datePreset]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === "documentCount") {
        const diff = a.documentCount - b.documentCount;
        return sortDir === "asc" ? diff : -diff;
      }
      if (sortKey === "createdDate") {
        const diff = a.createdDateRaw - b.createdDateRaw;
        return sortDir === "asc" ? diff : -diff;
      }
      const av = (a[sortKey] || "").toString().toLowerCase();
      const bv = (b[sortKey] || "").toString().toLowerCase();
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // Keep a run selected in Board view — default to the newest match, and
  // re-pick if the current selection gets filtered out.
  useEffect(() => {
    if (viewMode !== "board") return;
    if (selectedRunId && sorted.some(r => r.id === selectedRunId)) return;
    setSelectedRunId(sorted[0]?.id ?? null);
  }, [viewMode, sorted, selectedRunId]);

  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pageData = sorted.slice(startIdx, startIdx + pageSize);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
    setCurrentPage(1);
  }

  function getPageNumbers(): (number | "...")[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "...")[] = [1];
    if (safePage > 3) pages.push("...");
    for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) pages.push(i);
    if (safePage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  }

  async function toggleActive(item: InsightRow) {
    try {
      await configApi.toggleInsightActive(item.id, !item.isActive);
      loadMyInsights();
    } catch (err) {
      console.error("Status change failed", err);
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown size={12} className="sort-icon inactive" />;
    return sortDir === "asc"
      ? <ChevronUp size={12} className="sort-icon active" />
      : <ChevronDown size={12} className="sort-icon active" />;
  }

  return (
    <div className="content-page mi-content-page">

      <PageBreadcrumb items={[{ label: "Back", onClick: () => navigate(-1) }, { label: "My Insights" }]} />

      <div className="mi-header">
        <div>
          <h2 className="page-section-title">Insights</h2>
        </div>
        <div className="mi-header-actions">
          <div className="mi-view-toggle">
            <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
              <Table2 size={13} /> Table
            </button>
            <button type="button" className={viewMode === "board" ? "active" : ""} onClick={() => setViewMode("board")}>
              <KanbanSquare size={13} /> Board
            </button>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => navigate("/analysis")}>
            <Plus size={14} /> New Insight
          </button>
        </div>
      </div>

      {viewMode === "board" ? (
        <div className="mi-board">

          {/* LEFT — filters */}
          <div className="mi-board-filters">
            <div className="mi-board-filters-hd">
              <span>Filters</span>
              {hasActiveFilters && <button type="button" onClick={clearAllFilters}>Clear</button>}
            </div>

            <div className="mi-board-group">
              <p className="mi-board-group-title">Risk</p>
              {(["High", "Medium", "Low"] as const).map(level => (
                <label key={level} className="mi-board-check">
                  <input type="checkbox" checked={riskFilter === level} onChange={() => setRiskFilter(riskFilter === level ? "" : level)} />
                  <span className={`mi-board-dot ${level.toLowerCase()}`} />
                  <span className="mi-board-check-label">{level}</span>
                  <span className="mi-board-check-count">{riskCounts[level]}</span>
                </label>
              ))}
            </div>

            <div className="mi-board-group">
              <p className="mi-board-group-title">Workflow</p>
              {ALL_MODES.map(mode => {
                const count = modeCounts[mode] || 0;
                return (
                  <label key={mode} className={`mi-board-check${count === 0 ? " disabled" : ""}`}>
                    <input type="checkbox" disabled={count === 0} checked={modeFilter === mode} onChange={() => setModeFilter(modeFilter === mode ? "" : mode)} />
                    <span className="mi-board-check-label">{mode}</span>
                    <span className="mi-board-check-count">{count}</span>
                  </label>
                );
              })}
            </div>

            {Object.keys(docTypeCounts).length > 0 && (
              <div className="mi-board-group">
                <p className="mi-board-group-title">Document type</p>
                {Object.entries(docTypeCounts).map(([type, count]) => (
                  <label key={type} className="mi-board-check">
                    <input type="checkbox" checked={docTypeFilter === type} onChange={() => setDocTypeFilter(docTypeFilter === type ? "" : type)} />
                    <span className="mi-board-check-label">{type}</span>
                    <span className="mi-board-check-count">{count}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="mi-board-group">
              <p className="mi-board-group-title">Created</p>
              {DATE_PRESETS.map(p => (
                <label key={p.key} className="mi-board-check">
                  <input type="radio" name="mi-date" checked={datePreset === p.key} onChange={() => setDatePreset(p.key)} />
                  <span className="mi-board-check-label">{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* MIDDLE — matching runs */}
          <div className="mi-board-list">
            <div className="mi-board-list-hd">
              <span>{totalItems} run{totalItems === 1 ? "" : "s"} match</span>
            </div>
            <div className="mi-board-search">
              <div className="mi-search">
                <Search size={13} className="mi-search-icon" />
                <input
                  type="text"
                  placeholder="Search runs..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>
            <div className="mi-board-list-body">
              {sorted.map(r => (
                <button
                  key={r.id}
                  type="button"
                  className={`mi-board-card${r.id === selectedRunId ? " selected" : ""}`}
                  onClick={() => setSelectedRunId(r.id)}
                >
                  <div className="mi-board-card-top">
                    <span className="mi-board-card-title">{r.insightName}</span>
                    {r.riskLevel && <span className={`badge badge-risk-${RISK_BADGE_CLS[r.riskLevel]}`}>{r.riskLevel}</span>}
                  </div>
                  <div className="mi-board-card-sub">{r.documentType} · {r.documentCount || 1} doc{r.documentCount === 1 ? "" : "s"}</div>
                  <div className="mi-board-card-meta">
                    <span className={`mode-badge ${MODE_BADGE_CLS[r.mode] || "compare"}`}>{r.mode}</span>
                    <span>{r.runNumber} · {r.createdDate}</span>
                  </div>
                </button>
              ))}
              {sorted.length === 0 && rows.length > 0 && (
                <div className="mi-board-hidden-note">
                  <p>{rows.length} run{rows.length === 1 ? "" : "s"} hidden by the current filters.</p>
                  <button type="button" onClick={clearAllFilters}>Show all {rows.length} runs</button>
                </div>
              )}
              {rows.length === 0 && !loading && (
                <div className="mi-board-hidden-note"><p>No runs yet.</p></div>
              )}
            </div>
          </div>

          {/* RIGHT — detail */}
          <div className="mi-board-detail">
            {!selectedRunId && <div className="mi-board-detail-empty">Select a run to see its details.</div>}
            {selectedRunId && (() => {
              const run = rows.find(r => r.id === selectedRunId);
              if (!run) return null;
              return (
                <>
                  <div className="mi-board-detail-hd">
                    <div>
                      <h3>{run.insightName}</h3>
                      <p className="mi-board-detail-meta">
                        {run.runNumber} · {run.createdDate}{run.createdBy ? ` · by ${run.createdBy}` : ""}
                      </p>
                    </div>
                    {run.riskLevel && <span className={`badge badge-risk-${RISK_BADGE_CLS[run.riskLevel]}`}>{run.riskLevel} risk</span>}
                  </div>

                  {detail && detail.documents.length > 0 && (
                    <div className="mi-board-doc-chips">
                      {detail.documents.map(d => (
                        <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className="mi-board-doc-chip">
                          <FileText size={12} /> {d.name}
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="mi-board-detail-actions">
                    <button type="button" className="btn btn-primary" onClick={() => navigate(`/runs/${run.id}`)}>
                      Open full report <ArrowUpRight size={13} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={async () => {
                        try {
                          const { blob, filename } = await configApi.exportComparisonPdf(run.id);
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
                          window.URL.revokeObjectURL(url);
                        } catch (err) { console.error("Export failed", err); }
                      }}
                    >
                      <Download size={13} /> Export
                    </button>
                  </div>

                  {detailLoading && <p className="mi-board-detail-loading">Loading run details…</p>}

                  {!detailLoading && detail && (
                    <>
                      <div className="mi-board-detail-tabs">
                        <button type="button" className={detailTab === "risk" ? "active" : ""} onClick={() => setDetailTab("risk")}>
                          Findings{allFindings.length > 0 ? ` (${allFindings.length})` : ""}
                        </button>
                        <button type="button" className={detailTab === "insights" ? "active" : ""} onClick={() => setDetailTab("insights")}>
                          Profile Summary
                        </button>
                        <button type="button" className={detailTab === "attributes" ? "active" : ""} onClick={() => setDetailTab("attributes")}>
                          Extracted attributes{detail.attributes.length > 0 ? ` (${detail.attributes.length})` : ""}
                        </button>
                        <button type="button" className={detailTab === "attributeInsights" ? "active" : ""} onClick={() => setDetailTab("attributeInsights")}>
                          Attribute AI Insights{detail.attributeInsights.length > 0 ? ` (${detail.attributeInsights.length})` : ""}
                        </button>
                      </div>

                      {/* One list, every severity, full detail — no second copy elsewhere. */}
                      {detailTab === "risk" && (
                        allFindings.length === 0 ? (
                          <p className="mi-board-tab-empty">No findings for this run.</p>
                        ) : (
                          <div className="mi-board-section">
                            {allFindings.map((f, i) => (
                              <div key={i} className={`mi-finding ${f.impact}`}>
                                <div className="mi-finding-top">
                                  <AlertTriangle size={13} />
                                  <span className="mi-finding-title">{f.title}</span>
                                  <span
                                    className="mi-finding-pill"
                                    style={{
                                      background: (IMPACT_STYLE[f.impact] ?? IMPACT_STYLE.low).badge,
                                      color: (IMPACT_STYLE[f.impact] ?? IMPACT_STYLE.low).text,
                                    }}
                                  >
                                    {f.impact || "info"}
                                  </span>
                                  {f.clauseReference && <span className="mi-finding-clause">{f.clauseReference}</span>}
                                </div>
                                {f.quotedExcerpt && <div className="mi-finding-quote">“{f.quotedExcerpt}”</div>}
                                {f.description && <div className="mi-finding-desc">{f.description}</div>}
                              </div>
                            ))}
                          </div>
                        )
                      )}

                      {/* Prose only — the findings above are never repeated here. */}
                      {detailTab === "insights" && (
                        detail.profiles.every(p => !p.executiveSummary) ? (
                          <p className="mi-board-tab-empty">No executive summary for this run.</p>
                        ) : (
                          <div className="mi-board-section">
                            {detail.profiles.filter(p => p.executiveSummary).map((p, pi) => (
                              <div key={pi} className="mi-profile-block">
                                <p className="mi-profile-name">{p.profileName}</p>
                                <p className="mi-profile-subhead">Executive Summary</p>
                                <ul className="mi-profile-summary-list">
                                  {parseSummaryToBullets(p.executiveSummary).map((point, bi) => (
                                    <li key={bi}>{point}</li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        )
                      )}

                      {detailTab === "attributes" && (
                        detail.attributes.length === 0 ? (
                          <p className="mi-board-tab-empty">No attributes extracted for this run.</p>
                        ) : (
                          <div className="mi-board-section">
                            <div className="mi-board-attr-table-wrap">
                              <table className="mi-board-attr-table">
                                <thead>
                                  <tr>
                                    <th>Attribute</th>
                                    {detail.documents.map(d => <th key={d.id}>{d.name}</th>)}
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.attributes.map(a => (
                                    <tr key={a.attributeId}>
                                      <td className="mi-board-attr-name">{a.attributeName}</td>
                                      {detail.documents.map(d => {
                                        const v = a.values.find((val: any) => val.DocumentId === d.id || val.documentId === d.id) ?? a.values[detail.documents.indexOf(d)];
                                        const flagged = a.riskLevel === "High" || a.riskLevel === "Medium";
                                        return <td key={d.id} className={flagged ? `mi-board-attr-flag ${a.riskLevel?.toLowerCase()}` : ""}>{v?.Value ?? v?.value ?? "—"}</td>;
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )
                      )}

                      {detailTab === "attributeInsights" && (
                        detail.attributeInsights.length === 0 ? (
                          <p className="mi-board-tab-empty">No attribute-level AI insights for this run.</p>
                        ) : (
                          <div className="mi-board-section">
                            {detail.attributeInsights.map((f, i) => {
                              const style = IMPACT_STYLE[f.impact] ?? IMPACT_STYLE.low;
                              return (
                                <div key={i} className="mi-attr-insight-card">
                                  <p className="mi-attr-insight-attr">{f.attributeName}</p>
                                  {f.title && <p className="mi-attr-insight-title">{f.title}</p>}
                                  {f.description && <p className="mi-attr-insight-desc">{f.description}</p>}
                                  <div className="mi-attr-insight-footer">
                                    {f.impact && (
                                      <span
                                        className="mi-finding-pill"
                                        style={{ background: style.badge, color: style.text }}
                                      >
                                        {f.impact}
                                      </span>
                                    )}
                                    {typeof f.confidence === "number" && (
                                      <span className="mi-attr-insight-confidence">Confidence: {Math.round(f.confidence)}%</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )
                      )}

                    </>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      ) : (
        <>
          {/* Quick-filter chips — computed from what's actually in this workspace,
              not hardcoded to any document type. */}
          <div className="mi-chips">
            <button type="button" className={`mi-chip${!hasActiveFilters ? " active" : ""}`} onClick={clearAllFilters}>
              All runs · {rows.length}
            </button>
            {riskCounts.High > 0 && (
              <button type="button" className={`mi-chip${riskFilter === "High" ? " active" : ""}`} onClick={() => setRiskFilter(riskFilter === "High" ? "" : "High")}>
                High risk · {riskCounts.High}
              </button>
            )}
            {Object.entries(modeCounts).map(([mode, count]) => (
              <button key={mode} type="button" className={`mi-chip${modeFilter === mode ? " active" : ""}`} onClick={() => setModeFilter(modeFilter === mode ? "" : mode)}>
                {mode} · {count}
              </button>
            ))}
          </div>

          {/* Filter Bar */}
          <div className="mi-filter-bar">
            <div className="mi-search">
              <Search size={13} className="mi-search-icon" />
              <input
                type="text"
                placeholder="Filter by run name or ID..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                className="search-input"
                style={{ paddingLeft: 28 }}
              />
            </div>
            <select className="filter-select" value={modeFilter} onChange={e => { setModeFilter(e.target.value); setCurrentPage(1); }}>
              <option value="">Mode</option>
              {Object.keys(modeCounts).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className="filter-select" value={docTypeFilter} onChange={e => { setDocTypeFilter(e.target.value); setCurrentPage(1); }}>
              <option value="">Document type</option>
              {documentTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="filter-select" value={riskFilter} onChange={e => { setRiskFilter(e.target.value); setCurrentPage(1); }}>
              <option value="">Risk</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <select className="filter-select" value={datePreset} onChange={e => { setDatePreset(e.target.value); setCurrentPage(1); }}>
              {DATE_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            {hasActiveFilters && (
              <button type="button" className="mi-clear-filters" onClick={clearAllFilters}>Clear filters</button>
            )}
          </div>

          {/* Stats */}
          <div className="mi-stats">
            <div className="mi-stat"><span className="mi-stat-label">Runs</span><span className="mi-stat-value">{rows.length}</span></div>
            <div className="mi-stat"><span className="mi-stat-label">Documents</span><span className="mi-stat-value">{totalDocuments}</span></div>
            <div className="mi-risk-block">
              <span className="mi-stat-label">Risk across all {rows.length} runs</span>
              {totalRisked > 0 ? (
                <>
                  <div className="mi-risk-bar">
                    {riskCounts.Low > 0 && <div className="mi-risk-seg low" style={{ width: `${(riskCounts.Low / totalRisked) * 100}%` }} />}
                    {riskCounts.Medium > 0 && <div className="mi-risk-seg medium" style={{ width: `${(riskCounts.Medium / totalRisked) * 100}%` }} />}
                    {riskCounts.High > 0 && <div className="mi-risk-seg high" style={{ width: `${(riskCounts.High / totalRisked) * 100}%` }} />}
                  </div>
                  <div className="mi-risk-legend">
                    <span><i className="dot low" />Low {riskCounts.Low}</span>
                    <span><i className="dot medium" />Medium {riskCounts.Medium}</span>
                    <span><i className="dot high" />High {riskCounts.High}</span>
                  </div>
                </>
              ) : (
                <p className="mi-risk-empty">No risk data yet — risk shows here once your runs include a Risk Assessment.</p>
              )}
            </div>
          </div>

          {/* Grid */}
          <div className="insights-grid-wrap">
            <table className="insights-grid">
              <thead>
                <tr>
                  <th className="col-sortable" onClick={() => handleSort("insightName")}>Run <SortIcon col="insightName" /></th>
                  <th className="col-sortable" onClick={() => handleSort("documentType")}>Document Type <SortIcon col="documentType" /></th>
                  <th className="col-sortable col-center" onClick={() => handleSort("documentCount")}>Docs <SortIcon col="documentCount" /></th>
                  <th className="col-sortable" onClick={() => handleSort("mode")}>Mode <SortIcon col="mode" /></th>
                  <th className="col-sortable" onClick={() => handleSort("riskLevel")}>Risk <SortIcon col="riskLevel" /></th>
                  <th className="col-sortable" onClick={() => handleSort("createdDate")}>Updated <SortIcon col="createdDate" /></th>
                  <th className="col-action"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={7} className="grid-empty">Loading…</td></tr>
                )}
                {!loading && pageData.length === 0 && (
                  <tr><td colSpan={7} className="grid-empty">No insights match these filters</td></tr>
                )}
                {!loading && pageData.map(item => (
                  <tr key={item.id} className="grid-row" onClick={() => navigate(`/runs/${item.id}`)}>
                    <td>
                      <div className="run-title">{item.insightName}</div>
                      <div className="run-sub">{item.runNumber}</div>
                    </td>
                    <td>{item.documentType}</td>
                    <td className="col-center">{item.documentCount || "-"}</td>
                    <td><span className={`mode-badge ${MODE_BADGE_CLS[item.mode] || "compare"}`}>{item.mode}</span></td>
                    <td>{item.riskLevel ? <span className={`badge badge-risk-${RISK_BADGE_CLS[item.riskLevel]?.toLowerCase() || "low"}`}>{item.riskLevel}</span> : <span className="mi-risk-none">—</span>}</td>
                    <td>{item.createdDate}</td>
                    <td className="col-action">
                      <button
                        type="button"
                        className="btn-icon deactivate"
                        onClick={e => { e.stopPropagation(); toggleActive(item); }}
                        title={item.isActive ? "Deactivate" : "Reactivate"}
                      >{item.isActive ? "🚫" : "♻️"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="grid-pagination">
            <span className="pagination-info">
              {totalItems === 0
                ? "No results"
                : totalPages <= 1
                  ? `All ${totalItems} ${totalItems === 1 ? "record" : "records"} shown`
                  : `Showing ${startIdx + 1}–${Math.min(startIdx + pageSize, totalItems)} of ${totalItems}`}
            </span>
            {totalPages > 1 && (
              <div className="pagination-controls">
                <button type="button" className="page-btn" disabled={safePage === 1} onClick={() => setCurrentPage(1)} title="First page">«</button>
                <button type="button" className="page-btn" disabled={safePage === 1} onClick={() => setCurrentPage(p => p - 1)} title="Previous page">‹</button>
                {getPageNumbers().map((p, i) =>
                  p === "..." ? (
                    <span key={`el-${i}`} className="page-ellipsis">…</span>
                  ) : (
                    <button type="button" key={p} className={`page-btn${p === safePage ? " active" : ""}`} onClick={() => setCurrentPage(p as number)}>{p}</button>
                  )
                )}
                <button type="button" className="page-btn" disabled={safePage === totalPages} onClick={() => setCurrentPage(p => p + 1)} title="Next page">›</button>
                <button type="button" className="page-btn" disabled={safePage === totalPages} onClick={() => setCurrentPage(totalPages)} title="Last page">»</button>
              </div>
            )}
            <div className="pagination-right">
              <select
                title="Rows per page"
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="filter-select"
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>
          </div>
        </>
      )}

      <style>{`
        .mi-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; margin-bottom: 16px; flex-wrap: wrap; }
        .mi-header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

        .mi-view-toggle { display: flex; border: 1px solid #e5e7eb; border-radius: 9px; padding: 3px; background: #f8fafc; }
        .mi-view-toggle button {
          display: flex; align-items: center; gap: 5px; border: none; background: none;
          border-radius: 7px; padding: 6px 12px; font-size: 12.5px; font-weight: 600; color: #6b7280; cursor: pointer;
        }
        .mi-view-toggle button.active { background: #fff; color: #111827; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }

        .mi-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
        .mi-chip {
          border: 1px solid #e5e7eb; background: #fff; border-radius: 999px; padding: 6px 13px;
          font-size: 12.5px; font-weight: 600; color: #374151; cursor: pointer; white-space: nowrap;
        }
        .mi-chip:hover { border-color: #d1d5db; }
        .mi-chip.active { background: #111827; border-color: #111827; color: #fff; }

        .mi-filter-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 16px; }
        .mi-search { position: relative; flex: 1; min-width: 220px; }
        .mi-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #9ca3af; pointer-events: none; }
        .mi-search .search-input {
          width: 100%; box-sizing: border-box;
          padding: 6px 10px 6px 30px;
          font-size: 12.5px; height: 30px;
          border: 1px solid #e5e7eb; border-radius: 8px;
        }
        .mi-search .search-input:focus { outline: none; border-color: #C9441B; box-shadow: 0 0 0 3px rgba(201,68,27,0.12); }
        .mi-clear-filters { background: none; border: none; color: #6b7280; font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
        .mi-clear-filters:hover { color: #111827; }

        .mi-stats { display: grid; grid-template-columns: auto auto 1fr; gap: 20px; align-items: center; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 20px; margin-bottom: 16px; }
        .mi-stat { display: flex; flex-direction: column; gap: 2px; padding-right: 20px; border-right: 1px solid #f1f5f9; }
        .mi-stat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; }
        .mi-stat-value { font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 700; color: #0f172a; }
        .mi-risk-block { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .mi-risk-bar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: #f1f5f9; }
        .mi-risk-seg.low { background: #16a34a; }
        .mi-risk-seg.medium { background: #d97706; }
        .mi-risk-seg.high { background: #dc2626; }
        .mi-risk-legend { display: flex; gap: 14px; font-size: 12px; color: #4b5563; flex-wrap: wrap; }
        .mi-risk-legend .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; }
        .mi-risk-legend .dot.low { background: #16a34a; }
        .mi-risk-legend .dot.medium { background: #d97706; }
        .mi-risk-legend .dot.high { background: #dc2626; }
        .mi-risk-empty { font-size: 12px; color: #9ca3af; margin: 0; }
        .mi-risk-none { color: #d1d5db; }

        /* ── Board view ─────────────────────────────────────── */
        /* .content-page normally uses flex:1;min-height:0 so an inner pane can own
           its own scroll — but the Board view's detail pane grows taller than the
           viewport by design (see .mi-board-detail below), so that combo capped this
           page's box to viewport height while its content overflowed past it,
           leaving the shared footer to render right after the short box, on top of
           the overflowing content instead of below it. Let this page size to its
           actual content and let .content (which already scrolls) handle the rest. */
        .mi-content-page { flex: none; min-height: auto; }

        .mi-board { display: grid; grid-template-columns: 220px 340px 1fr; gap: 16px; align-items: start; }
        @media (max-width: 1100px) {
          .mi-board { grid-template-columns: 1fr; }
          /* Sticky columns only make sense side-by-side — stacked on top of
             each other they'd fight over the same top:0 spot as the page scrolls. */
          .mi-board-filters { position: static; }
          .mi-board-list { position: static; max-height: none; }
        }

        .mi-board-filters {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 16px;
          position: sticky; top: 0;
        }
        .mi-board-filters-hd { display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #374151; margin-bottom: 10px; }
        .mi-board-filters-hd button { background: none; border: none; color: #a8350f; font-size: 11.5px; font-weight: 600; cursor: pointer; text-transform: none; letter-spacing: 0; }
        .mi-board-group { margin-bottom: 12px; }
        .mi-board-group-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin: 0 0 4px; }
        .mi-board-check { display: flex; align-items: center; gap: 6px; padding: 1px 0; font-size: 12.5px; line-height: 1.9; color: #374151; cursor: pointer; }
        .mi-board-check.disabled { color: #d1d5db; cursor: default; }
        .mi-board-check input { accent-color: #a8350f; margin: 0; width: 13px; height: 13px; flex-shrink: 0; }
        .mi-board-check-label { flex: 1; }
        .mi-board-check-count { font-size: 11px; color: #9ca3af; }
        .mi-board-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .mi-board-dot.high { background: #dc2626; }
        .mi-board-dot.medium { background: #d97706; }
        .mi-board-dot.low { background: #16a34a; }

        .mi-board-list {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;
          position: sticky; top: 0; max-height: 80vh; display: flex; flex-direction: column;
        }
        .mi-board-list-hd { flex-shrink: 0; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-size: 12.5px; font-weight: 700; color: #111827; }
        .mi-board-search { flex-shrink: 0; padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
        .mi-board-search .mi-search { flex: none; min-width: 0; width: 100%; }
        .mi-board-list-body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
        .mi-board-card {
          text-align: left; background: #fff; border: 1px solid #ebebeb; border-left: 3px solid #e5e7eb;
          border-radius: 8px; padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 4px;
        }
        .mi-board-card:hover { border-color: #d1d5db; }
        .mi-board-card.selected { border-left-color: #a8350f; background: #fffaf7; }
        .mi-board-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
        .mi-board-card-title { font-size: 13px; font-weight: 700; color: #111827; }
        .mi-board-card-sub { font-size: 11.5px; color: #9ca3af; }
        .mi-board-card-meta { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #9ca3af; }
        .mi-board-hidden-note { padding: 20px 14px; text-align: center; }
        .mi-board-hidden-note p { font-size: 12px; color: #9ca3af; margin: 0 0 8px; }
        .mi-board-hidden-note button { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 14px; font-size: 12px; font-weight: 600; color: #374151; cursor: pointer; }

        .mi-board-detail { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; min-width: 0; }
        .mi-board-detail-empty { padding: 60px 20px; text-align: center; color: #9ca3af; font-size: 13px; }
        .mi-board-detail-hd { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
        .mi-board-detail-hd h3 { font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 4px; }
        .mi-board-detail-meta { font-size: 12px; color: #9ca3af; margin: 0; }
        .mi-board-detail-actions { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
        .mi-board-detail-loading { color: #9ca3af; font-size: 13px; padding: 20px 0; }

        .mi-board-section { margin-top: 0; }
        .mi-board-detail-tabs {
          display: flex; gap: 4px; border-bottom: 1px solid #f1f5f9; margin-bottom: 16px;
          overflow-x: auto; -webkit-overflow-scrolling: touch;
        }
        .mi-board-detail-tabs button {
          background: none; border: none; border-bottom: 2px solid transparent;
          padding: 8px 4px; margin-right: 16px; font-size: 12.5px; font-weight: 600; color: #9ca3af; cursor: pointer;
          white-space: nowrap; flex-shrink: 0;
        }
        .mi-board-detail-tabs button.active { color: #a8350f; border-bottom-color: #a8350f; }
        .mi-board-tab-empty { font-size: 12.5px; color: #9ca3af; padding: 16px 0; }

        .mi-finding { border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; border-left: 3px solid; }
        .mi-finding.high { background: #fef2f2; border-left-color: #dc2626; }
        .mi-finding.medium { background: #fffbeb; border-left-color: #d97706; }
        .mi-finding-top { display: flex; align-items: center; gap: 7px; }
        .mi-finding.high .mi-finding-top { color: #dc2626; }
        .mi-finding.medium .mi-finding-top { color: #d97706; }
        .mi-finding-title { flex: 1; font-size: 13px; font-weight: 600; color: #1f2937; }
        .mi-finding-clause { font-size: 11px; font-weight: 700; }
        .mi-finding-quote { font-style: italic; font-size: 12.5px; color: #4b5563; margin: 6px 0 4px; padding-left: 20px; }
        .mi-finding-desc { font-size: 12.5px; color: #4b5563; padding-left: 20px; line-height: 1.5; }

        .mi-board-attr-table-wrap { overflow-x: auto; }
        .mi-board-attr-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .mi-board-attr-table th { text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; padding: 6px 10px; border-bottom: 1px solid #f1f5f9; white-space: nowrap; }
        .mi-board-attr-table td { padding: 8px 10px; border-bottom: 1px solid #f8fafc; color: #374151; }
        .mi-board-attr-name { font-weight: 600; color: #111827; white-space: nowrap; }
        .mi-board-attr-flag.high { color: #dc2626; font-weight: 600; }
        .mi-board-attr-flag.medium { color: #d97706; font-weight: 600; }

        .mi-board-doc-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .mi-board-doc-chip {
          display: inline-flex; align-items: center; gap: 5px; background: #f8fafc; border: 1px solid #e2e8f0;
          border-radius: 999px; padding: 4px 11px; font-size: 11.5px; color: #475569; text-decoration: none;
        }
        .mi-board-doc-chip:hover { border-color: #a8350f; color: #a8350f; }

        .mi-finding-pill {
          font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
          padding: 3px 8px; border-radius: 4px; flex-shrink: 0; text-align: center;
        }

        .mi-profile-block { margin-bottom: 18px; }
        .mi-profile-name { font-size: 13.5px; font-weight: 700; color: #1f2937; margin: 0 0 8px; }
        .mi-profile-subhead { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin: 0 0 6px; }
        .mi-profile-summary-list {
          margin: 0 0 10px; padding: 4px 14px; background: #f9fafb; border: 1px solid #f0f0f0; border-radius: 8px; list-style: none;
        }
        .mi-profile-summary-list li {
          font-size: 12.5px; color: #4b5563; line-height: 1.65; padding: 7px 0; position: relative; padding-left: 15px;
          border-bottom: 1px solid #f3f4f6;
        }
        .mi-profile-summary-list li:last-child { border-bottom: none; }
        .mi-profile-summary-list li::before {
          content: ""; position: absolute; left: 0; top: 13px; width: 5px; height: 5px; border-radius: 50%; background: #d1d5db;
        }

        .mi-attr-insight-card { border: 1px solid #f0f0f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; background: #fff; }
        .mi-attr-insight-attr { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin: 0 0 6px; }
        .mi-attr-insight-title { font-size: 13.5px; font-weight: 600; color: #1f2937; margin: 0 0 4px; }
        .mi-attr-insight-desc { font-size: 12.5px; color: #4b5563; line-height: 1.6; margin: 0 0 10px; }
        .mi-attr-insight-footer { display: flex; align-items: center; gap: 10px; }
        .mi-attr-insight-confidence { font-size: 11.5px; color: #9ca3af; font-weight: 600; }
        .mi-insight-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f8fafc; }
        .mi-insight-title { font-size: 12.5px; color: #374151; }

        @media (max-width: 860px) { .mi-stats { grid-template-columns: 1fr; } .mi-stat { border-right: none; padding-right: 0; } }
      `}</style>

    </div>
  );
};

export default MyInsights;
