import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { configApi } from "../services/configApi";
import { useUser } from "../context/UserContext";
import { Zap, AlignLeft, GitCompare, Star, ChevronRight, BarChart2, FileText, AlertTriangle, Activity, Search } from "lucide-react";

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

function isToday(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function isThisWeek(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return d > weekAgo && d.toDateString() !== now.toDateString();
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
  locked?: boolean;
}

function ActionCard({ icon, iconCls, cardCls, pillCls, pillLabel, title, description, onClick, locked }: CardProps) {
  return (
    <button
      className={`hp-card ${cardCls}${locked ? " hp-card--locked" : ""}`}
      onClick={locked ? undefined : onClick}
      style={locked ? { cursor: "default", opacity: 0.5 } : undefined}
    >
      <div className={`hp-card-icon ${iconCls}`}>{icon}</div>
      <div className="hp-card-title">{title}</div>
      <div className="hp-card-desc">{description}</div>
      <div className="hp-card-footer">
        <span className={`hp-card-pill ${pillCls}`}>{pillLabel}</span>
        {locked ? (
          <span className="hp-card-cta" style={{ color: "#9ca3af", background: "#f3f4f6", borderRadius: 999, padding: "2px 8px", fontSize: 11 }}>
            Upgrade
          </span>
        ) : (
          <span className={`hp-card-cta ${pillCls}`}>
            Start <ChevronRight size={11} strokeWidth={2.5} />
          </span>
        )}
      </div>
    </button>
  );
}

const riskLabel: Record<string, string> = { high: "High risk", medium: "Med risk", low: "Low risk" };

function RunRow({ run, onClick }: { run: RecentRun; onClick: () => void }) {
  return (
    <div
      className={`hp-insight-card hp-insight-card--${run.riskLevel}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
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
        <span className={`hp-ic-mode hp-ic-mode--${run.mode?.toLowerCase() === "summarise" ? "sum" : run.mode?.toLowerCase() === "scoring" ? "scr" : "cmp"}`}>
          {run.mode}
        </span>
        <span className={`hp-ic-risk hp-ic-risk--${run.riskLevel}`}>
          {riskLabel[run.riskLevel] ?? run.riskLevel}
        </span>
      </div>
      <ChevronRight size={13} className="hp-ic-chevron" />
    </div>
  );
}

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { userName: fullName, isTrial } = useUser();
  const userName = fullName?.split(" ")[0] || "User";

  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({ totalInsights: 0, totalDocs: 0, highRisk: 0 });
  const [search, setSearch] = useState("");

  useEffect(() => {
    configApi
      .getInsightsDashboard("7d")
      .then((data: any) => {
        const allRuns: any[] = data.recentRuns || [];
        setStats({
          totalInsights: data.totalRuns ?? allRuns.length,
          totalDocs: data.totalDocs ?? allRuns.reduce((s: number, r: any) => s + (r.documentCount ?? 0), 0),
          highRisk: data.totalHighRisk ?? 0,
        });
        setRecentRuns(
          allRuns.slice(0, 7).map((r: any) => ({
            id:            r.id,
            name:          r.insightName || r.runName || "Untitled",
            documentType:  r.documentType || "Document",
            mode:          r.mode || "Compare",
            riskLevel:     (r.riskLevel || "low").toLowerCase(),
            createdOn:     r.createdOn || "",
            documentCount: r.documentCount ?? 0,
          }))
        );
      })
      .catch(() => setRecentRuns([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredRuns = search
    ? recentRuns.filter(r =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.documentType.toLowerCase().includes(search.toLowerCase()) ||
        r.mode.toLowerCase().includes(search.toLowerCase())
      )
    : recentRuns;

  const todayRuns    = filteredRuns.filter(r => isToday(r.createdOn));
  const thisWeekRuns = filteredRuns.filter(r => isThisWeek(r.createdOn));
  const olderRuns    = filteredRuns.filter(r => !isToday(r.createdOn) && !isThisWeek(r.createdOn));

  return (
    <div className="hp-root">

      {/* ══ GREETING CARD + KPI ROW ══ */}
      <div className="hp-header">

        <div className="hp-greeting">
          <div>
            <h1 className="hp-greeting-title">{getGreeting()}, {userName} 👋</h1>
            <p className="hp-greeting-sub">Your document intelligence workspace</p>
          </div>
        </div>

        <div className="hp-kpi-row">
          <div className="hp-kpi hp-kpi--blue">
            <div className="hp-kpi-icon-wrap hp-kpi-icon-wrap--blue"><BarChart2 size={18} /></div>
            <div className="hp-kpi-body">
              <span className="hp-kpi-label">Total Insights</span>
              <span className="hp-kpi-value">{loading ? "—" : stats.totalInsights}</span>
              <span className="hp-kpi-sub">Analysis runs this week</span>
            </div>
          </div>

          <div className="hp-kpi hp-kpi--teal">
            <div className="hp-kpi-icon-wrap hp-kpi-icon-wrap--teal"><FileText size={18} /></div>
            <div className="hp-kpi-body">
              <span className="hp-kpi-label">Documents</span>
              <span className="hp-kpi-value">{loading ? "—" : stats.totalDocs}</span>
              <span className="hp-kpi-sub">All documents processed</span>
            </div>
          </div>

          <div className={`hp-kpi ${!loading && stats.highRisk > 0 ? "hp-kpi--red" : "hp-kpi--gray"}`}>
            <div className={`hp-kpi-icon-wrap ${!loading && stats.highRisk > 0 ? "hp-kpi-icon-wrap--red" : "hp-kpi-icon-wrap--gray"}`}>
              <AlertTriangle size={18} />
            </div>
            <div className="hp-kpi-body">
              <span className="hp-kpi-label">High Risk</span>
              <span className="hp-kpi-value">{loading ? "—" : stats.highRisk}</span>
              <span className="hp-kpi-sub">Flagged items</span>
            </div>
          </div>

          <div className="hp-kpi hp-kpi--green">
            <div className="hp-kpi-icon-wrap hp-kpi-icon-wrap--green"><Activity size={18} /></div>
            <div className="hp-kpi-body">
              <span className="hp-kpi-label">System Status</span>
              <span className="hp-kpi-value hp-kpi-value--green">Active</span>
              <span className="hp-kpi-sub">AI services running</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══ SPLIT ══ */}
      <div className="hp-split">

        {/* LEFT — quick actions */}
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
                  icon={<Zap size={22} />} iconCls="hp-icon--orange" cardCls="hp-card--orange"
                  pillCls="hp-pill--orange" pillLabel="Any document · no template"
                  title="Discovery"
                  description="AI detects and builds a template from your document instantly"
                  onClick={() => navigate("/analysis", { state: { mode: "extract", from: "home" } })}
                />
                <ActionCard
                  icon={<AlignLeft size={22} />} iconCls="hp-icon--teal" cardCls="hp-card--teal"
                  pillCls="hp-pill--teal" pillLabel="1 document · template required"
                  title="Summarise"
                  description="Extract key insights and attributes from a single document"
                  onClick={() => navigate("/analysis", { state: { mode: "summarise", from: "home" } })}
                />
                <ActionCard
                  icon={<GitCompare size={22} />} iconCls="hp-icon--blue" cardCls="hp-card--blue"
                  pillCls="hp-pill--blue" pillLabel="2+ documents · template required"
                  title="Compare"
                  description="Extract and compare fields across two or more documents side by side"
                  onClick={() => navigate("/analysis", { state: { mode: "compare", from: "home" } })}
                  locked={isTrial}
                />
                <ActionCard
                  icon={<Star size={22} />} iconCls="hp-icon--purple" cardCls="hp-card--purple"
                  pillCls="hp-pill--purple" pillLabel="2+ documents · template + rules"
                  title="Scoring"
                  description="Rank documents against weighted criteria with a scored winner"
                  onClick={() => navigate("/analysis", { state: { mode: "compare-scoring", from: "home" } })}
                  locked={isTrial}
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
                <span className="hp-panel-sub">Your last 10 runs</span>
              </div>
              <div className="hp-ri-search">
                <Search size={12} className="hp-ri-search-icon" />
                <input
                  className="hp-ri-search-input"
                  placeholder="Search runs…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <button type="button" className="hp-viewall" onClick={() => navigate("/my-insights")}>
                View all →
              </button>
            </div>

            <div className="hp-feed">

              {/* ── Loading skeletons ── */}
              {loading && [...Array(8)].map((_, i) => (
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

              {/* ── Empty state ── */}
              {!loading && filteredRuns.length === 0 && (
                <div className="hp-empty">
                  <div className="hp-empty-icon"><AlignLeft size={28} /></div>
                  <p className="hp-empty-title">{search ? "No matching runs" : "No insights yet"}</p>
                  <p className="hp-empty-sub">
                    {search ? "Try a different search term" : "Run your first comparison above to get started"}
                  </p>
                </div>
              )}

              {/* ── TODAY ── */}
              {!loading && todayRuns.length > 0 && (
                <>
                  <div className="hp-feed-group">Today</div>
                  {todayRuns.map(run => (
                    <RunRow key={run.id} run={run} onClick={() => navigate(`/runs/${run.id}`)} />
                  ))}
                </>
              )}

              {/* ── THIS WEEK ── */}
              {!loading && thisWeekRuns.length > 0 && (
                <>
                  <div className="hp-feed-group">This week</div>
                  {thisWeekRuns.map(run => (
                    <RunRow key={run.id} run={run} onClick={() => navigate(`/runs/${run.id}`)} />
                  ))}
                </>
              )}

              {/* ── OLDER ── */}
              {!loading && olderRuns.length > 0 && (
                <>
                  <div className="hp-feed-group">Earlier</div>
                  {olderRuns.map(run => (
                    <RunRow key={run.id} run={run} onClick={() => navigate(`/runs/${run.id}`)} />
                  ))}
                </>
              )}

            </div>
          </div>
        </div>
      </div>


      <style>{`
        /* ══ PAGE SHELL ══ */
        .hp-root {
          display: flex;
          flex-direction: column;
          padding-top: 10px;
          box-sizing: border-box;
        }

        /* ══ GREETING CARD ══ */
        .hp-header {
          max-width: 1200px;
          width: 100%;
          margin: 0 auto 14px;
          flex-shrink: 0;
        }

        .hp-greeting {
          background: linear-gradient(to right, #eff6ff, #f8faff);
          border: 1px solid #dbeafe;
          border-left: 4px solid #3b82f6;
          border-radius: 0 10px 10px 0;
          padding: 13px 20px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
        }

        .hp-greeting-title {
          font-family: 'Syne', sans-serif;
          font-size: 20px; font-weight: 700; color: #0f172a;
          margin: 0 0 2px; letter-spacing: -0.02em; line-height: 1.2;
        }
        .hp-greeting-sub { font-size: 12px; color: #64748b; margin: 0; }

        /* ══ KPI ROW ══ */
        .hp-kpi-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }

        .hp-kpi {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-top: 3px solid transparent;
          border-radius: 12px;
          padding: 14px 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.04);
        }
        .hp-kpi--blue  { border-top-color: #3b82f6; }
        .hp-kpi--teal  { border-top-color: #10b981; }
        .hp-kpi--red   { border-top-color: #ef4444; }
        .hp-kpi--gray  { border-top-color: #d1d5db; }
        .hp-kpi--green { border-top-color: #10b981; }

        .hp-kpi-icon-wrap {
          width: 38px; height: 38px; border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .hp-kpi-icon-wrap--blue  { background: #eff6ff; color: #3b82f6; }
        .hp-kpi-icon-wrap--teal  { background: #f0fdf4; color: #10b981; }
        .hp-kpi-icon-wrap--red   { background: #fef2f2; color: #ef4444; }
        .hp-kpi-icon-wrap--gray  { background: #f8fafc; color: #94a3b8; }
        .hp-kpi-icon-wrap--green { background: #f0fdf4; color: #10b981; }

        .hp-kpi-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .hp-kpi-label {
          font-size: 10px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.07em; color: #64748b;
        }
        .hp-kpi-value {
          font-family: 'Syne', sans-serif;
          font-size: 24px; font-weight: 700; color: #0f172a;
          line-height: 1; letter-spacing: -0.02em;
        }
        .hp-kpi-sub { font-size: 11px; color: #94a3b8; margin-top: 1px; }
        .hp-kpi-value--green { font-size: 18px; color: #10b981; letter-spacing: 0; }

        /* ══ SPLIT LAYOUT ══ */
        .hp-split {
          display: flex;
          align-items: stretch;
          gap: 18px;
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
        }

        .hp-left  { flex: 0 0 auto; display: flex; flex-direction: column; }
        .hp-right { flex: 1; min-width: 0; display: flex; flex-direction: column; }

        /* ══ PANEL SHELL ══ */
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
        .hp-panel--left { overflow: visible; }

        .hp-panel-body {
          flex: 1;
          padding: 20px 22px;
          display: flex;
          align-items: flex-start;
          justify-content: center;
        }

        .hp-panel-hd {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 13px 16px 12px;
          border-bottom: 1px solid #f3f4f6;
          flex-shrink: 0;
          gap: 10px;
        }
        .hp-panel-hd-left { display: flex; flex-direction: column; gap: 1px; flex-shrink: 0; }
        .hp-panel-title   { font-size: 14px; font-weight: 700; color: #111827; }
        .hp-panel-sub     { font-size: 11px; color: #9ca3af; }

        /* ══ SEARCH IN PANEL ══ */
        .hp-ri-search { position: relative; flex: 1; max-width: 220px; }
        .hp-ri-search-icon {
          position: absolute; left: 9px; top: 50%;
          transform: translateY(-50%); color: #9ca3af; pointer-events: none;
        }
        .hp-ri-search-input {
          width: 100%;
          padding: 6px 10px 6px 28px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 12px; color: #0f172a;
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .hp-ri-search-input::placeholder { color: #9ca3af; }
        .hp-ri-search-input:focus { border-color: #3b82f6; background: #fff; }

        .hp-viewall {
          background: none; border: none; font-size: 12px;
          color: #6b7280; cursor: pointer; padding: 0; font-weight: 500;
          white-space: nowrap; flex-shrink: 0;
        }
        .hp-viewall:hover { color: #111827; }

        /* ══ 2×2 CARD GRID ══ */
        .hp-grid {
          display: grid;
          grid-template-columns: repeat(2, 252px);
          column-gap: 20px;
          row-gap: 30px;
        }

        .hp-card {
          position: relative;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-top: 3px solid transparent;
          border-radius: 14px;
          padding: 18px;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex; flex-direction: column; gap: 8px;
          flex-shrink: 0;
          box-sizing: border-box;
          width: 252px; min-height: 142px;
        }
        .hp-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 28px rgba(0,0,0,0.09);
          border-color: #d1d5db;
        }
        .hp-card--orange { border-top-color: #D85A30; }
        .hp-card--teal   { border-top-color: #1D9E75; }
        .hp-card--blue   { border-top-color: #185FA5; }
        .hp-card--purple { border-top-color: #7C3AED; }

        .hp-card-icon {
          width: 40px; height: 40px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; margin-bottom: 6px;
        }
        .hp-icon--orange { background: #FAECE7; color: #993C1D; }
        .hp-icon--teal   { background: #E1F5EE; color: #0F6E56; }
        .hp-icon--blue   { background: #E6F1FB; color: #185FA5; }
        .hp-icon--purple { background: #EDE9FE; color: #5B21B6; }

        .hp-card-title { font-size: 16px; font-weight: 600; color: #111827; }
        .hp-card-desc  { font-size: 12px; color: #6b7280; line-height: 1.6; flex: 1; }

        /* pill + CTA footer row */
        .hp-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 4px;
        }

        .hp-card-pill {
          font-size: 10px; font-weight: 600;
          padding: 4px 10px; border-radius: 999px;
          display: inline-flex; align-items: center;
        }
        .hp-pill--orange { background: #FAECE7; color: #993C1D; }
        .hp-pill--teal   { background: #E1F5EE; color: #0F6E56; }
        .hp-pill--blue   { background: #E6F1FB; color: #185FA5; }
        .hp-pill--purple { background: #EDE9FE; color: #5B21B6; }

        .hp-card-cta {
          font-size: 11px; font-weight: 700;
          display: inline-flex; align-items: center; gap: 2px;
          opacity: 0;
          transform: translateX(-4px);
          transition: opacity 0.18s ease, transform 0.18s ease;
          background: none;
          padding: 0;
        }
        .hp-card:hover .hp-card-cta {
          opacity: 1;
          transform: translateX(0);
        }

        /* ══ FEED ══ */
        .hp-feed {
          overflow-y: auto;
          padding: 8px;
          display: flex; flex-direction: column; align-items: stretch;
          gap: 4px;
          max-height: 560px;
        }

        /* ══ GROUP LABEL ══ */
        .hp-feed-group {
          font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: #9ca3af;
          padding: 8px 4px 4px;
          flex-shrink: 0;
        }
        .hp-feed-group:first-child { padding-top: 2px; }

        /* ══ INSIGHT ROW — fixed height ══ */
        .hp-insight-card {
          flex: 0 0 auto;
          display: flex; align-items: center; gap: 12px;
          padding: 0 12px; height: 52px;
          background: #fafafa;
          border: 1px solid #ebebeb;
          border-left: 3px solid #e5e7eb;
          border-radius: 8px;
          cursor: pointer; transition: all 0.15s ease;
          text-align: left; box-sizing: border-box;
        }
        .hp-insight-card:hover {
          background: #fff; border-color: #d1d5db;
          box-shadow: 0 2px 8px rgba(0,0,0,0.07);
          transform: translateX(2px);
        }
        .hp-insight-card--high   { border-left-color: #ef4444; }
        .hp-insight-card--medium { border-left-color: #f59e0b; }
        .hp-insight-card--low    { border-left-color: #10b981; }
        .hp-insight-card:hover .hp-ic-chevron { color: #9ca3af; }

        .hp-ic-body { flex: 1; min-width: 0; }
        .hp-ic-name {
          font-size: 13px; font-weight: 600; color: #111827;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3;
        }
        .hp-ic-meta {
          font-size: 11px; color: #9ca3af; margin-top: 2px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .hp-ic-badges { display: flex; flex-direction: row; align-items: center; gap: 5px; flex-shrink: 0; }
        .hp-ic-mode { font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 999px; white-space: nowrap; min-width: 72px; text-align: center; display: inline-block; box-sizing: border-box; }
        .hp-ic-mode--sum { background: #E6F1FB; color: #185FA5; }
        .hp-ic-mode--cmp { background: #FAECE7; color: #993C1D; }
        .hp-ic-mode--scr { background: #EDE9FE; color: #5B21B6; }
        .hp-ic-risk { font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
        .hp-ic-risk--high   { background: #fef2f2; color: #dc2626; }
        .hp-ic-risk--medium { background: #fffbeb; color: #d97706; }
        .hp-ic-risk--low    { background: #f0fdf4; color: #16a34a; }
        .hp-ic-chevron { color: #d1d5db; flex-shrink: 0; transition: color 0.15s; }

        /* ══ SKELETONS ══ */
        .hp-ic-skel {
          flex: 0 0 auto; height: 52px;
          display: flex; align-items: center; gap: 12px; padding: 0 12px;
          background: #fafafa; border: 1px solid #ebebeb;
          border-left: 3px solid #e5e7eb; border-radius: 8px; box-sizing: border-box;
        }
        .hp-ic-skel-right { display: flex; flex-direction: row; gap: 5px; align-items: center; flex-shrink: 0; }
        .hp-skel { background: #f3f4f6; border-radius: 4px; animation: hp-pulse 1.5s ease-in-out infinite; }
        .hp-skel-body  { flex: 1; display: flex; flex-direction: column; gap: 5px; }
        .hp-skel--line1 { height: 13px; width: 55%; }
        .hp-skel--line2 { height: 11px; width: 35%; }
        .hp-skel--pill  { width: 52px; height: 18px; border-radius: 999px; }
        .hp-skel--pill2 { width: 58px; height: 18px; border-radius: 999px; }
        @keyframes hp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

        /* ══ EMPTY STATE ══ */
        .hp-empty { padding: 40px 20px 20px; text-align: center; }
        .hp-empty-icon  { margin-bottom: 10px; color: #d1d5db; display: flex; justify-content: center; }
        .hp-empty-title { font-size: 13px; font-weight: 600; color: #374151; margin: 0 0 4px; }
        .hp-empty-sub   { font-size: 12px; color: #9ca3af; margin: 0; }

        /* ══ RESPONSIVE ══ */
        @media (max-width: 1100px) { .hp-kpi-row { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 860px) {
          .hp-kpi-row { grid-template-columns: 1fr; }
          .hp-split   { flex-direction: column; }
          .hp-grid    { grid-template-columns: repeat(2, 1fr); }
          .hp-card    { width: 100%; }
        }
        @media (max-width: 480px) { .hp-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
};

export default HomePage;
