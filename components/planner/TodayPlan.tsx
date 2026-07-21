"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OccurrenceCard } from "./OccurrenceCard";
import { getOccurrencesForDate, updateOccurrenceStatus } from "@/lib/planner/planner";
import type { OccurrenceStatus, PlannedActivityOccurrence } from "@/lib/planner/types";
import { supabase } from "@/lib/supabase/client";
import { logDevError } from "@/lib/app-errors";

function todayString() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

export function TodayPlan() {
  const [items, setItems] = useState<PlannedActivityOccurrence[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => { try { setItems(await getOccurrencesForDate(supabase, todayString())); } catch (value) { logDevError("Failed to load today's plan", value); setError("We couldn’t load today’s plan."); } finally { setLoading(false); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function change(item: PlannedActivityOccurrence, status: OccurrenceStatus) { setBusy(item.id); setError(""); try { const updated = await updateOccurrenceStatus(supabase, item.id, status); setItems((values) => values.map((value) => value.id === item.id ? updated : value)); } catch (value) { logDevError("Failed to change activity status", value); setError("We couldn’t change the activity status."); } finally { setBusy(null); } }
  return <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6" aria-labelledby="today-plan-heading"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">Planner</p><h2 id="today-plan-heading" className="mt-2 text-2xl font-black tracking-tight">Today’s Plan</h2></div><Link href="/weekly-overview" className="min-h-11 rounded-full bg-slate-950 px-4 py-3 text-xs font-black text-white">View Weekly Overview</Link></div>
    {error ? <p role="alert" className="mt-4 rounded-2xl bg-rose-50 p-3 font-bold text-rose-700">{error}</p> : null}
    {loading ? <p className="mt-4 font-semibold text-slate-500">Loading today’s plan…</p> : null}
    {!loading && !items.length ? <p className="mt-4 rounded-2xl bg-slate-50 p-4 font-semibold text-slate-500">Nothing planned today. Open the Weekly Overview to add an activity.</p> : null}
    <div className="mt-4 grid gap-3 md:grid-cols-2">{items.map((item) => <OccurrenceCard key={item.id} occurrence={item} busy={busy === item.id} onStatus={(status) => void change(item, status)} />)}</div>
  </section>;
}
