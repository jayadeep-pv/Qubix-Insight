import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { configApi } from "../services/configApi";
import { useUser } from "../context/UserContext";
import { useMyReminders } from "../hooks/useMyReminders";
import DiscoveryGuideCard from "../components/DiscoveryGuideCard";
import {
  UploadCloud, Zap, AlignLeft, GitCompare, Star, ChevronRight,
  AlertTriangle, Bell, CheckCircle2, ArrowUpRight,
} from "lucide-react";

interface RecentRun {
  id: string;
  name: string;
  documentType: string;
  mode: string;
  createdOn: string;
  documentCount: number;
}

const WORKFLOWS: {
  key: "extract" | "summarise" | "compare" | "compare-scoring";
  label: string;
  desc: string;
  req: string;
  icon: React.ReactNode;
  cls: string;
}[] = [
  { key: "extract", label: "Discovery", desc: "AI detects and builds a template from your document instantly", req: "No template needed", icon: <Zap size={20} />, cls: "orange" },
  { key: "summarise", label: "Summarise", desc: "Extract key insights and attributes from a single document", req: "1 document", icon: <AlignLeft size={20} />, cls: "teal" },
  { key: "compare", label: "Compare", desc: "Extract and compare fields across two or more documents side by side", req: "2+ documents", icon: <GitCompare size={20} />, cls: "blue" },
  { key: "compare-scoring", label: "Scoring", desc: "Rank documents against weighted criteria with a scored winner", req: "2+ docs and rules", icon: <Star size={20} />, cls: "purple" },
];

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const MODE_PILL_CLS: Record<string, string> = { Summarise: "sum", Compare: "cmp", Scoring: "scr" };

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { isTrial, userName: fullName } = useUser();
  const firstName = fullName?.split(" ")[0] || "there";
  const { overdue, thisWeek } = useMyReminders();

  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [modeSplit, setModeSplit] = useState<{ name: string; value: number }[]>([]);
  const [totalHighRisk, setTotalHighRisk] = useState(0);
  const [totalRuns, setTotalRuns] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    configApi.getInsightsDashboard("7d")
      .then((data: any) => {
        setRecentRuns(
          (data.recentRuns || []).slice(0, 6).map((r: any) => ({
            id: r.id,
            name: r.insightName || r.runName || "Untitled",
            documentType: r.documentType || "Document",
            mode: r.mode || "Compare",
            createdOn: r.createdOn || "",
            documentCount: r.documentCount ?? 0,
          }))
        );
        setModeSplit([
          { name: "Summarise", value: data.modeSplit?.summarise || 0 },
          { name: "Compare", value: data.modeSplit?.compare || 0 },
          { name: "Scoring", value: data.modeSplit?.scoring || 0 },
        ]);
        setTotalHighRisk(data.totalHighRisk ?? 0);
        setTotalRuns(data.totalRuns ?? 0);
      })
      .catch(() => setRecentRuns([]))
      .finally(() => setLoading(false));
  }, []);

  // Discovery only ever processes one document — only the first file (dropped
  // or browsed) is forwarded, matching the limit already enforced on the
  // Discovery upload screen itself.
  const startWithFile = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const first = files[0];
    navigate("/analysis", { state: { mode: "extract", from: "home", initialFiles: [first] } });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    startWithFile(e.dataTransfer.files);
  };
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current += 1; setIsDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current -= 1; if (dragCounter.current <= 0) setIsDragging(false); };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  const upcomingReminders = [...overdue, ...thisWeek];
  const totalModeRuns = modeSplit.reduce((s, m) => s + m.value, 0);
  const hasAttention = totalHighRisk > 0 || upcomingReminders.length > 0;

  return (
    <div className="hp-root">

      <div className="hp-hero-row">
        <div>
          <h1 className="hp-hero-title">{getGreeting()}, {firstName}</h1>
          <p className="hp-hero-sub">Drop a file and Qubix picks the document type, the template and the workflow for you.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/my-insights")}>
          View all runs <ArrowUpRight size={14} />
        </button>
      </div>

      <div className="hp-upload-grid">
        <div
          className={`hp-dropzone${isDragging ? " dragging" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
        >
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
            onChange={(e) => startWithFile(e.target.files)}
          />
          <div className="hp-dropzone-icon"><UploadCloud size={30} strokeWidth={1.25} /></div>
          <div className="hp-dropzone-title">{isDragging ? "Drop to upload" : "Upload and discover"}</div>
          <div className="hp-dropzone-sub">
            {isDragging
              ? "Release to start"
              : "Extract key insights using Qubix document intelligence."}
          </div>
          <button type="button" className="btn btn-primary" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
            Browse files
          </button>
          <div className="hp-dropzone-formats">PDF, DOCX, TXT or scans · one document at a time</div>
        </div>
        <DiscoveryGuideCard compact />
      </div>

      <div className="hp-workflow-picker">
        <span className="hp-workflow-picker-label">Or pick a workflow yourself</span>
        <div className="hp-workflow-chips">
          {WORKFLOWS.map(w => {
            const locked = (w.key === "compare" || w.key === "compare-scoring") && isTrial;
            return (
              <button
                key={w.key}
                type="button"
                className={`hp-chip hp-chip--${w.cls}${locked ? " hp-chip--locked" : ""}`}
                disabled={locked}
                title={locked ? "Not available on trial" : undefined}
                onClick={() => navigate("/analysis", { state: { mode: w.key, from: "home" } })}
              >
                <span className="hp-chip-icon">{w.icon}</span>
                <span>
                  <span className="hp-chip-label">{w.label}</span>
                  <span className="hp-chip-desc">{w.desc}</span>
                  <span className="hp-chip-req">{locked ? "Upgrade to use" : w.req}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="hp-bottom-split">

        <div className="hp-panel">
          <div className="hp-panel-hd">
            <div className="hp-panel-hd-left">
              <span className="hp-panel-title">Recent runs</span>
            </div>
            <button type="button" className="hp-viewall" onClick={() => navigate("/my-insights")}>View all {totalRuns} →</button>
          </div>

          {loading && (
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
              {[...Array(4)].map((_, i) => <div key={i} className="hp-skel" style={{ height: 40, borderRadius: 8 }} />)}
            </div>
          )}

          {!loading && recentRuns.length === 0 && (
            <div className="hp-empty">
              <p className="hp-empty-title">No runs yet</p>
              <p className="hp-empty-sub">Drop a document above to get started</p>
            </div>
          )}

          {!loading && recentRuns.length > 0 && (
            <table className="hp-runs-table">
              <thead>
                <tr><th>Run</th><th>Mode</th><th>Updated</th><th /></tr>
              </thead>
              <tbody>
                {recentRuns.map(r => (
                  <tr key={r.id} onClick={() => navigate(`/runs/${r.id}`)}>
                    <td>
                      <div className="hp-run-name">{r.name}</div>
                      <div className="hp-run-meta">{r.documentType} · {r.documentCount || 1} doc{r.documentCount === 1 ? "" : "s"}</div>
                    </td>
                    <td><span className={`hp-mode-pill hp-mode-pill--${MODE_PILL_CLS[r.mode] || "cmp"}`}>{r.mode}</span></td>
                    <td className="hp-run-updated">{timeAgo(r.createdOn)}</td>
                    <td><ChevronRight size={14} className="hp-run-chevron" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="hp-side-col">

          <div className="hp-panel">
            <div className="hp-panel-hd">
              <div className="hp-panel-hd-left">
                <span className="hp-panel-title">Needs your attention</span>
              </div>
            </div>
            <div className="hp-attention-body">
              {!hasAttention && (
                <div className="hp-attention-ok">
                  <CheckCircle2 size={16} />
                  <span>You're all caught up</span>
                </div>
              )}
              {totalHighRisk > 0 && (
                <button type="button" className="hp-attention-item" onClick={() => navigate("/all-insights")}>
                  <span className="hp-attention-icon hp-attention-icon--red"><AlertTriangle size={14} /></span>
                  <span className="hp-attention-text">
                    <span className="hp-attention-title">{totalHighRisk} high-risk finding{totalHighRisk === 1 ? "" : "s"}</span>
                    <span className="hp-attention-sub">Across all your runs</span>
                  </span>
                </button>
              )}
              {upcomingReminders.slice(0, 2).map(r => (
                <button key={r.id} type="button" className="hp-attention-item" onClick={() => navigate("/my-reminders")}>
                  <span className="hp-attention-icon hp-attention-icon--blue"><Bell size={14} /></span>
                  <span className="hp-attention-text">
                    <span className="hp-attention-title">{r.title}</span>
                    <span className="hp-attention-sub">{r.documentName ?? "Reminder"}</span>
                  </span>
                </button>
              ))}
              {upcomingReminders.length > 2 && (
                <button type="button" className="hp-attention-more" onClick={() => navigate("/my-reminders")}>
                  +{upcomingReminders.length - 2} more reminder{upcomingReminders.length - 2 === 1 ? "" : "s"}
                </button>
              )}
            </div>
          </div>

          <div className="hp-panel">
            <div className="hp-panel-hd">
              <div className="hp-panel-hd-left">
                <span className="hp-panel-title">Runs by workflow</span>
                <span className="hp-panel-sub">Last 7 days · {totalModeRuns} run{totalModeRuns === 1 ? "" : "s"}</span>
              </div>
            </div>
            <div className="hp-workflow-bars">
              {totalModeRuns === 0 && <p className="hp-empty-sub" style={{ padding: "4px 20px 16px" }}>No runs in the last 7 days</p>}
              {modeSplit.filter(m => m.value > 0).map(m => (
                <div key={m.name} className="hp-wf-row">
                  <span className="hp-wf-label">{m.name}</span>
                  <div className="hp-wf-track">
                    <div className="hp-wf-fill" style={{ width: `${(m.value / totalModeRuns) * 100}%` }} />
                  </div>
                  <span className="hp-wf-value">{m.value} · {Math.round((m.value / totalModeRuns) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      <style>{`
        .hp-root { display: flex; flex-direction: column; gap: 14px; padding-top: 0; }

        .hp-hero-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
        .hp-hero-title { font-family: 'Syne', sans-serif; font-size: 27px; font-weight: 700; color: #0f172a; margin: 0 0 4px; letter-spacing: -0.02em; }
        .hp-hero-sub { font-size: 13px; color: #64748b; margin: 0; }

        .hp-upload-grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 18px; align-items: stretch; }
        @media (max-width: 900px) { .hp-upload-grid { grid-template-columns: 1fr; } }
        /* App.css sets a global .guidance-card { max-height: fit-content }
           which blocks the grid's stretch from equalizing this card's height
           with the dropzone — override it here so both sides match. */
        .hp-upload-grid .guidance-card { max-height: none; height: 100%; box-sizing: border-box; }

        .hp-dropzone {
          background: #fff; border: 3px dashed #cbd5e1; border-radius: 14px;
          box-shadow: 0 1px 6px rgba(0,0,0,0.04);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 3px; padding: 10px 20px; cursor: pointer; transition: all 0.15s ease; text-align: center;
        }
        .hp-dropzone:hover { border-color: var(--brand-orange); background: #fffaf7; }
        .hp-dropzone.dragging { border-color: var(--brand-orange); background: #fff3ec; }
        .hp-dropzone-icon {
          width: 34px; height: 34px;
          color: #94a3b8;
          display: flex; align-items: center; justify-content: center; margin-bottom: 1px;
        }
        .hp-dropzone-title { font-size: 16px; font-weight: 700; color: #111827; letter-spacing: -0.01em; }
        .hp-dropzone-sub { font-size: 11.5px; color: #6b7280; margin-bottom: 4px; white-space: nowrap; }
        .hp-dropzone-formats { font-size: 10.5px; color: #9ca3af; margin-top: 3px; }

        .hp-workflow-picker { display: flex; flex-direction: column; gap: 10px; }
        .hp-workflow-picker-label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #9ca3af; }
        .hp-workflow-chips { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        @media (max-width: 860px) { .hp-workflow-chips { grid-template-columns: repeat(2, 1fr); } }

        .hp-chip {
          display: flex; align-items: center; gap: 12px; text-align: left;
          border: 1px solid transparent; border-radius: 10px; padding: 13px 14px;
          cursor: pointer; transition: all 0.15s ease;
        }
        .hp-chip:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.07); }
        .hp-chip--locked { opacity: 0.55; cursor: not-allowed; }
        .hp-chip--locked:hover { transform: none; box-shadow: none; }
        .hp-chip-icon {
          width: 42px; height: 42px; border-radius: 10px; background: #fff;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }
        .hp-chip--orange { background: #FDEEE6; border-color: #F7D3B8; } .hp-chip--orange .hp-chip-icon { color: #993C1D; }
        .hp-chip--teal   { background: #E5F5EE; border-color: #BFE6D3; } .hp-chip--teal   .hp-chip-icon { color: #0F6E56; }
        .hp-chip--blue   { background: #E9F1FB; border-color: #C4DCF5; } .hp-chip--blue   .hp-chip-icon { color: #185FA5; }
        .hp-chip--purple { background: #F1ECFC; border-color: #DBCCF5; } .hp-chip--purple .hp-chip-icon { color: #5B21B6; }
        .hp-chip-label { display: block; font-size: 13.5px; font-weight: 700; color: #111827; }
        .hp-chip-desc { display: block; font-size: 11px; color: #57606f; line-height: 1.4; margin-top: 3px; }
        .hp-chip-req { display: block; font-size: 10.5px; color: #6b7280; margin-top: 6px; font-weight: 600; }

        .hp-bottom-split { display: grid; grid-template-columns: 1.7fr 1fr; gap: 18px; align-items: start; }
        @media (max-width: 1000px) { .hp-bottom-split { grid-template-columns: 1fr; } }
        .hp-side-col { display: flex; flex-direction: column; gap: 18px; }

        .hp-panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 6px rgba(0,0,0,0.05); }
        .hp-panel-hd { display: flex; justify-content: space-between; align-items: center; padding: 13px 18px 12px; border-bottom: 1px solid #f3f4f6; gap: 10px; }
        .hp-panel-hd-left { display: flex; flex-direction: column; gap: 1px; }
        .hp-panel-title { font-size: 15.5px; font-weight: 700; color: #111827; letter-spacing: -0.01em; }
        .hp-panel-sub { font-size: 11px; color: #9ca3af; }
        .hp-viewall { background: none; border: none; font-size: 12px; color: #6b7280; cursor: pointer; padding: 0; font-weight: 500; }
        .hp-viewall:hover { color: #111827; }

        .hp-runs-table { width: 100%; border-collapse: collapse; }
        .hp-runs-table th { text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; padding: 8px 18px; border-bottom: 1px solid #f3f4f6; }
        .hp-runs-table td { padding: 8px 18px; border-bottom: 1px solid #f8fafc; vertical-align: middle; }
        .hp-runs-table tr:last-child td { border-bottom: none; }
        .hp-runs-table tbody tr { cursor: pointer; transition: background 0.12s ease; }
        .hp-runs-table tbody tr:hover { background: #fafafa; }
        .hp-run-name { font-size: 14px; font-weight: 700; color: #111827; }
        .hp-run-meta { font-size: 11.5px; color: #9ca3af; margin-top: 1px; }
        .hp-run-updated { font-size: 12.5px; color: #475569; font-weight: 500; white-space: nowrap; }
        .hp-run-chevron { color: #94a3b8; }
        .hp-mode-pill { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
        .hp-mode-pill--sum { background: #E6F1FB; color: #185FA5; }
        .hp-mode-pill--cmp { background: #FAECE7; color: #993C1D; }
        .hp-mode-pill--scr { background: #EDE9FE; color: #5B21B6; }

        .hp-empty { padding: 32px 18px; text-align: center; }
        .hp-empty-title { font-size: 13px; font-weight: 600; color: #374151; margin: 0 0 4px; }
        .hp-empty-sub { font-size: 12px; color: #9ca3af; margin: 0; }
        .hp-skel { background: #f3f4f6; animation: hp-pulse 1.5s ease-in-out infinite; }
        @keyframes hp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

        .hp-attention-body { display: flex; flex-direction: column; padding: 6px 0; }
        .hp-attention-ok { display: flex; align-items: center; gap: 8px; padding: 16px 18px; color: #16a34a; font-size: 13px; font-weight: 600; }
        .hp-attention-item {
          display: flex; align-items: flex-start; gap: 10px; text-align: left;
          background: none; border: none; padding: 10px 18px; cursor: pointer; width: 100%; box-sizing: border-box;
          border-bottom: 1px solid #f8fafc;
        }
        .hp-attention-item:hover { background: #fafafa; }
        .hp-attention-item:last-child { border-bottom: none; }
        .hp-attention-icon { width: 26px; height: 26px; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .hp-attention-icon--red { background: #fef2f2; color: #dc2626; }
        .hp-attention-icon--blue { background: #eff6ff; color: #3b82f6; }
        .hp-attention-title { display: block; font-size: 12.5px; font-weight: 600; color: #111827; }
        .hp-attention-sub { display: block; font-size: 11px; color: #9ca3af; margin-top: 1px; }
        .hp-attention-more { background: none; border: none; padding: 8px 18px; font-size: 11.5px; color: #6b7280; text-align: left; cursor: pointer; }
        .hp-attention-more:hover { color: #111827; }

        .hp-workflow-bars { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; }
        .hp-wf-row { display: flex; align-items: center; gap: 10px; }
        .hp-wf-label { font-size: 12px; font-weight: 600; color: #374151; width: 70px; flex-shrink: 0; }
        .hp-wf-track { flex: 1; height: 8px; background: #f1f5f9; border-radius: 999px; overflow: hidden; }
        .hp-wf-fill { height: 100%; background: var(--brand-orange); border-radius: 999px; }
        .hp-wf-value { font-size: 11.5px; color: #6b7280; white-space: nowrap; flex-shrink: 0; font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  );
};

export default HomePage;
