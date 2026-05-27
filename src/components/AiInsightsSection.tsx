import React from "react";

interface AiInsightRecord {
  id: string;
  profileName: string;
  executionTime?: number;
  aiSummaryJsonOutput: any;
}

interface NormalisedAiInsight {
  executiveSummary?: string;
  keyInsights?: any[];
  confidenceLevel?: any;
}

interface Props {
  insightRows: AiInsightRecord[];
  selectedInsightProfileName: string;
  setSelectedInsightProfileName: (name: string) => void;
  selectedInsight: NormalisedAiInsight | null;
  selectedInsightRow: AiInsightRecord | null;
}

const AiInsightsSection: React.FC<Props> = ({
  insightRows,
  selectedInsightProfileName,
  setSelectedInsightProfileName,
  selectedInsight,
  selectedInsightRow,
}) => {
  return (
    <div className="results-card">
    
      {/* Profile Switch Buttons */}
      {insightRows.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18, padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>
          {insightRows.map((r) => {
            const isActive = r.profileName === selectedInsightProfileName;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedInsightProfileName(r.profileName)}
                style={{
                  border: isActive ? "1px solid #c4b5fd" : "1px solid #e5e7eb",
                  background: isActive ? "#ede9fe" : "#f9fafb",
                  color: isActive ? "#5b21b6" : "#6b7280",
                  padding: "7px 16px",
                  borderRadius: 20,
                  cursor: "pointer",
                  fontWeight: isActive ? 700 : 500,
                  fontSize: 13,
                  transition: "all 0.15s ease",
                  boxShadow: isActive ? "0 0 0 2px rgba(139,92,246,0.12)" : "none",
                }}
              >
                {r.profileName}
              </button>
            );
          })}
        </div>
      )}

      {/* ============================= */}
      {/* EMPTY STATE */}
      {/* ============================= */}
      {!selectedInsight && (
        <div className="ai-empty" style={{ color: "#6b7280" }}>
          No AI insights available yet for this run.
        </div>
      )}

      {/* ============================= */}
      {/* INSIGHT CONTENT */}
      {/* ============================= */}
      {selectedInsight && (
        <>
          {/* Executive Summary */}
          {selectedInsight.executiveSummary && (
            <>
              <h3>Executive Summary</h3>
              <p>{selectedInsight.executiveSummary}</p>
            </>
          )}

          {/* Key Insights */}
          {Array.isArray(selectedInsight.keyInsights) &&
            selectedInsight.keyInsights.length > 0 && (
              <>
                <h3 style={{ marginTop: 18 }}>Key Insights</h3>

                {selectedInsight.keyInsights.map((k: any, idx: number) => {
                  const impact = (k?.Impact ?? k?.impact ?? "").toLowerCase();

                  const badgeClass =
                    impact === "high"
                      ? "badge-high"
                      : impact === "medium"
                      ? "badge-medium"
                      : impact === "low"
                      ? "badge-low"
                      : "badge-info";

                  const impactClass =
                    impact === "high"
                      ? "insight-high"
                      : impact === "medium"
                      ? "insight-medium"
                      : impact === "low"
                      ? "insight-low"
                      : "";

                  return (
                    <div key={idx} className={`insight-card ${impactClass}`}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 6,
                        }}
                      >
                        <strong>
                          {k?.Title ?? k?.title ?? "Insight"}
                        </strong>

                        <span className={`impact-badge ${badgeClass}`}>
                          {impact ? impact.toUpperCase() : "INFO"}
                        </span>
                      </div>

                      <p style={{ margin: 0 }}>
                        {k?.Description ?? k?.description}
                      </p>
                    </div>
                  );
                })}
              </>
            )}

          {/* Footer Info */}
          {selectedInsight.confidenceLevel && (
            <div style={{ marginTop: 16, fontSize: 13, color: "#6b7280" }}>
              Confidence Level: {selectedInsight.confidenceLevel}
            </div>
          )}

          {selectedInsightRow?.executionTime !== undefined && (
            <div style={{ marginTop: 6, fontSize: 13, color: "#9ca3af" }}>
              Execution Time: {selectedInsightRow.executionTime}s
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AiInsightsSection;