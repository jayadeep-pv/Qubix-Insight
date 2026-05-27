import React from "react";

interface Props {
  search: string;
  setSearch: (v: string) => void;
  template: string;
  setTemplate: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  severity: string;
  setSeverity: (v: string) => void;
  clearFilters: () => void;
}

const ComparisonFilters: React.FC<Props> = ({
  search,
  setSearch,
  template,
  setTemplate,
  status,
  setStatus,
  severity,
  setSeverity,
  clearFilters,
}) => {
  return (
    <div className="filters-bar">

      {/* Search */}
      <div className="filter-group">
        <label htmlFor="searchFilter">Search</label>
        <input
          id="searchFilter"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Template */}
      <div className="filter-group">
        <label htmlFor="templateFilter">Template</label>
        <select
          id="templateFilter"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        >
          <option value="">All Templates</option>
          <option value="Commercial Lease">Commercial Lease</option>
          <option value="Construction Contract">Construction Contract</option>
        </select>
      </div>

      {/* Status */}
      <div className="filter-group">
        <label htmlFor="statusFilter">Status</label>
        <select
          id="statusFilter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="Completed">Completed</option>
          <option value="Processing">Processing</option>
          <option value="Failed">Failed</option>
        </select>
      </div>

      {/* Severity */}
      <div className="filter-group">
        <label htmlFor="severityFilter">Severity</label>
        <select
          id="severityFilter"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option value="">All Severity</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>

      {/* Clear Button */}
      <div className="filter-group">
        <label style={{ visibility: "hidden" }}>Clear</label>
        <button
          type="button"
          className="clear-button"
          onClick={clearFilters}
        >
          Clear
        </button>
      </div>

    </div>
  );
};

export default ComparisonFilters;