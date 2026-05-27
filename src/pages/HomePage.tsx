import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { configApi } from "../services/configApi";
import { Zap, AlignLeft, GitCompare, Star, ChevronRight, Layers, BarChart2, FileText, AlertTriangle } from "lucide-react";

/* ── helpers ── */
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Stats {
  totalInsights: number;
  totalDocs: number;
  highRisk: number;
}

interface RecentRun {
  id: string;
  name: string;
  documentType: string;
  mode: string;
  riskLevel: string;
  createdOn: string;
  documentCount: number;
}


interface CardProps {
  icon: React.ReactNode;
  iconCls: string;
  cardCls: string;
  pillCls: string;
  pillLabel: string;
  title: string;
  description: string;
  onClick: () => void;
}

function ActionCard({ icon, iconCls, cardCls, pillCls, pillLabel, title, description, onClick }: CardProps) {
  return (
    <button className={`hp-card ${cardCls}`} onClick={onClick}>
      <div className={`hp-card-icon ${iconCls}`}>{icon}</div>
      <div className="hp-card-title">{title}</div>
      <div className="hp-card-desc">{description}</div>
      <span className={`hp-card-pill ${pillCls}`}>{pillLabel}</span>
      <ChevronRight size={14} className="hp-card-chevron" />
    </button>
  );
}

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { accounts } = useMsal();
  const userName = accounts[0]?.name?.split(" ")[0] || "User";

  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({ totalInsights: 0, totalDocs: 0, highRisk: 0 });

  useEffect(() => {
    configApi
      .getInsightsDashboard("7d")
      .then((data: any) => {
        const allRuns: any[] = data.recentRuns || [];

        setStats({
          totalInsights: data.totalRuns ?? allRuns.length,
          totalDocs: data.totalDocs ?? allRuns.reduce((sum: number, r: any) => sum + (r.documentCount ?? 0), 0),
          highRisk: data.totalHighRisk ?? 0,
        });

        const runs: RecentRun[] = allRuns
          .slice(0, 5)
          .map((r: any) => ({
            id:            r.id,
            name:          r.insightName || r.runName || "Untitled",
            documentType:  r.documentType || "Document",
            mode:          r.mode || "Compare",
            riskLevel:     (r.riskLevel || "low").toLowerCase(),
            createdOn:     r.createdOn || "",
            documentCount: r.documentCount ?? 0,
          }));
        setRecentRuns(runs);
      })
      .catch(() => setRecentRuns([]))
      .finally(() => setLoading(false));
  }, []);

  const riskLabel: Record<string, string> = { high: "High risk", medium: "Med risk", low: "Low risk" };

  return (
    <div className="hp-root">

      {/* ══ HERO ══ */}
      <div className="hp-hero">
        {/* decorative circles */}
        <div className="hp-hero-circle hp-hero-circle--1" />
        <div className="hp-hero-circle hp-hero-circle--2" />

        <div className="hp-hero-left">
          <h1 className="hp-hero-title">{getGreeting()}, {userName} 👋</h1>
          <p className="hp-hero-sub">Your document intelligence workspace</p>
        </div>

        <div className="hp-hero-stats">
          <div className="hp-stat">
            <BarChart2 size={15} className="hp-stat-icon" />
            <span className="hp-stat-value">
              {loading ? "—" : stats.totalInsights}
            </span>
            <span className="hp-stat-label">Insights</span>
          </div>
          <div className="hp-stat-divider" />
          <div className="hp-stat">
            <FileText size={15} className="hp-stat-icon" />
            <span className="hp-stat-value">
              {loading ? "—" : stats.totalDocs}
            </span>
            <span className="hp-stat-label">Documents</span>
          </div>
          <div className="hp-stat-divider" />
          <div className="hp-stat">
            <AlertTriangle size={15} className={`hp-stat-icon${!loading && stats.highRisk > 0 ? " hp-stat-icon--alert" : ""}`} />
            <span className={`hp-stat-value${!loading && stats.highRisk > 0 ? " hp-stat-value--alert" : ""}`}>
              {loading ? "—" : stats.highRisk}
            </span>
            <span className="hp-stat-label">High Risk</span>
          </div>
        </div>
      </div>

      {/* ══ SPLIT ══ */}
      <div className="hp-split">

        {/* LEFT — 4 action cards inside a matching panel */}
        <div className="hp-left">
          <div className="hp-panel hp-panel--left">

            <div className="hp-panel-hd">
              <div className="hp-panel-hd-left">
                <span className="hp-panel-title">Quick Actions</span>
                <span className="hp-panel-sub">Pick a workflow to begin</span>
              </div>
            </div>

            <div className="hp-panel-body">
              <div className="hp-grid">

                <ActionCard
                  icon={<Zap size={22} />}
                  iconCls="hp-icon--orange"
                  cardCls="hp-card--orange"
                  pillCls="hp-pill--orange"
                  pillLabel="Any document · no template"
                  title="Quick Scan"
                  description="AI detects and builds a template from your document instantly"
                  onClick={() => navigate("/new", { state: { mode: "extract", from: "home" } })}
                />
                <ActionCard
                  icon={<AlignLeft size={22} />}
                  iconCls="hp-icon--teal"
                  cardCls="hp-card--teal"
                  pillCls="hp-pill--teal"
                  pillLabel="1 document · template required"
                  title="Summarise Document"
                  description="Extract key insights and attributes from a single document"
                  onClick={() => navigate("/new", { state: { mode: "summarise", from: "home" } })}
                />
                <ActionCard
                  icon={<GitCompare size={22} />}
                  iconCls="hp-icon--blue"
                  cardCls="hp-card--blue"
                  pillCls="hp-pill--blue"
                  pillLabel="2+ documents · template required"
                  title="Compare Documents"
                  description="Extract and compare fields across two or more documents side by side"
                  onClick={() => navigate("/new", { state: { mode: "compare", from: "home" } })}
                />
                <ActionCard
                  icon={<Star size={22} />}
                  iconCls="hp-icon--purple"
                  cardCls="hp-card--purple"
                  pillCls="hp-pill--purple"
                  pillLabel="2+ documents · template + rules"
                  title="Scoring"
                  description="Rank documents against weighted criteria with a scored winner"
                  onClick={() => navigate("/new", { state: { mode: "compare-scoring", from: "home" } })}
                />

              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — recent insights */}
        <div className="hp-right">
          <div className="hp-panel">

            <div className="hp-panel-hd">
              <div className="hp-panel-hd-left">
                <span className="hp-panel-title">Recent Insights</span>
                <span className="hp-panel-sub">Your last 8 runs</span>
              </div>
              <button type="button" className="hp-viewall" onClick={() => navigate("/my-insights")}>
                View all →
              </button>
            </div>

            <div className="hp-feed">

              {loading && [...Array(7)].map((_, i) => (
                <div key={i} className="hp-ic-skel">
                  <div className="hp-skel-body">
                    <div className="hp-skel hp-skel--line1" />
                    <div className="hp-skel hp-skel--line2" />
                  </div>
                  <div className="hp-ic-skel-right">
                    <div className="hp-skel hp-skel--pill" />
                    <div className="hp-skel hp-skel--pill2" />
                  </div>
                </div>
              ))}

              {!loading && recentRuns.length === 0 && (
                <div className="hp-empty">
                  <div className="hp-empty-icon"><AlignLeft size={28} /></div>
                  <p className="hp-empty-title">No insights yet</p>
                  <p className="hp-empty-sub">Run your first comparison above to get started</p>
                </div>
              )}

              {!loading && recentRuns.map((run) => (
                <div
                  key={run.id}
                  className={`hp-insight-card hp-insight-card--${run.riskLevel}`}
                  onClick={() => navigate(`/runs/${run.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && navigate(`/runs/${run.id}`)}
                >
                  <div className="hp-ic-body">
                    <div className="hp-ic-name">{run.name}</div>
                    <div className="hp-ic-meta">
                      {run.documentType}
                      {run.documentCount > 0 ? ` · ${run.documentCount} doc${run.documentCount !== 1 ? "s" : ""}` : ""}
                      {" · "}{timeAgo(run.createdOn)}
                    </div>
                  </div>
                  <div className="hp-ic-badges">
                    <span className={`hp-ic-mode hp-ic-mode--${run.mode?.toLowerCase() === "summarise" ? "sum" : "cmp"}`}>
                      {run.mode}
                    </span>
                    <span className={`hp-ic-risk hp-ic-risk--${run.riskLevel}`}>
                      {riskLabel[run.riskLevel] ?? run.riskLevel}
                    </span>
                  </div>
                  <ChevronRight size={14} className="hp-ic-chevron" />
                </div>
              ))}

            </div>
          </div>
        </div>
      </div>

      {/* ══ DIVIDER ══ */}
      <div className="hp-divider" />

      {/* ══ FOOTER ══ */}
      <footer className="hp-footer">
        <span className="hp-footer-logo">
          <Layers size={13} />
          DocInsight AI
        </span>
        <span className="hp-footer-sep">·</span>
        <span>Document intelligence platform</span>
        <span className="hp-footer-sep">·</span>
        <span>© {new Date().getFullYear()} All rights reserved</span>
      </footer>

      <style>{`
        /* ══ PAGE SHELL ══ */
        .hp-root {
          display: flex;
          flex-direction: column;
          padding-top: 16px;
        }

        /* ══ HERO ══ */
        .hp-hero {
          max-width: 1200px;
          width: 100%;
          margin: 0 auto 28px;
          background: linear-gradient(135deg, #0b1b33 0%, #172e52 100%);
          border-radius: 16px;
          padding: 18px 40px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 32px;
          position: relative;
          overflow: hidden;
        }

        /* decorative circles */
        .hp-hero-circle {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
        }
        .hp-hero-circle--1 {
          width: 180px; height: 180px;
          right: -40px; top: -50px;
          background: rgba(250,70,22,0.07);
        }
        .hp-hero-circle--2 {
          width: 110px; height: 110px;
          right: 140px; bottom: -50px;
          background: rgba(250,70,22,0.04);
        }

        /* left text */
        .hp-hero-left { position: relative; z-index: 1; }
        .hp-hero-title {
          font-size: 22px; font-weight: 700; color: #ffffff;
          margin: 0 0 5px; letter-spacing: -0.02em; line-height: 1.25;
        }
        .hp-hero-sub { font-size: 12px; color: #64748b; margin: 0; line-height: 1.5; }

        /* stats row */
        .hp-hero-stats {
          display: flex;
          align-items: center;
          gap: 0;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 10px 20px;
          flex-shrink: 0;
          position: relative;
          z-index: 1;
        }
        .hp-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 0 18px;
          text-align: center;
        }
        .hp-stat-divider {
          width: 1px;
          height: 30px;
          background: rgba(255,255,255,0.12);
          flex-shrink: 0;
        }
        .hp-stat-icon { color: #FA4616; flex-shrink: 0; }
        .hp-stat-icon--alert { color: #f87171; }
        .hp-stat-value {
          font-size: 20px; font-weight: 700; color: #ffffff;
          line-height: 1; letter-spacing: -0.02em;
        }
        .hp-stat-value--alert { color: #f87171; }
        .hp-stat-label {
          font-size: 10px; font-weight: 600; color: #64748b;
          text-transform: uppercase; letter-spacing: 0.07em;
        }

        /* ══ SPLIT LAYOUT ══ */
        .hp-split {
          display: flex;
          align-items: stretch;
          gap: 28px;
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          margin-top: 28px;
        }

        /* ══ LEFT COLUMN ══ */
        .hp-left {
          flex: 0 0 auto;
          display: flex;
          flex-direction: column;
        }

        /* ══ RIGHT COLUMN ══ */
        .hp-right {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        /* ══ SHARED PANEL SHELL ══ */
        .hp-panel {
          flex: 1;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 1px 6px rgba(0,0,0,0.05);
        }

        /* Left panel body — centres the grid with breathing room */
        .hp-panel--left { overflow: visible; }
        .hp-panel-body {
          padding: 20px 22px 22px;
          display: flex;
          align-items: flex-start;
          justify-content: center;
        }

        /* Panel header */
        .hp-panel-hd {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 18px 14px;
          border-bottom: 1px solid #f3f4f6;
          flex-shrink: 0;
        }
        .hp-panel-hd-left { display: flex; flex-direction: column; gap: 2px; }
        .hp-panel-title   { font-size: 15px; font-weight: 700; color: #111827; }
        .hp-panel-sub     { font-size: 11px; color: #9ca3af; }

        /* ══ VIEW ALL BUTTON ══ */
        .hp-viewall {
          background: none; border: none; font-size: 12px;
          color: #6b7280; cursor: pointer; padding: 0; font-weight: 500;
        }
        .hp-viewall:hover { color: #111827; }

        /* ══ 2×2 CARD GRID ══ */
        .hp-grid {
          display: grid;
          grid-template-columns: repeat(2, 260px);
          gap: 24px;
        }

        /* ══ ACTION CARD ══ */
        .hp-card {
          position: relative;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-top: 3px solid transparent;
          border-radius: 16px;
          padding: 20px;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 10px;
          flex-shrink: 0;
          box-sizing: border-box;
          width: 260px;
          min-height: 150px;
        }
        .hp-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 32px rgba(0,0,0,0.1);
          border-color: #d1d5db;
        }
        .hp-card--orange { border-top-color: #D85A30; }
        .hp-card--teal   { border-top-color: #1D9E75; }
        .hp-card--blue   { border-top-color: #185FA5; }
        .hp-card--purple { border-top-color: #7C3AED; }

        /* ══ ICON BUBBLE ══ */
        .hp-card-icon {
          width: 44px; height: 44px;
          border-radius: 11px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          margin-bottom: 8px;
        }
        .hp-icon--orange { background: #FAECE7; color: #993C1D; }
        .hp-icon--teal   { background: #E1F5EE; color: #0F6E56; }
        .hp-icon--blue   { background: #E6F1FB; color: #185FA5; }
        .hp-icon--purple { background: #EDE9FE; color: #5B21B6; }

        /* ══ CARD TEXT ══ */
        .hp-card-title { font-size: 18px; font-weight: 600; color: #111827; }
        .hp-card-desc  { font-size: 13px; color: #6b7280; line-height: 1.65; flex: 1; }

        /* ══ PILL ══ */
        .hp-card-pill {
          font-size: 11px; font-weight: 600;
          padding: 5px 12px; border-radius: 999px;
          display: inline-block; align-self: flex-start;
          margin-top: 6px;
        }
        .hp-pill--orange { background: #FAECE7; color: #993C1D; }
        .hp-pill--teal   { background: #E1F5EE; color: #0F6E56; }
        .hp-pill--blue   { background: #E6F1FB; color: #185FA5; }
        .hp-pill--purple { background: #EDE9FE; color: #5B21B6; }

        .hp-card-chevron {
          position: absolute; bottom: 18px; right: 18px;
          color: #d1d5db; transition: color 0.15s;
        }
        .hp-card:hover .hp-card-chevron { color: #9ca3af; }

        /* ══ INSIGHT FEED ══ */
        .hp-feed {
          flex: 1;
          overflow-y: auto;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-height: 0;
        }

        /* ══ INSIGHT CARD ══ */
        .hp-insight-card {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 14px;
          background: #fafafa;
          border: 1px solid #ebebeb;
          border-left: 3px solid #e5e7eb;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
          min-height: 0;
        }
        .hp-insight-card:hover {
          background: #fff;
          border-color: #d1d5db;
          box-shadow: 0 3px 12px rgba(0,0,0,0.07);
          transform: translateX(2px);
        }
        .hp-insight-card--high   { border-left-color: #ef4444; }
        .hp-insight-card--medium { border-left-color: #f59e0b; }
        .hp-insight-card--low    { border-left-color: #10b981; }
        .hp-insight-card:hover .hp-ic-chevron { color: #9ca3af; }

        .hp-ic-body { flex: 1; min-width: 0; }
        .hp-ic-name {
          font-size: 14px; font-weight: 600; color: #111827;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          margin-bottom: 4px;
        }
        .hp-ic-meta {
          font-size: 12px; color: #9ca3af;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .hp-ic-badges {
          display: flex; flex-direction: column;
          align-items: flex-end; gap: 5px; flex-shrink: 0;
        }
        .hp-ic-mode {
          font-size: 11px; font-weight: 600;
          padding: 4px 10px; border-radius: 999px; white-space: nowrap;
        }
        .hp-ic-mode--sum { background: #E6F1FB; color: #185FA5; }
        .hp-ic-mode--cmp { background: #FAECE7; color: #993C1D; }

        .hp-ic-risk {
          font-size: 11px; font-weight: 600;
          padding: 4px 10px; border-radius: 999px; white-space: nowrap;
        }
        .hp-ic-risk--high   { background: #fef2f2; color: #dc2626; }
        .hp-ic-risk--medium { background: #fffbeb; color: #d97706; }
        .hp-ic-risk--low    { background: #f0fdf4; color: #16a34a; }

        .hp-ic-chevron { color: #d1d5db; flex-shrink: 0; transition: color 0.15s; }

        /* ══ SKELETON ══ */
        .hp-ic-skel {
          flex: 1;
          display: flex; align-items: center; gap: 14px;
          padding: 12px 14px;
          background: #fafafa; border: 1px solid #ebebeb; border-radius: 10px;
          min-height: 0;
        }
        .hp-ic-skel-right { display: flex; flex-direction: column; gap: 5px; align-items: flex-end; flex-shrink: 0; }
        .hp-skel { background: #f3f4f6; border-radius: 4px; animation: hp-pulse 1.5s ease-in-out infinite; }
        .hp-skel-body  { flex: 1; display: flex; flex-direction: column; gap: 6px; }
        .hp-skel--line1 { height: 14px; width: 65%; border-radius: 4px; }
        .hp-skel--line2 { height: 12px; width: 40%; border-radius: 4px; }
        .hp-skel--pill  { width: 50px; height: 16px; border-radius: 999px; }
        .hp-skel--pill2 { width: 58px; height: 16px; border-radius: 999px; }
        @keyframes hp-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }

        /* ══ EMPTY STATE ══ */
        .hp-empty { padding: 40px 20px; text-align: center; }
        .hp-empty-icon  { margin-bottom: 12px; color: #d1d5db; display: flex; justify-content: center; }
        .hp-empty-title { font-size: 14px; font-weight: 600; color: #374151; margin: 0 0 4px; }
        .hp-empty-sub   { font-size: 12px; color: #9ca3af; margin: 0; }

        /* ══ DIVIDER ══ */
        .hp-divider {
          max-width: 1200px;
          width: 100%;
          margin: 28px auto 0;
          height: 1px;
          background: linear-gradient(to right, transparent, #e5e7eb 20%, #e5e7eb 80%, transparent);
        }

        /* ══ FOOTER ══ */
        .hp-footer {
          max-width: 1200px;
          width: 100%;
          margin: 0 auto;
          padding: 16px 0 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-size: 11px;
          color: #9ca3af;
        }
        .hp-footer-logo {
          display: inline-flex; align-items: center; gap: 5px;
          font-weight: 600; color: #6b7280;
        }
        .hp-footer-sep { color: #d1d5db; }

        /* ══ RESPONSIVE ══ */
        @media (max-width: 860px) {
          .hp-hero  { flex-direction: column; align-items: flex-start; padding: 28px 24px; }
          .hp-hero-stats { width: 100%; justify-content: center; }
          .hp-split { flex-direction: column; }
          .hp-grid  { grid-template-columns: repeat(2, 1fr); }
          .hp-card  { width: 100%; }
          .hp-left  { min-height: 0; }
        }
        @media (max-width: 480px) {
          .hp-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};

export default HomePage;
