import { useCallback, useEffect, useState } from "react";
import { configApi } from "../services/configApi";
import { useUser } from "../context/UserContext";

export interface ReminderRow {
  id: string;
  title: string;
  value?: string;
  analysisResultId?: string;
  reminderDate?: string;
  snoozedUntil?: string | null;
  isActive: boolean;
  runId?: string;
  runName?: string;
  documentId?: string;
  documentName?: string;
  attributeId?: string;
  attributeName?: string;
  riskLevel?: string;
  confidenceScore?: number;
}

function mapRow(r: any): ReminderRow {
  return {
    id: r.id,
    title: r.title,
    value: r.value,
    analysisResultId: r.analysisResultId,
    reminderDate: r.reminderDate,
    snoozedUntil: r.snoozedUntil,
    isActive: r.isActive ?? true,
    runId: r.runId,
    runName: r.runName,
    documentId: r.documentId,
    documentName: r.documentName,
    attributeId: r.attributeId,
    attributeName: r.attributeName,
    riskLevel: r.riskLevel,
    confidenceScore: r.confidenceScore,
  };
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Loads the current user's pinned reminders and groups the ones that should
 * actually be surfaced right now (active, not snoozed into the future) into
 * Overdue / This Week / Upcoming — the same three buckets used by the topbar
 * bell, the Home KPI tile, and the My Reminders page, so the counts always agree.
 */
export function useMyReminders() {
  const { userEmail } = useUser();
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userEmail) return;
    try {
      const data = await configApi.getMyReminders();
      setReminders((data ?? []).map(mapRow));
    } catch (err) {
      console.error("Failed to load reminders", err);
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => { load(); }, [load]);

  const snooze = async (id: string, until: Date) => {
    await configApi.updateUserReminder({ id, snoozedUntil: until.toISOString() });
    await load();
  };

  const clearSnooze = async (id: string) => {
    await configApi.updateUserReminder({ id, clearSnooze: true });
    await load();
  };

  const markDone = async (id: string) => {
    await configApi.updateUserReminder({ id, isActive: false });
    await load();
  };

  const unpin = async (id: string) => {
    await configApi.deleteUserReminder(id);
    await load();
  };

  const now = Date.now();
  const today = startOfToday();
  const weekAhead = today + 7 * 24 * 60 * 60 * 1000;

  const visible = reminders
    .filter(r => r.isActive && (!r.snoozedUntil || new Date(r.snoozedUntil).getTime() <= now))
    .filter(r => !!r.reminderDate)
    .sort((a, b) => new Date(a.reminderDate!).getTime() - new Date(b.reminderDate!).getTime());

  const overdue  = visible.filter(r => new Date(r.reminderDate!).getTime() < today);
  const thisWeek = visible.filter(r => {
    const t = new Date(r.reminderDate!).getTime();
    return t >= today && t < weekAhead;
  });
  const upcoming = visible.filter(r => new Date(r.reminderDate!).getTime() >= weekAhead);

  return {
    reminders,
    loading,
    reload: load,
    visible,
    overdue,
    thisWeek,
    upcoming,
    snooze,
    clearSnooze,
    markDone,
    unpin,
  };
}
