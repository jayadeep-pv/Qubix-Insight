import { Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function TrialBanner() {
  const navigate = useNavigate();

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "5px 16px",
      background: "rgba(249, 115, 22, 0.04)",
      borderBottom: "1px solid rgba(249, 115, 22, 0.12)",
      fontSize: "12px",
      color: "#b45309",
    }}>
      <Zap size={12} style={{ color: "#F97316", flexShrink: 0 }} />
      <span style={{ color: "#92400e" }}>
        <strong>Trial account</strong> — Quick Extract only, limited to first 5 pages per document.
      </span>
      <button
        onClick={() => navigate("/support")}
        style={{
          marginLeft: "auto",
          padding: "2px 10px",
          background: "transparent",
          color: "#F97316",
          border: "1px solid rgba(249,115,22,0.35)",
          borderRadius: "5px",
          fontSize: "11px",
          fontWeight: 600,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Upgrade
      </button>
    </div>
  );
}
