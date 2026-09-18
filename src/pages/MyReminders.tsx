import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Search, List as ListIcon, Calendar as CalendarIcon } from "lucide-react";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { ReminderRowItem } from "../components/ReminderRow";
import ReminderCalendar from "../components/ReminderCalendar";
import { useMyReminders, type ReminderRow } from "../hooks/useMyReminders";

type ViewMode = "list" | "calendar";

const MyReminders: React.FC = () => {
  const navigate = useNavigate();
  const { loading, visible, overdue, thisWeek, upcoming, snooze, markDone, unpin } = useMyReminders();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const matches = (r: ReminderRow) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.title.toLowerCase().includes(q) || (r.documentName ?? "").toLowerCase().includes(q);
  };

  const groups = useMemo(() => ([
    { label: "Overdue", rows: overdue.filter(matches) },
    { label: "This Week", rows: thisWeek.filter(matches) },
    { label: "Upcoming", rows: upcoming.filter(matches) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), [overdue, thisWeek, upcoming, search]);

  const total = overdue.length + thisWeek.length + upcoming.length;
  const shown = groups.reduce((sum, g) => sum + g.rows.length, 0);
  const calendarRows = useMemo(() => visible.filter(matches), [visible, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const openReminder = (r: ReminderRow) => {
    if (r.runId) navigate(`/runs/${r.runId}`);
  };

  const handleSnooze = (id: string) => {
    const until = new Date();
    until.setDate(until.getDate() + 7);
    snooze(id, until);
  };

  return (
    <div className="content-page">
      <PageBreadcrumb items={[{ label: "Back", onClick: () => navigate(-1) }, { label: "My Reminders" }]} />

      <div className="page-section-header">
        <div>
          <h2 className="page-section-title">My Reminders</h2>
          <p className="page-subtitle">Dates you've pinned across your documents</p>
        </div>
        <div className="mr-view-toggle">
          <button
            type="button"
            className={viewMode === "list" ? "active" : ""}
            onClick={() => setViewMode("list")}
          >
            <ListIcon size={13} /> List
          </button>
          <button
            type="button"
            className={viewMode === "calendar" ? "active" : ""}
            onClick={() => setViewMode("calendar")}
          >
            <CalendarIcon size={13} /> Calendar
          </button>
        </div>
      </div>

      <div className="grid-filter-bar">
        <div style={{ position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
          <input
            type="text"
            placeholder="Search reminders…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
            style={{ paddingLeft: 30 }}
          />
        </div>
        <span className="grid-filter-count">
          {loading ? "Loading…" : `${shown}${search ? ` of ${total}` : ""} active`}
        </span>
      </div>

      {!loading && total === 0 && (
        <div className="mr-empty">
          <Bell size={28} style={{ color: "#d1d5db" }} />
          <p className="mr-empty-title">No reminders yet</p>
          <p className="mr-empty-sub">Pin a date from any run's Attribute Extraction tab to see it here.</p>
        </div>
      )}

      {!loading && total > 0 && viewMode === "list" && groups.map(g => g.rows.length > 0 && (
        <div key={g.label}>
          <p className="mr-group-lbl">{g.label}</p>
          {g.rows.map(r => (
            <ReminderRowItem
              key={r.id}
              r={r}
              onSnooze={handleSnooze}
              onDone={markDone}
              onUnpin={unpin}
              onOpen={openReminder}
            />
          ))}
        </div>
      ))}

      {!loading && total > 0 && viewMode === "calendar" && (
        <ReminderCalendar
          reminders={calendarRows}
          overdueCount={overdue.length}
          onSwitchToList={() => setViewMode("list")}
          onSnooze={handleSnooze}
          onDone={markDone}
          onUnpin={unpin}
          onOpen={openReminder}
        />
      )}

      <style>{`
        .mr-view-toggle {
          display: flex; gap: 2px; background: #f1f5f9; border-radius: 8px; padding: 3px; flex-shrink: 0;
        }
        .mr-view-toggle button {
          display: flex; align-items: center; gap: 5px;
          border: none; background: none; border-radius: 6px; padding: 6px 12px;
          font-size: 12px; font-weight: 600; color: #6b7280; cursor: pointer;
        }
        .mr-view-toggle button.active { background: #fff; color: #111827; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }

        .mr-group-lbl {
          font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
          color: #9ca3af; margin: 18px 2px 8px;
        }
        .mr-group-lbl:first-of-type { margin-top: 4px; }
        .mr-row {
          display: flex; align-items: center; gap: 12px;
          background: #fff; border: 1px solid #ebebeb; border-left: 3px solid #d1d5db;
          border-radius: 8px; padding: 11px 14px; margin-bottom: 6px;
        }
        .mr-row--compact { padding: 8px 12px; }
        .mr-row-body { flex: 1; min-width: 0; }
        .mr-row-title { font-size: 13px; font-weight: 600; color: #111827; }
        .mr-row-meta { font-size: 11.5px; color: #9ca3af; margin-top: 2px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .mr-row-run { font-weight: 600; color: #6b7280; }
        .mr-row-link {
          background: none; border: none; padding: 0; cursor: pointer;
          color: #3b82f6; font-size: 11.5px; display: inline-flex; align-items: center; gap: 3px;
        }
        .mr-row-link:hover { text-decoration: underline; }
        .mr-row-risk { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 999px; flex-shrink: 0; white-space: nowrap; }
        .mr-row-when { font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 999px; flex-shrink: 0; white-space: nowrap; }
        .mr-row-actions { display: flex; gap: 2px; flex-shrink: 0; }
        .mr-row-actions button {
          width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent;
          color: #94a3b8; display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .mr-row-actions button:hover { background: #f1f5f9; color: #475569; }
        .mr-row-actions .mr-row-pinned { color: #ea580c; }
        .mr-row-actions .mr-row-pinned:hover { background: #FAECE7; color: #c2410c; }
        .mr-empty { padding: 60px 20px; text-align: center; }
        .mr-empty-icon { margin-bottom: 10px; }
        .mr-empty-title { font-size: 14px; font-weight: 600; color: #374151; margin: 10px 0 4px; }
        .mr-empty-sub { font-size: 12.5px; color: #9ca3af; margin: 0; }
      `}</style>
    </div>
  );
};

export default MyReminders;
