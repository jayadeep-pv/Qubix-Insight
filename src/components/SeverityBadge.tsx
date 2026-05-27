import React from "react";

interface Props {
  level: "High" | "Medium" | "Low";
}

const SeverityBadge: React.FC<Props> = ({ level }) => {
  return <span className={`severity-badge ${level.toLowerCase()}`}>{level}</span>;
};

export default SeverityBadge;