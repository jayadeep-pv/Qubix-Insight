import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { configApi } from "../services/configApi";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

import { Plus, TrendingUp, FileText, Activity, AlertTriangle } from "lucide-react";
import { PageBreadcrumb } from "../components/PageBreadcrumb";

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const [stats, setStats] = useState({ totalRuns: 0, runsThisMonth: 0, totalDocs: 0, totalHighRisk: 0 });
  const [usageData, setUsageData]     = useState<{ day: string; runs: number }[]>([]);
  const [modeData, setModeData]       = useState<{ name: string; value: number }[]>([]);
  const [docTypeData, setDocTypeData] = useState<{ name: string; count: number }[]>([]);
  const [riskData, setRiskData]       = useState<{ name: string; value: number }[]>([]);
  const [period, setPeriod] = useState("7d");

  useEffect(() => { loadDashboard(); }, [period]);

  async function loadDashboard() {
    try {
      const data = await configApi.getInsightsDashboard(period);

      setStats({
        totalRuns: data.totalRuns || 0,
        runsThisMonth: data.insightsThisMonth || 0,
        totalDocs: data.totalDocs || 0,
        totalHighRisk: data.totalHighRisk || 0,
      });

      setUsageData((data.usageLast7Days || []).map((d: any) => ({ day: d.day, runs: d.count })));

      setModeData([
        { name: "Compare",   value: data.modeSplit?.compare   || 0 },
        { name: "Summarise", value: data.modeSplit?.summarise || 0 },
        { name: "Scoring",   value: data.modeSplit?.scoring   || 0 },
      ].filter(m => m.value > 0));

      // Real all-time aggregate from the backend — not derived from the
      // top-10 "recent runs" sample.
      setDocTypeData(
        Object.entries(data.docTypeSplit || {})
          .map(([name, count]) => ({ name, count: count as number }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 6)
      );

      setRiskData([
        { name: "High",   value: data.riskDistribution?.high   || 0 },
        { name: "Medium", value: data.riskDistribution?.medium || 0 },
        { name: "Low",    value: data.riskDistribution?.low    || 0 },
      ].filter(r => r.value > 0));

    } catch (err) {
      console.error("Failed to load dashboard", err);
      setUsageData([]); setModeData([]); setDocTypeData([]); setRiskData([]);
    }
  }

  const MODE_COLORS = ["#C9441B", "#3b5bdb", "#7c3aed"];
  const RISK_COLORS: Record<string, string> = { High: "#dc2626", Medium: "#d97706", Low: "#16a34a" };
  const BAR_COLORS = ["#C9441B", "#c9441b", "#fb923c", "#fdba74", "#fcd9bd", "#ffe4cc"];
  const totalModeRuns = modeData.reduce((a, b) => a + b.value, 0);
  const totalRiskFindings = riskData.reduce((a, b) => a + b.value, 0);
  const maxDocCount = docTypeData.reduce((a, b) => Math.max(a, b.count), 1);

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

      <PageBreadcrumb
        items={[{ label: "Back", onClick: () => navigate(-1) }, { label: "Insights Overview" }]}
      />

      {/* ══ TOP BAR ══ */}
      <div className="db-topbar">
        <div className="db-topbar-left">
          <h2 className="page-section-title" style={{ marginBottom: 0 }}>Overview</h2>
        </div>
        <div className="db-topbar-actions">
          <button className="btn btn-primary db-action-btn" onClick={() => navigate("/analysis")}>
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
          <div className="db-kpi-icon db-kpi-icon--red"><AlertTriangle size={17} /></div>
          <div className="db-kpi-body">
            <div className="db-kpi-value">{stats.totalHighRisk}</div>
            <div className="db-kpi-label">High-Risk Findings</div>
            <div className="db-kpi-sub">All time</div>
          </div>
        </div>

        <div className="db-kpi-card">
          <div className="db-kpi-icon db-kpi-icon--teal"><FileText size={17} /></div>
          <div className="db-kpi-body">
            <div className="db-kpi-value">{stats.totalDocs}</div>
            <div className="db-kpi-label">Docs Processed</div>
            <div className="db-kpi-sub">Across all runs</div>
          </div>
        </div>

      </div>

      {/* ══ 2x2 GRID — four uniform, square-ish chart panels ══ */}
      <div className="db-charts-grid">

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
                    <stop offset="5%"  stopColor="#C9441B" stopOpacity={0.14} />
                    <stop offset="95%" stopColor="#C9441B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false} tickLine={false}
                  interval={period === "30d" ? 4 : 0}
                  angle={period === "30d" ? -15 : 0}
                  textAnchor={period === "30d" ? "end" : "middle"} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="runs" stroke="#C9441B" strokeWidth={2.5}
                  fill="url(#areaGrad)" dot={false}
                  activeDot={{ r: 5, fill: "#C9441B", stroke: "#fff", strokeWidth: 2 }} />
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
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie data={modeData} cx="50%" cy="50%"
                    innerRadius={32} outerRadius={48}
                    paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                    {modeData.map((entry, i) => (
                      <Cell key={entry.name} fill={MODE_COLORS[i]} stroke="none" />
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
                    <span className="db-mode-dot" style={{ background: MODE_COLORS[i] }} />
                    <div className="db-mode-leg-body">
                      <div className="db-mode-leg-name">{entry.name}</div>
                      <div className="db-mode-leg-stats">
                        <span className="db-mode-leg-pct">{pct}%</span>
                        <span className="db-mode-leg-count">{entry.value} runs</span>
                      </div>
                      <div className="db-mode-bar-track">
                        <div className="db-mode-bar-fill" style={{ width: `${pct}%`, background: MODE_COLORS[i] }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="db-panel">
          <div className="db-panel-head">
            <span className="db-panel-title">Document Types</span>
          </div>
          <div className="db-doctype-list">
            {docTypeData.length > 0 ? docTypeData.map((d, i) => (
              <div key={d.name} className="db-doctype-row">
                <div className="db-doctype-name">{d.name}</div>
                <div className="db-doctype-bar-wrap">
                  <div className="db-doctype-bar"
                    style={{ width: `${Math.round((d.count / maxDocCount) * 100)}%`, background: BAR_COLORS[i] || "#C9441B" }} />
                </div>
                <div className="db-doctype-count">{d.count}</div>
              </div>
            )) : (
              <div className="db-doctype-empty">No data available yet</div>
            )}
          </div>
        </div>

        <div className="db-panel">
          <div className="db-panel-head">
            <span className="db-panel-title">Risk Distribution</span>
            <span className="db-kpi-sub">{totalRiskFindings} findings</span>
          </div>
          <div className="db-mode-body">
            <div className="db-donut-wrap">
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie data={riskData} cx="50%" cy="50%"
                    innerRadius={32} outerRadius={48}
                    paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                    {riskData.map((entry) => (
                      <Cell key={entry.name} fill={RISK_COLORS[entry.name]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`${v} findings`, ""]}
                    contentStyle={{ background: "#1f2937", border: "none", borderRadius: 6, color: "#f9fafb", fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="db-mode-legend">
              {riskData.length > 0 ? riskData.map((entry) => {
                const pct = totalRiskFindings > 0 ? Math.round((entry.value / totalRiskFindings) * 100) : 0;
                return (
                  <div key={entry.name} className="db-mode-leg-row">
                    <span className="db-mode-dot" style={{ background: RISK_COLORS[entry.name] }} />
                    <div className="db-mode-leg-body">
                      <div className="db-mode-leg-name">{entry.name}</div>
                      <div className="db-mode-leg-stats">
                        <span className="db-mode-leg-pct">{pct}%</span>
                        <span className="db-mode-leg-count">{entry.value} findings</span>
                      </div>
                      <div className="db-mode-bar-track">
                        <div className="db-mode-bar-fill" style={{ width: `${pct}%`, background: RISK_COLORS[entry.name] }} />
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="db-doctype-empty">No findings yet</div>
              )}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};

export default Dashboard;
