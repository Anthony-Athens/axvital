"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OccurrenceCard } from "./OccurrenceCard";
import { getOccurrencesForDate, updateOccurrenceStatus } from "@/lib/planner/planner";
import type { OccurrenceStatus, PlannedActivityOccurrence } from "@/lib/planner/types";
import { supabase } from "@/lib/supabase/client";
import { logDevError } from "@/lib/app-errors";
import { ProgressModal } from "@/components/habits/ProgressModal";
import { completeHabitOccurrence, reopenHabitOccurrence, skipHabitOccurrence, updateHabitProgress } from "@/lib/habits/habits";
import { protocolDay } from "@/lib/protocols/protocols";

function todayString() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

export function TodayPlan() {
  const [items, setItems] = useState<PlannedActivityOccurrence[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [busy, setBusy] = useState<string | null>(null); const [progressItem, setProgressItem] = useState<PlannedActivityOccurrence | null>(null);
  const load = useCallback(async () => { try { setItems(await getOccurrencesForDate(supabase, todayString())); } catch (value) { logDevError("Failed to load today's plan", value); setError("We couldn’t load today’s plan."); } finally { setLoading(false); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function change(item: PlannedActivityOccurrence, status: OccurrenceStatus) { setBusy(item.id); setError(""); try { const trackable = item.planned_activity?.activity_type === "habit" || Boolean(item.planned_activity?.user_protocol_id); const updated = trackable ? status === "completed" ? await completeHabitOccurrence(supabase, item.id, item.actual_value, item.completion_note) : status === "skipped" ? await skipHabitOccurrence(supabase, item.id) : await reopenHabitOccurrence(supabase, item.id) : await updateOccurrenceStatus(supabase, item.id, status); setItems((values) => values.map((value) => value.id === item.id ? updated : value)); } catch (value) { logDevError("Failed to change activity status", value); setError("We couldn’t change the activity status."); } finally { setBusy(null); } }
  async function saveProgress(value: number | null, note: string, complete: boolean) { if (!progressItem) return; setBusy(progressItem.id); try { const updated = await updateHabitProgress(supabase, progressItem.id, value, note || null, complete); setItems((rows) => rows.map((row) => row.id === updated.id ? updated : row)); setProgressItem(null); } catch (reason) { logDevError("Failed to update progress", reason); setError("We couldn’t update your progress."); } finally { setBusy(null); } }
  return <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="today-plan-heading"><div className="flex items-center justify-between gap-4"><div><h2 id="today-plan-heading" className="text-lg font-semibold tracking-tight text-slate-900">Today’s Plan</h2><p className="mt-1 text-sm text-slate-500">{items.length ? `${items.filter((item) => item.status === "completed").length} of ${items.length} completed` : "Your scheduled activities"}</p></div><Link href="/weekly-overview" className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600">View Planner</Link></div>
    {error ? <p role="alert" className="mt-4 rounded-2xl bg-rose-50 p-3 font-bold text-rose-700">{error}</p> : null}
    {loading ? <p className="mt-4 font-semibold text-slate-500">Loading today’s plan…</p> : null}
    {!loading && !items.length ? <div className="mt-4 border-t border-slate-200 pt-4"><p className="text-sm text-slate-600">You have nothing scheduled yet.</p><Link href="/weekly-overview" className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Add Activity</Link></div> : null}
    {[...new Map(items.filter((item) => item.planned_activity?.user_protocol).map((item) => [item.planned_activity!.user_protocol!.id, item])).values()].map((item) => { const protocol = item.planned_activity!.user_protocol!; const own = items.filter((row) => row.planned_activity?.user_protocol?.id === protocol.id); return <div key={protocol.id} className="mt-4 flex items-center justify-between rounded-2xl bg-violet-50 p-4"><div><p className="font-black text-violet-900">{protocol.name} · Day {protocolDay(protocol.start_date, todayString())}</p><p className="text-sm font-bold text-violet-700">{own.filter((row) => row.status === "completed").length} of {own.length} completed today</p></div><Link href={`/protocols/${protocol.id}`} className="text-sm font-black text-violet-800">View</Link></div>; })}<div className="mt-4 grid gap-3 md:grid-cols-2">{items.map((item) => <OccurrenceCard key={item.id} occurrence={item} busy={busy === item.id} onStatus={(status) => void change(item, status)} onProgress={item.planned_activity?.activity_type === "habit" || item.planned_activity?.user_protocol_id ? () => setProgressItem(item) : undefined} />)}</div>{progressItem ? <ProgressModal occurrence={progressItem} saving={busy === progressItem.id} onClose={() => setProgressItem(null)} onSave={saveProgress} /> : null}
  </section>;
}
