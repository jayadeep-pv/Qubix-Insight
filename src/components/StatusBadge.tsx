import React from "react";

interface StatusBadgeProps {
  status: "Processing" | "Completed" | "Failed";
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  return <span className={`status-badge ${status.toLowerCase()}`}>{status}</span>;
};

export default StatusBadge;