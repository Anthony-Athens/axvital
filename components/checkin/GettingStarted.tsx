"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { shouldShowGettingStarted } from "@/lib/onboarding/getting-started";
import { supabase } from "@/lib/supabase/client";

const DISMISSED_KEY = "axvital.today.gettingStarted.dismissed";
const DASHBOARD_KEY = "axvital.gettingStarted.dashboardViewed";
const EXPERIMENTS_KEY = "axvital.gettingStarted.experimentsViewed";

type Progress = { logged: boolean; setup: boolean; dashboard: boolean; experiments: boolean };

export function GettingStarted({ checkinComplete }: { checkinComplete: boolean }) {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [progress, setProgress] = useState<Progress>({ logged: false, setup: false, dashboard: false, experiments: false });

  const load = useCallback(async () => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "true");
    const local = { dashboard: localStorage.getItem(DASHBOARD_KEY) === "true", experiments: localStorage.getItem(EXPERIMENTS_KEY) === "true" };
    const queries = [
      supabase.from("health_events").select("id", { count: "exact", head: true }),
      supabase.from("nutrition_entries").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("user_symptom_events").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("workout_sessions").select("id", { count: "exact", head: true }),
      supabase.from("planned_activities").select("id", { count: "exact", head: true }),
      supabase.from("user_conditions").select("id", { count: "exact", head: true }).is("archived_at", null),
      supabase.from("experiments").select("id", { count: "exact", head: true }),
    ];
    const results = await Promise.allSettled(queries);
    const count = (index: number) => results[index].status === "fulfilled" ? results[index].value.count ?? 0 : 0;
    setProgress({ logged: [0,1,2,3].some((index) => count(index) > 0), setup: count(4) + count(5) > 0, dashboard: local.dashboard, experiments: local.experiments || count(6) > 0 });
    setReady(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    window.addEventListener("axvital:timeline-refresh", load);
    return () => { clearTimeout(timer); window.removeEventListener("axvital:timeline-refresh", load); };
  }, [load]);

  if (!ready || dismissed) return null;
  const items = [
    { label: "Complete today’s check-in", done: checkinComplete, href: "#daily-checkin" },
    { label: "Log your first activity", done: progress.logged, href: "#optional-events" },
    { label: "Set up something to track", done: progress.setup, href: "/track" },
    { label: "View your Dashboard", done: progress.dashboard, href: "/dashboard", key: DASHBOARD_KEY },
    { label: "Explore Experiments", done: progress.experiments, href: "/experiments", key: EXPERIMENTS_KEY },
  ];
  const completed = items.filter((item) => item.done).length;
  if (!shouldShowGettingStarted({ checkin: checkinComplete, ...progress }, dismissed)) return null;

  return <section aria-labelledby="getting-started-title" className="mt-5 rounded-xl border border-blue-200 bg-blue-50/70 p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Track → Learn → Test</p><h2 id="getting-started-title" className="mt-1 text-lg font-semibold text-slate-950">Getting Started</h2><p className="mt-1 text-sm text-slate-600">Start with one check-in and one meaningful log. Patterns become more useful as your history grows.</p></div><button type="button" onClick={() => { localStorage.setItem(DISMISSED_KEY, "true"); setDismissed(true); }} className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-white focus-visible:ring-2 focus-visible:ring-blue-600" aria-label="Dismiss Getting Started">Dismiss</button></div>
    <p className="mt-3 text-sm font-semibold text-slate-700" role="status">{completed} of {items.length} complete</p>
    <ul className="mt-2 grid gap-2 sm:grid-cols-2">{items.map((item) => <li key={item.label}><Link href={item.href} onClick={() => { if (item.key) { localStorage.setItem(item.key, "true"); setProgress((current) => ({ ...current, [item.key === DASHBOARD_KEY ? "dashboard" : "experiments"]: true })); } }} className="flex min-h-11 items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><span aria-hidden="true" className={item.done ? "text-emerald-700" : "text-slate-400"}>{item.done ? "✓" : "○"}</span><span className={item.done ? "line-through decoration-slate-400" : ""}>{item.label}</span><span className="sr-only">{item.done ? "Completed" : "Not completed"}</span></Link></li>)}</ul>
  </section>;
}
