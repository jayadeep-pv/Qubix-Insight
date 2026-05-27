import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Comparison } from "../types/Comparison";


interface Props {
  data: Comparison[];
  showCreatedBy?: boolean;   // ✅ ADD
}

const RecentComparisonsTable: React.FC<Props> = ({ data, showCreatedBy }) => {
  const navigate = useNavigate();

  return (

    <table className="table">

      <thead>
        <tr>
          <th style={{ width: "40%" }}>Run Name</th>
          <th style={{ width: "25%" }}>Document Type</th>
          <th style={{ width: "10%", textAlign: "center" }}>Docs</th>
            {showCreatedBy && (
          <th style={{ width: "15%" }}>Created By</th>
          )}
          <th style={{ width: "15%" }}>Date</th>
          <th style={{ width: "10%" }}>Mode</th>
          <th style={{ width: "80px", textAlign: "right" }}></th>
        </tr>
      </thead>

      <tbody>

        {data.length === 0 && (
          <tr>
            <td colSpan={4} style={{ padding: 20, textAlign: "center", color: "#777" }}>
              No runs found
            </td>
          </tr>
        )}

        {data.map((item) => (

          <tr key={item.id} className="grid-row" onClick={() => navigate(`/runs/${item.id}`)}>
              <td className="run-name-cell">
                <div className="run-title">
                  {item.insightName || "Untitled"}
                </div>
                <div className="run-sub">
                  {item.runNumber}
                </div>
              </td>

              <td>{item.documentType || "-"}</td>

              <td style={{ textAlign: "center" }}>
                {item.documentCount ?? "-"}
              </td>

              {showCreatedBy && (
                <td>{item.createdBy || "-"}</td>
              )}

              <td>{item.createdDate}</td>

              <td>
                <span className={`mode-badge ${(item.mode || "Compare").toLowerCase()}`}>
                  {item.mode || "Compare"}
                </span>
              </td>

              <td style={{ textAlign: "right" }}>
                <button
                  className="view-btn"
                  onClick={e => { e.stopPropagation(); navigate(`/runs/${item.id}`); }}
                  aria-label={`View results for ${item.insightName || item.runNumber || "run"}`}
                  title="View results"
                >
                  <ArrowRight size={18} />
                </button>
              </td>

          </tr>

        ))}

      </tbody>

    </table>

  );
};

export default RecentComparisonsTable;