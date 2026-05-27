import React from "react";

interface KpiCardProps {
  title: string;
  value: number | string;
  subtitle?: string; // ✅ add this line
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, subtitle }) => {
  return (
    <div className="kpi-card">
      <div className="kpi-value">{value}</div>
      <div className="kpi-title">{title}</div>

      {subtitle && (
        <div className="kpi-subtitle">{subtitle}</div>
      )}
    </div>
  );
};

export default KpiCard;