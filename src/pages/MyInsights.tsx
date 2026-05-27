import React, { useEffect, useState, useMemo } from "react";
import { configApi } from "../services/configApi";
import { useMsal } from "@azure/msal-react";
import { useNavigate } from "react-router-dom";
import { ChevronUp, ChevronDown, ChevronsUpDown, Zap } from "lucide-react";
import { PageBreadcrumb } from "../components/PageBreadcrumb";

type SortKey = "insightName" | "documentType" | "documentCount" | "createdDate" | "status" | "mode";
type SortDir = "asc" | "desc";

interface InsightRow {
  id: string;
  insightName: string;
  runNumber: string;
  documentType: string;
  documentCount: number;
  createdDate: string;
  createdDateRaw: number;
  status: string;
  mode: string;
  isActive: boolean;
}

const MyInsights: React.FC = () => {
  const { instance } = useMsal();
  const navigate = useNavigate();

  const [rows, setRows] = useState<InsightRow[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => { loadMyInsights(); }, []);

  async function loadMyInsights() {
    try {
      const account = instance.getActiveAccount();
      const data = await configApi.getMyInsights(account?.username || "");
      setRows(
        (data || []).map((r: any) => ({
          id: r.id,
          insightName: r.insightName || r.runName || "Untitled",
          runNumber: r.runName || "",
          documentType: r.documentType || "-",
          documentCount: r.documentCount ?? 0,
          createdDate: r.createdOn ? new Date(r.createdOn).toLocaleDateString() : "",
          createdDateRaw: r.createdOn ? new Date(r.createdOn).getTime() : 0,
          status: r.status || "Completed",
          mode: r.mode || "Compare",
          isActive: r.isActive ?? true,
        }))
      );
    } catch (err) {
      console.error("Failed to load My Insights", err);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(item =>
      !q ||
      item.insightName.toLowerCase().includes(q) ||
      item.runNumber.toLowerCase().includes(q)
    );
  }, [rows, search]);

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
    <div className="content-page">

      <PageBreadcrumb
        items={[{ label: "Back", onClick: () => navigate(-1) }, { label: "My Insights" }]}
      />
      <div className="page-section-header">
        <div>
          <h2 className="page-section-title">My Insights</h2>
          <p className="page-subtitle">Insights generated from comparisons you executed</p>
        </div>
        <div className="header-action-group">
          <button type="button" className="btn-secondary" onClick={() => navigate("/new", { state: { mode: "extract" } })}>
            <Zap size={14} /> Smart Builder
          </button>
          <button type="button" className="btn-primary" onClick={() => navigate("/new")}>
            + New Comparison
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid-filter-bar">
        <input
          type="text"
          placeholder="Search by name or run..."
          value={search}
          onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
          className="search-input"
        />
        <span className="grid-filter-count">
          {totalItems} {totalItems === 1 ? "insight" : "insights"}
        </span>
      </div>

      {/* Grid */}
      <div className="insights-grid-wrap">
        <table className="insights-grid">
          <thead>
            <tr>
              <th className="col-sortable" onClick={() => handleSort("insightName")}>
                Run Name <SortIcon col="insightName" />
              </th>
              <th className="col-sortable" onClick={() => handleSort("documentType")}>
                Document Type <SortIcon col="documentType" />
              </th>
              <th className="col-sortable col-center" onClick={() => handleSort("documentCount")}>
                Docs <SortIcon col="documentCount" />
              </th>
              <th className="col-sortable" onClick={() => handleSort("createdDate")}>
                Date <SortIcon col="createdDate" />
              </th>
              <th className="col-sortable" onClick={() => handleSort("mode")}>
                Mode <SortIcon col="mode" />
              </th>
              <th className="col-sortable" onClick={() => handleSort("status")}>
                Status <SortIcon col="status" />
              </th>
              <th className="col-action"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 && (
              <tr><td colSpan={6} className="grid-empty">No insights found</td></tr>
            )}
            {pageData.map(item => (
              <tr key={item.id} className="grid-row" onClick={() => navigate(`/runs/${item.id}`)}>
                <td>
                  <div className="run-title">{item.insightName}</div>
                  <div className="run-sub">{item.runNumber}</div>
                </td>
                <td>{item.documentType}</td>
                <td className="col-center">{item.documentCount || "-"}</td>
                <td>{item.createdDate}</td>
                <td>
                  <span className={`mode-badge ${item.mode?.toLowerCase() === "summarise" ? "summarise" : "compare"}`}>
                    {item.mode || "-"}
                  </span>
                </td>
                <td>
                  <span className={`status-badge ${item.status.toLowerCase()}`}>
                    {item.status}
                  </span>
                </td>
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

    </div>
  );
};

export default MyInsights;
