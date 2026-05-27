import { useEffect, useState, useMemo } from "react"
import { configApi } from "../../services/configApi"
import { useNavigate } from "react-router-dom"
import { Rule } from "../../types/Rule"
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react"
import { PageBreadcrumb } from "../PageBreadcrumb"

type SortKey = "name" | "templateName" | "templateAttributeName" | "directionLabel" | "impactLabel" | "severityLabel" | "weight" | "isActive";
type SortDir = "asc" | "desc";

type Props = {
  templateAttributeId?: string
  hideHeader?: boolean
}

export default function RulesList({ templateAttributeId, hideHeader }: Props) {

  const [data, setData] = useState<Rule[]>([])
  const [comparisonDirections, setComparisonDirections] = useState<any[]>([])
  const [impactCategories, setImpactCategories] = useState<any[]>([])
  const [severities, setSeverities] = useState<any[]>([])
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const navigate = useNavigate()

  useEffect(() => { load() }, [templateAttributeId])

  function getLabel(options: any[], value?: number) {
    const item = options.find(x => x.value === value)
    return item?.label || ""
  }

  async function load() {
    try {
      const rules = templateAttributeId
        ? await configApi.getRulesByTemplateAttribute(templateAttributeId)
        : await configApi.getRules()

      const [directions, impacts, severityChoices] = await Promise.all([
        configApi.getChoiceOptions("ilx_analysisrule", "ilx_analysisdirection"),
        configApi.getChoiceOptions("ilx_analysisrule", "ilx_impactcategory"),
        configApi.getChoiceOptions("ilx_analysisrule", "ilx_severity"),
      ])

      setData(rules || [])
      setComparisonDirections(directions || [])
      setImpactCategories(impacts || [])
      setSeverities(severityChoices || [])
    } catch (err) {
      console.error("Failed to load rules", err)
    }
  }

  async function toggleActive(item: Rule) {
    const newStatus = !item.isActive
    try {
      await configApi.updateRule({ ...item, isActive: newStatus })
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
      (item.templateName || "").toLowerCase().includes(q) ||
      (item.templateAttributeName || "").toLowerCase().includes(q)
    )
  }, [data, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === "isActive") {
        const diff = (a.isActive ? 0 : 1) - (b.isActive ? 0 : 1)
        return sortDir === "asc" ? diff : -diff
      }
      if (sortKey === "weight") {
        const diff = (a.weight ?? 0) - (b.weight ?? 0)
        return sortDir === "asc" ? diff : -diff
      }
      let av = ""
      let bv = ""
      if (sortKey === "directionLabel") {
        av = getLabel(comparisonDirections, a.comparisonDirection).toLowerCase()
        bv = getLabel(comparisonDirections, b.comparisonDirection).toLowerCase()
      } else if (sortKey === "impactLabel") {
        av = getLabel(impactCategories, a.impactCategory).toLowerCase()
        bv = getLabel(impactCategories, b.impactCategory).toLowerCase()
      } else if (sortKey === "severityLabel") {
        av = getLabel(severities, a.severity).toLowerCase()
        bv = getLabel(severities, b.severity).toLowerCase()
      } else {
        av = ((a as any)[sortKey] || "").toString().toLowerCase()
        bv = ((b as any)[sortKey] || "").toString().toLowerCase()
      }
      const cmp = av.localeCompare(bv)
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir, comparisonDirections, impactCategories, severities])

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
            items={[{ label: "Back", onClick: () => navigate(-1) }, { label: "Rules" }]}
          />
          <div className="page-section-header">
            <div>
              <h2 className="page-section-title">Rules</h2>
              <p className="page-subtitle">Define rule logic for comparison attributes</p>
            </div>
            <button type="button" className="btn-primary"
              onClick={() => navigate(`/admin/rules/new${templateAttributeId ? `?attributeId=${templateAttributeId}` : ""}`)}>
              + New Rule
            </button>
          </div>
        </>
      ) : (
        <div className="page-header">
          <div />
          <button type="button" className="btn-primary"
            onClick={() => navigate(`/admin/rules/new${templateAttributeId ? `?attributeId=${templateAttributeId}` : ""}`)}>
            + New Rule
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="grid-filter-bar">
        <input
          className="search-input"
          placeholder="Search rules..."
          value={search}
          onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
        />
        <span className="grid-filter-count">{totalItems} rules</span>
      </div>

      {/* Grid */}
      <div className="insights-grid-wrap">
        <table className="insights-grid">
          <thead>
            <tr>
              <th className="col-sortable" onClick={() => handleSort("name")}>Name <SortIcon col="name" /></th>
              <th className="col-sortable" onClick={() => handleSort("templateName")}>Template <SortIcon col="templateName" /></th>
              <th className="col-sortable" onClick={() => handleSort("templateAttributeName")}>Attribute <SortIcon col="templateAttributeName" /></th>
              <th className="col-sortable" onClick={() => handleSort("directionLabel")}>Direction <SortIcon col="directionLabel" /></th>
              <th className="col-sortable" onClick={() => handleSort("impactLabel")}>Impact <SortIcon col="impactLabel" /></th>
              <th className="col-sortable" onClick={() => handleSort("severityLabel")}>Severity <SortIcon col="severityLabel" /></th>
              <th className="col-sortable col-center" onClick={() => handleSort("weight")}>Weight <SortIcon col="weight" /></th>
              <th className="col-sortable" onClick={() => handleSort("isActive")}>Status <SortIcon col="isActive" /></th>
              <th className="col-action"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 && (
              <tr><td colSpan={9} className="grid-empty">No rules found</td></tr>
            )}
            {pageData.map(item => (
              <tr key={item.id} className="grid-row" onClick={() => navigate(`/admin/rules/${item.id}`)}>
                <td>{item.name}</td>
                <td>{item.templateName || ""}</td>
                <td>{item.templateAttributeName || ""}</td>
                <td>{getLabel(comparisonDirections, item.comparisonDirection)}</td>
                <td>{getLabel(impactCategories, item.impactCategory)}</td>
                <td>{getLabel(severities, item.severity)}</td>
                <td className="col-center">{item.weight ?? ""}</td>
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
