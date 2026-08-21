"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { normalizeWeeklyRecap } from "@/lib/analytics/normalizeWeeklyRecap";
import type { WeeklyRecapV2 } from "@/lib/analytics/types";
import { addLocalDays, localDateString, localDayRange } from "@/lib/timeline/dates";

function Section({ title, items }: { title: string; items: Array<{ title: string; description: string }> }) {
  if (!items.length) return null;
  return <section className="mt-7"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{items.map((item) => <article key={`${item.title}-${item.description}`} className="rounded-xl border bg-white p-4"><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p></article>)}</div></section>;
}

export default function Page() {
  const [recap, setRecap] = useState<WeeklyRecapV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => { setLoading(true); try { const response = await fetch("/api/weekly-recap", { cache: "no-store" }); if (!response.ok) throw new Error(); setRecap(normalizeWeeklyRecap(await response.json())); } catch { setMessage("We couldn’t load your weekly recap."); } finally { setLoading(false); } }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  async function generate() { setGenerating(true); setMessage(""); try { const endDate = localDateString(), first = localDayRange(addLocalDays(endDate, -96)), last = localDayRange(endDate); const response = await fetch("/api/weekly-recap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endDate, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, start: first.start, end: last.end }) }); if (!response.ok) throw new Error(); setRecap(normalizeWeeklyRecap(await response.json())); setMessage("Weekly recap regenerated."); } catch { setMessage("We couldn’t regenerate your weekly recap."); } finally { setGenerating(false); } }
  const summaryMetrics = recap?.summaryMetrics ?? [], wins = recap?.wins ?? [], changes = recap?.changes ?? [], patterns = recap?.patterns ?? [], symptoms = recap?.symptoms ?? [], experiments = recap?.experiments ?? [], nextWeekFocus = recap?.nextWeekFocus ?? null;
  return <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6"><header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-blue-700">Personal briefing</p><h1 className="mt-1 text-3xl font-semibold">Your Week</h1><p className="text-sm text-slate-600">A concise, non-causal summary of your recent structured data.</p></div><button onClick={() => void generate()} disabled={loading || generating} className="min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white">{generating ? "Regenerating…" : "Regenerate Weekly Recap"}</button></header>
    {message ? <p role="status" className="mt-5 rounded-lg bg-amber-50 p-4 text-amber-900">{message}</p> : null}
    {loading ? <div className="mt-6 h-28 animate-pulse rounded-xl bg-slate-100" /> : null}
    {!loading && !recap ? <section className="mt-6 rounded-xl border border-dashed p-6"><h2 className="text-xl font-semibold">Build your first weekly briefing</h2><p className="mt-2 text-slate-600">Generate a recap after tracking a few days of check-ins, nutrition, activity, or routines.</p></section> : null}
    {recap ? <><p className="mt-5 text-sm text-slate-500">{recap.weekStart} to {recap.weekEnd}{recap.generatedAt ? ` · Generated ${new Date(recap.generatedAt).toLocaleString()}` : ""}</p>
      {summaryMetrics.length ? <section className="mt-5"><h2 className="text-xl font-semibold">Your Week</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{summaryMetrics.map((metric) => <article key={metric.label} className="rounded-xl border p-4"><h3 className="text-sm font-semibold text-slate-600">{metric.label}</h3><p className="mt-1 text-2xl font-semibold">{metric.value}</p>{metric.basedOn ? <p className="text-xs text-slate-500">{metric.basedOn}</p> : null}</article>)}</div></section> : null}
      <Section title="Wins" items={wins} /><Section title="Changes" items={changes} />
      <Section title="Patterns Worth Watching" items={patterns.map((item) => ({ title: item.title, description: `${item.description} ${item.groupAObservationCount + item.groupBObservationCount} observations analyzed.` }))} />
      <Section title="Symptoms" items={symptoms.map((item) => ({ title: item.name, description: `${item.occurrences7} occurrences this week compared with ${item.previous7} the previous week. Average severity ${item.averageSeverity?.toFixed(1) ?? "not available"}.` }))} />
      <Section title="Experiment Progress" items={experiments.map((item) => ({ title: item.name, description: item.status === "completed" ? "Experiment completed. Review the persisted result separately." : `${item.phase} phase · No preliminary causal interpretation is shown.` }))} />
      {nextWeekFocus ? <section className="mt-7 rounded-xl border border-blue-200 bg-blue-50 p-5"><p className="text-sm font-semibold text-blue-700">Next Week Focus</p><h2 className="mt-1 text-xl font-semibold">{nextWeekFocus.title}</h2><p className="mt-2 text-sm leading-6 text-slate-700">{nextWeekFocus.description}</p></section> : null}
    </> : null}
    <Link href="/insights" className="mt-5 inline-flex min-h-11 items-center font-semibold text-blue-700">View Insights</Link>
  </main>;
}
