import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

interface NormalisedAiInsight {
  executiveSummary?: string;
  keyInsights?: any[];
  confidenceLevel?: any;
}

interface AiInsightRecord {
  id: string;
  profileName: string;
  executionTime?: number;
  aiSummaryJsonOutput: any;
}

interface Props {
  selectedInsight: NormalisedAiInsight | null;
  selectedInsightRow: AiInsightRecord | null;
}

const IMPACT_STYLE: Record<string, { border: string; badge: string; text: string }> = {
  high:   { border: "#ef4444", badge: "#ef4444", text: "#fff" },
  medium: { border: "#f59e0b", badge: "#f59e0b", text: "#1a1a1a" },
  low:    { border: "#22c55e", badge: "#22c55e", text: "#fff" },
};

const AiInsightsSection: React.FC<Props> = ({ selectedInsight }) => {
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  if (!selectedInsight) {
    return (
      <div style={{ color: "#6b7280", padding: "24px 0", textAlign: "center", fontSize: 14 }}>
        No AI insights available for this profile.
      </div>
    );
  }

  const insights = Array.isArray(selectedInsight.keyInsights) ? selectedInsight.keyInsights : [];

  return (
    <div>
      {selectedInsight.executiveSummary && (
        <div style={{
          background: "#f9fafb",
          border: "1px solid #f0f0f0",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 14,
          fontSize: 13.5,
          color: "#374151",
          lineHeight: 1.65,
        }}>
          {selectedInsight.executiveSummary}
        </div>
      )}

      {insights.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {insights.map((k: any, idx: number) => {
            const impact = (k?.Impact ?? k?.impact ?? "").toLowerCase();
            const style = IMPACT_STYLE[impact] ?? { border: "#9ca3af", badge: "#9ca3af", text: "#fff" };
            const isOpen = expandedCards.has(idx);

            return (
              <div
                key={idx}
                style={{
                  border: "1px solid #f0f0f0",
                  borderLeft: `4px solid ${style.border}`,
                  borderRadius: 8,
                  background: "white",
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "11px 14px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{
                    background: style.badge,
                    color: style.text,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 4,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    flexShrink: 0,
                    minWidth: 52,
                    textAlign: "center",
                  }}>
                    {impact || "info"}
                  </span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500, color: "#1f2937" }}>
                    {k?.Title ?? k?.title ?? "Insight"}
                  </span>
                  <ChevronDown
                    size={16}
                    color="#9ca3af"
                    style={{ flexShrink: 0, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
                  />
                </button>
                {isOpen && (
                  <div style={{
                    padding: "0 14px 14px 90px",
                    fontSize: 13,
                    color: "#4b5563",
                    lineHeight: 1.65,
                    borderTop: "1px solid #f5f5f5",
                    paddingTop: 10,
                  }}>
                    {k?.Description ?? k?.description}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {insights.length === 0 && !selectedInsight.executiveSummary && (
        <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "16px 0" }}>
          No findings for this profile.
        </div>
      )}
    </div>
  );
};

export default AiInsightsSection;
