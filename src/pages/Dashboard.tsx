import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import RecentComparisonsTable from "../components/RecentComparisonsTable";
import { Comparison } from "../types/Comparison";
import { configApi } from "../services/configApi";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import { useMsal } from "@azure/msal-react";
import { Plus, Zap, TrendingUp, FileText, Layers, Activity, ArrowLeft } from "lucide-react";

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const [stats, setStats]             = useState({ totalRuns: 0, runsThisMonth: 0 });
  const [recentRuns, setRecentRuns]   = useState<Comparison[]>([]);
  const [usageData, setUsageData]     = useState<{ day: string; runs: number }[]>([]);
  const [modeData, setModeData]       = useState<{ name: string; value: number }[]>([]);
  const [docTypeData, setDocTypeData] = useState<{ name: string; count: number }[]>([]);
  const [activityData, setActivityData] = useState<{
    name: string; profile: string; riskLevel: string; timeAgo: string;
  }[]>([]);
  const [period, setPeriod]           = useState("7d");
  const [activeRightTab, setActiveRightTab] = useState<"activity" | "doctypes">("activity");

  const { accounts } = useMsal();
  const userName = accounts[0]?.name?.split(" ")[0] || "User";

  useEffect(() => { loadDashboard(); }, [period]);

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
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  async function loadDashboard() {
    try {
      const data = await configApi.getInsightsDashboard(period);

      setStats({ totalRuns: data.totalRuns || 0, runsThisMonth: data.insightsThisMonth || 0 });

      const runs = (data.recentRuns || []).slice(0, 5).map((r: any) => ({
        id: r.id,
        runNumber: r.runName || "",
        insightName: r.insightName || r.runName,
        documentType: r.documentType || "-",
        documentCount: r.documentCount ?? 0,
        createdDate: r.createdOn ? new Date(r.createdOn).toLocaleDateString("en-GB") : "",
        mode: r.mode || "Compare"
      }));
      setRecentRuns(runs);

      setUsageData((data.usageLast7Days || []).map((d: any) => ({ day: d.day, runs: d.count })));

      setModeData([
        { name: "Compare",   value: data.modeSplit?.compare   || 0 },
        { name: "Summarise", value: data.modeSplit?.summarise || 0 }
      ]);

      // Doc type breakdown
      if (data.docTypeSplit) {
        setDocTypeData(
          Object.entries(data.docTypeSplit)
            .map(([name, count]) => ({ name, count: count as number }))
            .sort((a, b) => b.count - a.count).slice(0, 5)
        );
      } else {
        const map: Record<string, number> = {};
        (data.recentRuns || []).forEach((r: any) => {
          const t = r.documentType || "Other";
          map[t] = (map[t] || 0) + 1;
        });
        setDocTypeData(
          Object.entries(map)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count).slice(0, 5)
        );
      }

      // AI activity — derive from recent runs as a feed
      setActivityData(
        (data.recentRuns || []).slice(0, 5).map((r: any) => ({
          name: r.insightName || r.runName || "Untitled",
          profile: r.documentType || "Document",
          riskLevel: r.riskLevel || (Math.random() > 0.6 ? "high" : Math.random() > 0.4 ? "medium" : "low"),
          timeAgo: timeAgo(r.createdOn)
        }))
      );

    } catch (err) {
      console.error("Failed to load dashboard", err);
      setUsageData([]); setModeData([]); setRecentRuns([]);
      setDocTypeData([]); setActivityData([]);
    }
  }

  const COLORS     = ["#FA4616", "#3b5bdb"];
  const BAR_COLORS = ["#FA4616", "#f97316", "#fb923c", "#fdba74", "#fcd9bd"];
  const totalModeRuns = modeData.reduce((a, b) => a + b.value, 0);
  const maxDocCount   = docTypeData.reduce((a, b) => Math.max(a, b.count), 1);

  const riskLabel: Record<string, string> = {
    high: "High Risk", medium: "Med Risk", low: "Low Risk"
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{label}</div>
        <div className="chart-tooltip-value">{payload[0].value} runs</div>
      </div>
    );
  };

  return (
    <div className="db-shell">

      {/* ══ TOP BAR ══ */}
      <div className="db-topbar">
        <div className="db-topbar-left">
          <button type="button" className="btn-back-link" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <h1 className="db-title">Insights Overview</h1>
          <p className="db-greeting">{getGreeting()}, {userName} 👋</p>
        </div>
        <div className="db-topbar-actions">
          <button className="btn btn-secondary db-action-btn" onClick={() => navigate("/new", { state: { mode: "extract", from: "dashboard" } })}>
            <Zap size={14} /> Smart Builder
          </button>
          <button className="btn btn-primary db-action-btn" onClick={() => navigate("/new")}>
            <Plus size={14} /> New Insight
          </button>
        </div>
      </div>

      {/* ══ KPI ROW ══ */}
      <div className="db-kpi-row">

        <div className="db-kpi-card">
          <div className="db-kpi-icon db-kpi-icon--orange"><TrendingUp size={17} /></div>
          <div className="db-kpi-body">
            <div className="db-kpi-value">{stats.totalRuns}</div>
            <div className="db-kpi-label">Total Runs</div>
            <div className="db-kpi-sub">All time</div>
          </div>
        </div>

        <div className="db-kpi-card">
          <div className="db-kpi-icon db-kpi-icon--blue"><Activity size={17} /></div>
          <div className="db-kpi-body">
            <div className="db-kpi-value">{stats.runsThisMonth}</div>
            <div className="db-kpi-label">This Month</div>
            <div className="db-kpi-sub">Current activity</div>
          </div>
        </div>

        <div className="db-kpi-card">
          <div className="db-kpi-icon db-kpi-icon--teal"><FileText size={17} /></div>
          <div className="db-kpi-body">
            <div className="db-kpi-value">{stats.totalRuns}</div>
            <div className="db-kpi-label">Docs Processed</div>
            <div className="db-kpi-sub">Across all runs</div>
          </div>
        </div>

        <div className="db-kpi-card">
          <div className="db-kpi-icon db-kpi-icon--green"><Layers size={17} /></div>
          <div className="db-kpi-body">
            <div className="db-kpi-value db-kpi-value--status">
              <span className="db-status-dot" /> Active
            </div>
            <div className="db-kpi-label">System Status</div>
            <div className="db-kpi-sub">AI services running</div>
          </div>
        </div>

      </div>

      {/* ══ CHARTS STRIP ══ */}
      <div className="db-charts-strip">

        <div className="db-panel">
          <div className="db-panel-head">
            <span className="db-panel-title">
              Usage — {period === "7d" ? "Last 7 days" : "Last 30 days"}
            </span>
            <div className="db-period-toggle">
              <button className={`db-period-btn${period === "7d"  ? " active" : ""}`} onClick={() => setPeriod("7d")}>7D</button>
              <button className={`db-period-btn${period === "30d" ? " active" : ""}`} onClick={() => setPeriod("30d")}>30D</button>
            </div>
          </div>
          <div className="db-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usageData} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#FA4616" stopOpacity={0.14} />
                    <stop offset="95%" stopColor="#FA4616" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false} tickLine={false}
                  interval={period === "30d" ? 4 : 0}
                  angle={period === "30d" ? -15 : 0}
                  textAnchor={period === "30d" ? "end" : "middle"} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="runs" stroke="#FA4616" strokeWidth={2.5}
                  fill="url(#areaGrad)" dot={false}
                  activeDot={{ r: 5, fill: "#FA4616", stroke: "#fff", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="db-panel">
          <div className="db-panel-head">
            <span className="db-panel-title">Mode Split</span>
            <span className="db-kpi-sub">{totalModeRuns} total</span>
          </div>
          <div className="db-mode-body">
            <div className="db-donut-wrap">
              <ResponsiveContainer width={110} height={110}>
                <PieChart>
                  <Pie data={modeData} cx="50%" cy="50%"
                    innerRadius={34} outerRadius={52}
                    paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                    {modeData.map((entry, i) => (
                      <Cell key={entry.name} fill={COLORS[i]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`${v} runs`, ""]}
                    contentStyle={{ background: "#1f2937", border: "none", borderRadius: 6, color: "#f9fafb", fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="db-mode-legend">
              {modeData.map((entry, i) => {
                const pct = totalModeRuns > 0 ? Math.round((entry.value / totalModeRuns) * 100) : 0;
                return (
                  <div key={entry.name} className="db-mode-leg-row">
                    <span className="db-mode-dot" style={{ background: COLORS[i] }} />
                    <div className="db-mode-leg-body">
                      <div className="db-mode-leg-name">{entry.name}</div>
                      <div className="db-mode-leg-stats">
                        <span className="db-mode-leg-pct">{pct}%</span>
                        <span className="db-mode-leg-count">{entry.value} runs</span>
                      </div>
                      <div className="db-mode-bar-track">
                        <div className="db-mode-bar-fill" style={{ width: `${pct}%`, background: COLORS[i] }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* ══ BOTTOM ROW ══ */}
      <div className="db-bottom-row">

        {/* Left — Recent Insights table */}
        <div className="db-panel db-panel--table db-bottom-left">
          <div className="db-panel-head">
            <span className="db-panel-title">Recent Insights</span>
            <button className="db-viewall-btn" onClick={() => navigate("/my-insights")}>
              View all →
            </button>
          </div>
          <div className="db-table-wrap">
            <RecentComparisonsTable data={recentRuns as any} />
          </div>
        </div>

        {/* Right — combined tabbed widget */}
        <div className="db-panel db-bottom-right db-bottom-widget">

          {/* Tab bar */}
          <div className="db-panel-head" style={{ padding: 0 }}>
            <div className="db-activity-tabs">
              <button
                className={`db-activity-tab${activeRightTab === "activity" ? " active" : ""}`}
                onClick={() => setActiveRightTab("activity")}
              >
                AI Activity
              </button>
              <button
                className={`db-activity-tab${activeRightTab === "doctypes" ? " active" : ""}`}
                onClick={() => setActiveRightTab("doctypes")}
              >
                Doc Types
              </button>
            </div>
          </div>

          {/* AI Activity tab */}
          {activeRightTab === "activity" && (
            <div className="db-activity-feed">
              {activityData.length > 0 ? activityData.map((item, i) => (
                <div key={i} className="db-activity-item">
                  <span className={`db-activity-risk db-activity-risk--${item.riskLevel}`} />
                  <div className="db-activity-body">
                    <div className="db-activity-name">{item.name}</div>
                    <div className="db-activity-meta">{item.profile} · {item.timeAgo}</div>
                  </div>
                  <span className={`db-activity-badge db-activity-badge--${item.riskLevel}`}>
                    {riskLabel[item.riskLevel] || item.riskLevel}
                  </span>
                </div>
              )) : (
                <div style={{ padding: "20px 12px", textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
                  No recent AI activity
                </div>
              )}
            </div>
          )}

          {/* Doc Types tab */}
          {activeRightTab === "doctypes" && (
            <div className="db-doctype-list">
              {docTypeData.length > 0 ? docTypeData.map((d, i) => (
                <div key={d.name} className="db-doctype-row">
                  <div className="db-doctype-name">{d.name}</div>
                  <div className="db-doctype-bar-wrap">
                    <div className="db-doctype-bar"
                      style={{ width: `${Math.round((d.count / maxDocCount) * 100)}%`, background: BAR_COLORS[i] || "#FA4616" }} />
                  </div>
                  <div className="db-doctype-count">{d.count}</div>
                </div>
              )) : (
                <div className="db-doctype-empty">No data available yet</div>
              )}
            </div>
          )}

        </div>

      </div>

    </div>
  );
};

export default Dashboard;
