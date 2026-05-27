import React, { useEffect, useState, useMemo } from "react";
import { configApi } from "../services/configApi";
import { useNavigate } from "react-router-dom";
import { ChevronUp, ChevronDown, ChevronsUpDown, Zap } from "lucide-react";
import { PageBreadcrumb } from "../components/PageBreadcrumb";

type SortKey = "insightName" | "documentType" | "documentCount" | "createdBy" | "createdDate" | "status" | "mode";
type SortDir = "asc" | "desc";

interface InsightRow {
  id: string;
  insightName: string;
  runNumber: string;
  documentType: string;
  documentCount: number;
  createdBy: string;
  createdDate: string;
  createdDateRaw: number;
  status: string;
  mode: string;
  isActive: boolean;
}

const AllInsights: React.FC = () => {
  const navigate = useNavigate();

  const [rows, setRows] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("");
  const [createdByFilter, setCreatedByFilter] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("createdDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => { loadAllInsights(); }, []);

  async function loadAllInsights() {
    try {
      setLoading(true);
      const data = await configApi.getAllInsights();
      const mapped: InsightRow[] = (data || []).map((r: any) => ({
        id: r.id,
        insightName: r.insightName || r.runName || "Untitled",
        runNumber: r.runName || "",
        documentType: r.documentType || "-",
        documentCount: r.documentCount ?? 0,
        createdBy: r.createdBy || "",
        createdDate: r.createdOn ? new Date(r.createdOn).toLocaleDateString() : "",
        createdDateRaw: r.createdOn ? new Date(r.createdOn).getTime() : 0,
        mode: r.mode || "Compare",
        status: r.status || "Completed",
        isActive: r.isActive ?? true,
      }));
      setRows(mapped);
    } catch (err) {
      console.error("Failed to load All Insights", err);
    } finally {
      setLoading(false);
    }
  }

  const docTypes = useMemo(() => {
    return Array.from(new Set(rows.map(r => r.documentType).filter(t => t && t !== "-"))).sort();
  }, [rows]);

  const creators = useMemo(() => {
    return Array.from(new Set(rows.map(r => r.createdBy).filter(Boolean))).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(item => {
      if (q && !item.insightName.toLowerCase().includes(q) && !item.runNumber.toLowerCase().includes(q)) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (docTypeFilter && item.documentType !== docTypeFilter) return false;
      if (createdByFilter && item.createdBy !== createdByFilter) return false;
      return true;
    });
  }, [rows, search, statusFilter, docTypeFilter, createdByFilter]);

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
      const av = (a[sortKey as keyof InsightRow] as string || "").toString().toLowerCase();
      const bv = (b[sortKey as keyof InsightRow] as string || "").toString().toLowerCase();
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

  function onFilter(setter: React.Dispatch<React.SetStateAction<string>>) {
    return (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
      setter(e.target.value);
      setCurrentPage(1);
    };
  }

  const hasFilters = search || statusFilter || docTypeFilter || createdByFilter;

  function clearFilters() {
    setSearch(""); setStatusFilter(""); setDocTypeFilter(""); setCreatedByFilter("");
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
      loadAllInsights();
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
        items={[{ label: "Back", onClick: () => navigate(-1) }, { label: "All Insights" }]}
      />
      <div className="page-section-header">
        <div>
          <h2 className="page-section-title">All Insights</h2>
          <p className="page-subtitle">Insights generated across all comparison runs</p>
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
          onChange={onFilter(setSearch)}
          className="search-input"
        />

        <select title="Filter by status" value={statusFilter} onChange={onFilter(setStatusFilter)} className="filter-select">
          <option value="">All Statuses</option>
          <option value="Completed">Completed</option>
          <option value="Processing">Processing</option>
          <option value="Failed">Failed</option>
        </select>

        {docTypes.length > 0 && (
          <select title="Filter by document type" value={docTypeFilter} onChange={onFilter(setDocTypeFilter)} className="filter-select">
            <option value="">All Document Types</option>
            {docTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        {creators.length > 1 && (
          <select title="Filter by user" value={createdByFilter} onChange={onFilter(setCreatedByFilter)} className="filter-select">
            <option value="">All Users</option>
            {creators.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {hasFilters && (
          <button type="button" className="btn-clear-filters" onClick={clearFilters}>Clear</button>
        )}

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
              <th className="col-sortable" onClick={() => handleSort("createdBy")}>
                Created By <SortIcon col="createdBy" />
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
              <th className="col-action" aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="grid-empty">Loading insights…</td></tr>
            )}
            {!loading && pageData.length === 0 && (
              <tr><td colSpan={8} className="grid-empty">No insights match your filters</td></tr>
            )}
            {!loading && pageData.map(item => (
              <tr key={item.id} onClick={() => navigate(`/runs/${item.id}`)} className="grid-row">
                <td>
                  <div className="run-title">{item.insightName}</div>
                  <div className="run-sub">{item.runNumber}</div>
                </td>
                <td>{item.documentType}</td>
                <td className="col-center">{item.documentCount || "-"}</td>
                <td>{item.createdBy || "-"}</td>
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
            <button
              type="button"
              className="page-btn"
              disabled={safePage === 1}
              onClick={() => setCurrentPage(1)}
              title="First page"
            >«</button>
            <button
              type="button"
              className="page-btn"
              disabled={safePage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              title="Previous page"
            >‹</button>

            {getPageNumbers().map((p, i) =>
              p === "..." ? (
                <span key={`el-${i}`} className="page-ellipsis">…</span>
              ) : (
                <button
                  type="button"
                  key={p}
                  className={`page-btn${p === safePage ? " active" : ""}`}
                  onClick={() => setCurrentPage(p as number)}
                >{p}</button>
              )
            )}

            <button
              type="button"
              className="page-btn"
              disabled={safePage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              title="Next page"
            >›</button>
            <button
              type="button"
              className="page-btn"
              disabled={safePage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
              title="Last page"
            >»</button>
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

export default AllInsights;
