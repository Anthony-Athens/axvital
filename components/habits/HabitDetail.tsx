"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProgressModal } from "./ProgressModal";
import { addCalendarDays } from "@/lib/planner/recurrence";
import { getHabitOccurrencesForRange, getHabits, updateHabitProgress } from "@/lib/habits/habits";
import { calculateAdherence } from "@/lib/habits/analytics";
import { derivedOccurrenceStatus } from "@/lib/habits/progress";
import { calculateBestStreak, calculateCurrentStreak } from "@/lib/habits/streaks";
import type { PlannedActivity, PlannedActivityOccurrence } from "@/lib/planner/types";
import { supabase } from "@/lib/supabase/client";
import { logDevError } from "@/lib/app-errors";

function todayString() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }

export function HabitDetail() {
  const { id } = useParams<{ id: string }>(); const today = todayString(); const start = addCalendarDays(today, -364); const recentStart = addCalendarDays(today, -29);
  const [habit, setHabit] = useState<PlannedActivity | null>(null); const [rows, setRows] = useState<PlannedActivityOccurrence[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [editing, setEditing] = useState<PlannedActivityOccurrence | null>(null); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { try { const [habits, history] = await Promise.all([getHabits(supabase, "all"), getHabitOccurrencesForRange(supabase, start, today, id)]); setHabit(habits.find((item) => item.id === id) ?? null); setRows(history); } catch (reason) { logDevError("Failed to load habit", reason); setError("We couldn’t load this habit."); } finally { setLoading(false); } }, [id, start, today]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const stats = useMemo(() => ({ current: calculateCurrentStreak(rows, today), best: calculateBestStreak(rows, today), week: calculateAdherence(rows, addCalendarDays(today, -6), today).percentage, month: calculateAdherence(rows, today.slice(0, 8) + "01", today).percentage }), [rows, today]);
  async function saveProgress(value: number | null, note: string, complete: boolean) { if (!editing) return; setSaving(true); try { const updated = await updateHabitProgress(supabase, editing.id, value, note || null, complete); setRows((items) => items.map((item) => item.id === updated.id ? updated : item)); setEditing(null); } catch (reason) { logDevError("Failed to update progress", reason); setError("We couldn’t update your progress."); } finally { setSaving(false); } }
  if (loading) return <div className="mx-auto max-w-4xl p-6 font-black">Loading habit history…</div>;
  if (!habit) return <div className="mx-auto max-w-4xl p-6"><h1 className="text-3xl font-black">Habit not found</h1><Link href="/habits" className="mt-4 inline-block font-black text-emerald-700">Back to Habits</Link></div>;
  const recent = rows.filter((row) => row.scheduled_date >= recentStart).sort((a,b) => b.scheduled_date.localeCompare(a.scheduled_date));
  return <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-10"><Link href="/habits" className="font-black text-emerald-700">← Back to Habits</Link><section className="mt-4 rounded-3xl bg-slate-950 p-6 text-white md:p-8"><p className="text-sm font-black uppercase tracking-widest text-emerald-300">Habit detail</p><h1 className="mt-2 text-4xl font-black">{habit.title}</h1><p className="mt-3 text-slate-300">{habit.description || "No description."}</p><div className="mt-5 flex flex-wrap gap-2 text-sm font-bold"><span className="rounded-full bg-white/10 px-3 py-2 capitalize">{habit.tracking_type}</span><span className="rounded-full bg-white/10 px-3 py-2">Target: {habit.tracking_type === "binary" ? "Complete" : `${habit.target_value} ${habit.target_unit}`}</span><span className="rounded-full bg-white/10 px-3 py-2 capitalize">{habit.recurrence_type.replace("_", " ")}</span><span className="rounded-full bg-white/10 px-3 py-2">Started {habit.start_date}</span>{habit.end_date ? <span className="rounded-full bg-white/10 px-3 py-2">Ends {habit.end_date}</span> : null}</div></section>
    {error ? <p className="mt-4 rounded-2xl bg-rose-50 p-4 font-bold text-rose-700">{error}</p> : null}<section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Current streak", stats.current],["Best streak", stats.best],["Weekly rate", `${stats.week}%`],["Monthly rate", `${stats.month}%`]].map(([label,value]) => <div key={label} className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>)}</section>
    <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-2xl font-black">Last 30 days</h2><div className="mt-4 space-y-2">{recent.map((row) => { const status = derivedOccurrenceStatus(row, today); return <button key={row.id} onClick={() => setEditing(row)} className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-slate-50 px-4 text-left"><span><span className="block font-black">{formatDate(row.scheduled_date)}</span><span className="text-sm font-semibold text-slate-500">{row.actual_value !== null ? `${row.actual_value} ${habit.target_unit ?? ""}` : "No value"}{row.completion_note ? ` · ${row.completion_note}` : ""}</span></span><span className="rounded-full bg-white px-3 py-1 text-xs font-black capitalize ring-1 ring-slate-200">{status}</span></button>; })}{!recent.length ? <p className="rounded-2xl bg-slate-50 p-5 font-semibold text-slate-500">No scheduled history in the last 30 days.</p> : null}</div></section>{editing ? <ProgressModal occurrence={editing} saving={saving} onClose={() => setEditing(null)} onSave={saveProgress} /> : null}</div>;
}
