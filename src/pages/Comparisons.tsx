import React, { useState } from "react";
import ComparisonFilters from "../components/ComparisonFilters";
import ComparisonTable from "../components/ComparisonTable";
import { Comparison } from "../types/Comparison";

const mockData: Comparison[] = [
  {
    id: "1",
    name: "London Lease Review",
    template: "Commercial Lease",
    createdBy: "Jay",
    createdDate: "18 Feb 2026",
    score: 82,
    highSeverityCount: 3,
    status: "Completed",
  },
  {
    id: "2",
    name: "Project Alpha Tender",
    template: "Construction Contract",
    createdBy: "Sarah",
    createdDate: "17 Feb 2026",
    score: 74,
    highSeverityCount: 1,
    status: "Processing",
  },
];

const Comparisons: React.FC = () => {
  const [search, setSearch] = useState("");
  const [template, setTemplate] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");

  const clearFilters = () => {
    setSearch("");
    setTemplate("");
    setStatus("");
    setSeverity("");
  };

  const filtered = mockData.filter((item) => {
    return (
      item.name.toLowerCase().includes(search.toLowerCase()) &&
      (template ? item.template === template : true) &&
      (status ? item.status === status : true)
    );
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>Comparisons</h2>
        <button className="primary-button">+ New Comparison</button>
      </div>

      <ComparisonFilters
        search={search}
        setSearch={setSearch}
        template={template}
        setTemplate={setTemplate}
        status={status}
        setStatus={setStatus}
        severity={severity}
        setSeverity={setSeverity}
        clearFilters={clearFilters}
      />

      <ComparisonTable data={filtered} />
    </div>
  );
};

export default Comparisons;