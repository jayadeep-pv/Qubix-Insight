import React from "react";
import { BellRing, Clock, Check, ArrowUpRight } from "lucide-react";
import type { ReminderRow as ReminderRowData } from "../hooks/useMyReminders";

const CATEGORY_STYLE: Record<string, { bg: string; text: string }> = {
  high:   { bg: "#fef2f2", text: "#dc2626" },
  medium: { bg: "#fffbeb", text: "#d97706" },
  low:    { bg: "#f0fdf4", text: "#16a34a" },
};

export const TONE_BG: Record<string, string> = { od: "#fef2f2", wk: "#fffbeb", up: "#f0fdf4" };
export const TONE_TX: Record<string, string> = { od: "#dc2626", wk: "#d97706", up: "#16a34a" };
export const TONE_BORDER: Record<string, string> = { od: "#dc2626", wk: "#d97706", up: "#16a34a" };

export function formatWhen(iso?: string): { label: string; tone: "od" | "wk" | "up" } {
  if (!iso) return { label: "—", tone: "up" };
  const target = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { label: `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`, tone: "od" };
  if (days === 0) return { label: "Due today", tone: "wk" };
  if (days <= 7) return { label: `in ${days} day${days === 1 ? "" : "s"}`, tone: "wk" };
  return { label: `in ${days} days`, tone: "up" };
}

export function formatDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Local (not UTC) YYYY-MM-DD key — matches the day a user actually sees the date on. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  r: ReminderRowData;
  onSnooze: (id: string) => void;
  onDone: (id: string) => void;
  onUnpin: (id: string) => void;
  onOpen: (r: ReminderRowData) => void;
  compact?: boolean;
}

export function ReminderRowItem({ r, onSnooze, onDone, onUnpin, onOpen, compact }: Props) {
  const when = formatWhen(r.reminderDate);
  const risk = r.riskLevel ? CATEGORY_STYLE[r.riskLevel.toLowerCase()] : null;

  return (
    <div className={`mr-row${compact ? " mr-row--compact" : ""}`} style={{ borderLeftColor: TONE_BORDER[when.tone] }}>
      <div className="mr-row-body">
        <div className="mr-row-title">{r.title}</div>
        <div className="mr-row-meta">
          {r.runName && <span className="mr-row-run">{r.runName}</span>}
          {r.runName ? " · " : ""}{r.documentName ?? "Document"}
          {r.reminderDate ? ` · ${formatDate(r.reminderDate)}` : ""}
          {r.runId && (
            <button type="button" className="mr-row-link" onClick={() => onOpen(r)}>
              <ArrowUpRight size={11} /> View in document
            </button>
          )}
        </div>
      </div>
      {risk && !compact && <span className="mr-row-risk" style={{ background: risk.bg, color: risk.text }}>{r.riskLevel}</span>}
      <span className="mr-row-when" style={{ background: TONE_BG[when.tone], color: TONE_TX[when.tone] }}>{when.label}</span>
      <div className="mr-row-actions">
        <button type="button" title="Snooze a week" onClick={() => onSnooze(r.id)}><Clock size={14} /></button>
        <button type="button" title="Mark done" onClick={() => onDone(r.id)}><Check size={14} /></button>
        <button type="button" title="Unpin" className="mr-row-pinned" onClick={() => onUnpin(r.id)}><BellRing size={14} /></button>
      </div>
    </div>
  );
}
