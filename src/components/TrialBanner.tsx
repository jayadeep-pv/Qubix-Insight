import { Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function TrialBanner() {
  const navigate = useNavigate();

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "9px 20px",
      background: "rgba(250, 70, 22, 0.07)",
      borderBottom: "1px solid rgba(250, 70, 22, 0.18)",
      fontSize: "13px",
      color: "#92400e",
    }}>
      <Zap size={14} style={{ color: "#FA4616", flexShrink: 0 }} />
      <span>
        <strong>Trial account</strong> — Quick Extract only, limited to first 5 pages per document.
      </span>
      <button
        onClick={() => navigate("/support")}
        style={{
          marginLeft: "auto",
          padding: "4px 14px",
          background: "#FA4616",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          fontSize: "12px",
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
