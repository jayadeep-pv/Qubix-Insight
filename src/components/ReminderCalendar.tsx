import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import type { ReminderRow as ReminderRowData } from "../hooks/useMyReminders";
import { ReminderRowItem, formatWhen, localDateKey, TONE_BG, TONE_TX } from "./ReminderRow";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  reminders: ReminderRowData[];
  overdueCount: number;
  onSwitchToList: () => void;
  onSnooze: (id: string) => void;
  onDone: (id: string) => void;
  onUnpin: (id: string) => void;
  onOpen: (r: ReminderRowData) => void;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default function ReminderCalendar({ reminders, overdueCount, onSwitchToList, onSnooze, onDone, onUnpin, onOpen }: Props) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(today));
  const [selectedDay, setSelectedDay] = useState<string>(localDateKey(today));

  const byDay = useMemo(() => {
    const map: Record<string, ReminderRowData[]> = {};
    reminders.forEach(r => {
      if (!r.reminderDate) return;
      const key = localDateKey(new Date(r.reminderDate));
      (map[key] ||= []).push(r);
    });
    return map;
  }, [reminders]);

  const cells = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

    return Array.from({ length: totalCells }, (_, i) => new Date(year, month, i - firstWeekday + 1));
  }, [currentMonth]);

  const goPrev = () => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const goNext = () => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  const goToday = () => { setCurrentMonth(startOfMonth(today)); setSelectedDay(localDateKey(today)); };

  const todayKey = localDateKey(today);
  const selectedRows = byDay[selectedDay] ?? [];

  return (
    <div>
      {overdueCount > 0 && (
        <div className="rc-overdue-banner">
          <AlertTriangle size={13} />
          <span>{overdueCount} reminder{overdueCount === 1 ? "" : "s"} overdue from earlier.</span>
          <button type="button" onClick={onSwitchToList}>View in list</button>
        </div>
      )}

      <div className="rc-header">
        <span className="rc-month-label">{currentMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
        <div className="rc-nav">
          <button type="button" onClick={goPrev} title="Previous month"><ChevronLeft size={15} /></button>
          <button type="button" onClick={goToday} className="rc-today-btn">Today</button>
          <button type="button" onClick={goNext} title="Next month"><ChevronRight size={15} /></button>
        </div>
      </div>

      <div className="rc-grid">
        {WEEKDAYS.map(w => <div key={w} className="rc-weekday">{w}</div>)}
        {cells.map(date => {
          const key = localDateKey(date);
          const inMonth = date.getMonth() === currentMonth.getMonth();
          const dayRows = byDay[key] ?? [];
          const tone = dayRows.length > 0 ? formatWhen(dayRows[0].reminderDate).tone : null;
          const isSelected = key === selectedDay;

          return (
            <button
              type="button"
              key={key}
              className={`rc-cell${inMonth ? "" : " rc-cell--out"}${key === todayKey ? " rc-cell--today" : ""}${isSelected ? " rc-cell--selected" : ""}`}
              onClick={() => setSelectedDay(key)}
            >
              <span className="rc-cell-num">{date.getDate()}</span>
              {dayRows.slice(0, 2).map(r => (
                <span key={r.id} className="rc-cell-chip" style={{ background: TONE_BG[tone ?? "up"], color: TONE_TX[tone ?? "up"] }}>
                  {r.title}
                </span>
              ))}
              {dayRows.length > 2 && <span className="rc-cell-more">+{dayRows.length - 2} more</span>}
            </button>
          );
        })}
      </div>

      <div className="rc-detail">
        <p className="rc-detail-lbl">
          {new Date(selectedDay).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
        {selectedRows.length === 0 ? (
          <div className="rc-detail-empty">Nothing pinned for this day.</div>
        ) : (
          selectedRows.map(r => (
            <ReminderRowItem key={r.id} r={r} onSnooze={onSnooze} onDone={onDone} onUnpin={onUnpin} onOpen={onOpen} compact />
          ))
        )}
      </div>

      <style>{`
        .rc-overdue-banner {
          display: flex; align-items: center; gap: 8px;
          background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
          border-radius: 8px; padding: 8px 14px; margin-bottom: 14px; font-size: 12.5px;
        }
        .rc-overdue-banner button {
          margin-left: auto; background: none; border: none; color: #b91c1c;
          font-weight: 600; cursor: pointer; text-decoration: underline; font-size: 12.5px;
        }
        .rc-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .rc-month-label { font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 700; color: #111827; }
        .rc-nav { display: flex; align-items: center; gap: 6px; }
        .rc-nav button {
          border: 1px solid #e5e7eb; background: #fff; border-radius: 7px; cursor: pointer;
          color: #475569; display: flex; align-items: center; justify-content: center;
        }
        .rc-nav button:not(.rc-today-btn) { width: 28px; height: 28px; }
        .rc-nav button:hover { background: #f8fafc; }
        .rc-today-btn { padding: 0 10px; height: 28px; font-size: 11.5px; font-weight: 600; }

        .rc-grid {
          display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px;
          background: #eef1f6; border: 1px solid #e2e8f0; border-radius: 14px;
          padding: 14px; margin-bottom: 16px;
        }
        .rc-weekday {
          text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.05em; color: #94a3b8; padding-bottom: 6px;
        }
        .rc-cell {
          min-height: 82px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;
          box-shadow: 0 1px 2px rgba(15,23,42,0.04);
          padding: 7px; display: flex; flex-direction: column; gap: 3px; align-items: stretch;
          text-align: left; cursor: pointer; font-family: 'DM Sans', sans-serif;
          transition: all 0.12s ease;
        }
        .rc-cell:hover { border-color: #cbd5e1; box-shadow: 0 3px 8px rgba(15,23,42,0.08); transform: translateY(-1px); }
        .rc-cell--out { background: #fbfbfc; box-shadow: none; }
        .rc-cell--out .rc-cell-num { color: #cbd5e1; }
        .rc-cell--today .rc-cell-num {
          background: #a8350f; color: #fff; font-weight: 700;
          width: 20px; height: 20px; border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .rc-cell--selected {
          background: #fff7ed; border-color: #a8350f; box-shadow: 0 0 0 1.5px #a8350f;
        }
        .rc-cell-num { font-size: 11.5px; font-weight: 600; color: #374151; align-self: flex-start; }
        .rc-cell-chip {
          font-size: 10.5px; font-weight: 700; border-radius: 4px; padding: 2px 6px 2px 5px;
          border-left: 3px solid currentColor;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .rc-cell-more { font-size: 9.5px; font-weight: 600; color: #6b7280; padding: 0 2px; }

        .rc-detail { border-top: 1px solid #e5e7eb; padding-top: 14px; }
        .rc-detail-lbl { font-size: 12.5px; font-weight: 600; color: #6b7280; margin: 0 0 10px; }
        .rc-detail-empty { font-size: 12.5px; color: #9ca3af; padding: 10px 0 20px; }

        @media (max-width: 720px) {
          .rc-cell { min-height: 52px; }
          .rc-cell-chip { display: none; }
        }
      `}</style>
    </div>
  );
}
