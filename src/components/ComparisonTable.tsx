import React from "react";
import StatusBadge from "./StatusBadge";
import SeverityBadge from "./SeverityBadge";
import { Comparison } from "../types/Comparison";

interface Props {
  data: Comparison[];
}

const ComparisonTable: React.FC<Props> = ({ data }) => {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Template</th>
            <th>Created By</th>
            <th>Date</th>
            <th>Score</th>
            <th>High Severity</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id}>
              <td>
                <div className="run-title">
                  {item.insightName}
                </div>
                <div className="run-sub">
                  <div>{item.name}</div>
                  <div className="sub-text">{item.insightName}</div>
                </div>
              </td>
              <td>{item.template}</td>
              <td>{item.createdBy}</td>
              <td>{item.createdDate}</td>
              <td>{item.score}%</td>
              <td>
                <SeverityBadge
                  level={
                    (item.highSeverityCount || 0) > 2
                      ? "High"
                      : (item.highSeverityCount || 0) > 0
                      ? "Medium"
                      : "Low"
                  }
                />
              </td>
              <td>
                <StatusBadge status={item.status} />
              </td>
              <td>
                <button className="link-button">View</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ComparisonTable;