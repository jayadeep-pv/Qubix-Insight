import { useEffect, useState, useMemo } from "react";
import { configApi } from "../services/configApi";
import { AiInsightProfile } from "../types/AiInsightProfile";
import { useNavigate } from "react-router-dom";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { PageBreadcrumb } from "../components/PageBreadcrumb";

type SortKey = "profileName" | "profileCode" | "profileStatusLabel" | "statecode";
type SortDir = "asc" | "desc";

export default function AiInsightProfiles() {

  const [data, setData] = useState<AiInsightProfile[]>([]);
  const [profileStatuses, setProfileStatuses] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("profileName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const navigate = useNavigate();

  useEffect(() => { init(); }, []);

  async function init() {
    try {
      const result = await configApi.getAllAiInsightProfiles();
      setData(result || []);
      const statuses = await configApi.getChoiceOptions("ilx_aiinsightprofile", "ilx_profilestatus");
      setProfileStatuses(statuses || []);
    } catch (err) {
      console.error("Failed loading profiles", err);
    }
  }

  function getProfileStatusLabel(value?: number) {
    if (!value) return "";
    const item = profileStatuses.find(x => x.value === value);
    return item ? item.label : "";
  }

  async function toggleActive(item: AiInsightProfile) {
    const newState = item.statecode === 0 ? 1 : 0;
    try {
      await configApi.updateAiInsightProfile({
        id: item.id,
        profileName: item.profileName,
        profileCode: item.profileCode,
        profileStatus: item.profileStatus,
        prompt: item.prompt ?? "",
        displayOrder: item.displayOrder ?? 0,
        statecode: newState
      });
      init();
    } catch (err) {
      console.error("Status change failed", err);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data.filter(item =>
      !q ||
      (item.profileName || "").toLowerCase().includes(q) ||
      (item.profileCode || "").toLowerCase().includes(q) ||
      getProfileStatusLabel(item.profileStatus).toLowerCase().includes(q)
    );
  }, [data, search, profileStatuses]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av = "";
      let bv = "";
      if (sortKey === "profileStatusLabel") {
        av = getProfileStatusLabel(a.profileStatus).toLowerCase();
        bv = getProfileStatusLabel(b.profileStatus).toLowerCase();
      } else if (sortKey === "statecode") {
        const diff = (a.statecode ?? 0) - (b.statecode ?? 0);
        return sortDir === "asc" ? diff : -diff;
      } else {
        av = ((a as any)[sortKey] || "").toString().toLowerCase();
        bv = ((b as any)[sortKey] || "").toString().toLowerCase();
      }
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, profileStatuses]);

  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pageData = sorted.slice(startIdx, startIdx + pageSize);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
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

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown size={12} className="sort-icon inactive" />;
    return sortDir === "asc"
      ? <ChevronUp size={12} className="sort-icon active" />
      : <ChevronDown size={12} className="sort-icon active" />;
  }

  return (
    <div className="content-page">

      <PageBreadcrumb
        items={[{ label: "Back", onClick: () => navigate(-1) }, { label: "AI Insight Profiles" }]}
      />
      <div className="page-section-header">
        <div>
          <h2 className="page-section-title">AI Insight Profiles</h2>
          <p className="page-subtitle">Manage AI insight analysis modes used during document review</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => navigate("/admin/ai-insight-profiles/new")}>
          + New Profile
        </button>
      </div>

      {/* Filter Bar */}
      <div className="grid-filter-bar">
        <input
          className="search-input"
          placeholder="Search profiles..."
          value={search}
          onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
        />
        <span className="grid-filter-count">{totalItems} profiles</span>
      </div>

      {/* Grid */}
      <div className="insights-grid-wrap">
        <table className="insights-grid">
          <thead>
            <tr>
              <th className="col-sortable" onClick={() => handleSort("profileName")}>Name <SortIcon col="profileName" /></th>
              <th className="col-sortable" onClick={() => handleSort("profileCode")}>Code <SortIcon col="profileCode" /></th>
              <th className="col-sortable" onClick={() => handleSort("profileStatusLabel")}>Profile Status <SortIcon col="profileStatusLabel" /></th>
              <th className="col-sortable" onClick={() => handleSort("statecode")}>Status <SortIcon col="statecode" /></th>
              <th className="col-action"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 && (
              <tr><td colSpan={5} className="grid-empty">No AI Insight Profiles found</td></tr>
            )}
            {pageData.map(item => (
              <tr key={item.id} className="grid-row" onClick={() => navigate(`/admin/ai-insight-profiles/${item.id}`)}>
                <td>{item.profileName}</td>
                <td>{item.profileCode || ""}</td>
                <td>{getProfileStatusLabel(item.profileStatus)}</td>
                <td>
                  <span className={`status ${item.statecode === 0 ? "active" : "inactive"}`}>
                    {item.statecode === 0 ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="col-action">
                  <button
                    type="button"
                    className="btn-icon deactivate"
                    onClick={e => { e.stopPropagation(); toggleActive(item); }}
                    title={item.statecode === 0 ? "Deactivate" : "Reactivate"}
                  >{item.statecode === 0 ? "🚫" : "♻️"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="grid-pagination">
        <span className="pagination-info">
          {totalItems === 0 ? "No results"
            : totalPages <= 1 ? `All ${totalItems} ${totalItems === 1 ? "record" : "records"} shown`
            : `Showing ${startIdx + 1}–${Math.min(startIdx + pageSize, totalItems)} of ${totalItems}`}
        </span>
        {totalPages > 1 && (
          <div className="pagination-controls">
            <button type="button" className="page-btn" disabled={safePage === 1} onClick={() => setCurrentPage(1)} title="First page">«</button>
            <button type="button" className="page-btn" disabled={safePage === 1} onClick={() => setCurrentPage(p => p - 1)} title="Previous page">‹</button>
            {getPageNumbers().map((p, i) =>
              p === "..." ? <span key={`el-${i}`} className="page-ellipsis">…</span>
                : <button type="button" key={p} className={`page-btn${p === safePage ? " active" : ""}`} onClick={() => setCurrentPage(p as number)}>{p}</button>
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
}
