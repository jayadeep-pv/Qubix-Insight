import { useEffect, useState, useMemo } from "react"
import { configApi } from "../../services/configApi"
import type { ComparisonTemplate } from "../../types/ComparisonTemplate"
import { useNavigate } from "react-router-dom"
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react"
import { PageBreadcrumb } from "../PageBreadcrumb"

type SortKey = "name" | "documentType" | "isActive";
type SortDir = "asc" | "desc";

type Props = {
  documentTypeId?: string
  documentTypeName?: string
  hideHeader?: boolean
}

export default function TemplatesList({ documentTypeId, documentTypeName, hideHeader }: Props) {

  const [data, setData] = useState<ComparisonTemplate[]>([])
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const navigate = useNavigate()

  useEffect(() => { load() }, [documentTypeId])

  async function load() {
    try {
      const result = documentTypeId
        ? await configApi.getTemplatesByDocumentType(documentTypeId)
        : await configApi.getAllTemplates()
      setData(result || [])
    } catch (err) {
      console.error("Failed to load templates", err)
    }
  }

  async function toggleActive(item: ComparisonTemplate) {
    const newStatus = !item.isActive
    try {
      await configApi.updateTemplate(item.id!, {
        name: item.name,
        templateAiPrompt: item.templateAiPrompt ?? "",
        documentTypeId: item.documentTypeId,
        aiOutputStyleId: item.aiOutputStyleId ?? null,
        isDefault: item.isDefault ?? false,
        version: item.version ?? "",
        isActive: newStatus
      })
      load()
    } catch (err) {
      console.error("Status change failed", err)
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return data.filter(item =>
      !q ||
      (item.name || "").toLowerCase().includes(q) ||
      (item.documentType || "").toLowerCase().includes(q)
    )
  }, [data, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === "isActive") {
        const diff = (a.isActive ? 0 : 1) - (b.isActive ? 0 : 1)
        return sortDir === "asc" ? diff : -diff
      }
      const av = ((a as any)[sortKey] || "").toString().toLowerCase()
      const bv = ((b as any)[sortKey] || "").toString().toLowerCase()
      const cmp = av.localeCompare(bv)
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  const totalItems = sorted.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const startIdx = (safePage - 1) * pageSize
  const pageData = sorted.slice(startIdx, startIdx + pageSize)

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
    setCurrentPage(1)
  }

  function getPageNumbers(): (number | "...")[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | "...")[] = [1]
    if (safePage > 3) pages.push("...")
    for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) pages.push(i)
    if (safePage < totalPages - 2) pages.push("...")
    pages.push(totalPages)
    return pages
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown size={12} className="sort-icon inactive" />
    return sortDir === "asc"
      ? <ChevronUp size={12} className="sort-icon active" />
      : <ChevronDown size={12} className="sort-icon active" />
  }

  return (
    <div className="content-page">

      {!hideHeader ? (
        <>
          <PageBreadcrumb
            items={[{ label: "Back", onClick: () => navigate(-1) }, { label: "Templates" }]}
          />
          <div className="page-section-header">
            <div>
              <h2 className="page-section-title">Templates</h2>
              <p className="page-subtitle">Manage comparison templates used for document analysis</p>
            </div>
            <button type="button" className="btn-primary"
              onClick={() => navigate(`/comparison/new?documentTypeId=${documentTypeId || ""}`)}>
              + New Template
            </button>
          </div>
        </>
      ) : (
        <div className="page-header">
          <div />
          <button type="button" className="btn-primary"
            onClick={() => navigate(`/comparison/new?documentTypeId=${documentTypeId || ""}`)}>
            + New Template
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="grid-filter-bar">
        <input
          className="search-input"
          placeholder="Search templates..."
          value={search}
          onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
        />
        <span className="grid-filter-count">{totalItems} templates</span>
      </div>

      {/* Grid */}
      <div className="insights-grid-wrap">
        <table className="insights-grid">
          <thead>
            <tr>
              <th className="col-sortable" onClick={() => handleSort("name")}>Name <SortIcon col="name" /></th>
              <th className="col-sortable" onClick={() => handleSort("documentType")}>Document Type <SortIcon col="documentType" /></th>
              <th className="col-sortable" onClick={() => handleSort("isActive")}>Status <SortIcon col="isActive" /></th>
              <th className="col-action"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 && (
              <tr><td colSpan={4} className="grid-empty">No templates found</td></tr>
            )}
            {pageData.map(item => (
              <tr key={item.id} className="grid-row" onClick={() => navigate(`/comparison/${item.id}`)}>
                <td>{item.name}</td>
                <td>{item.documentType || documentTypeName || ""}</td>
                <td>
                  <span className={`status ${item.isActive ? "active" : "inactive"}`}>
                    {item.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="col-action">
                  <button
                    type="button"
                    className="btn-icon deactivate"
                    onClick={e => { e.stopPropagation(); toggleActive(item) }}
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
  )
}
