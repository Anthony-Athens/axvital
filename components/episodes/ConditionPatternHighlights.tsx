"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getUserConditions } from "@/lib/conditions/conditions";
import { getEpisodes } from "@/lib/episodes/episodes";
import { createClient } from "@/lib/supabase/browser";
import type { TriggerPattern } from "@/lib/trigger-analysis/types";
export function ConditionPatternHighlights({ recap = false }: { recap?: boolean }) {
  const [patterns, setPatterns] = useState<TriggerPattern[]>([]);
  useEffect(() => { let active = true; (async () => { try {
    const client = createClient(), [conditions, episodes] = await Promise.all([getUserConditions(client), getEpisodes(client)]), recentConditions = new Set(episodes.filter(e => new Date(e.started_at) >= new Date(Date.now() - 7 * 86400000)).map(e => e.user_condition_id));
    const eligible = conditions.filter(x => !x.archived_at && (!recap || recentConditions.has(x.id))).slice(0, 5);
    const results = await Promise.all(eligible.map(async c => { const q = new URLSearchParams({ condition: c.id, window: "48", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }), r = await fetch(`/api/trigger-patterns?${q}`, { cache: "no-store" }); return r.ok ? await r.json() : null; }));
    if (active) setPatterns(results.flatMap(x => x?.patterns?.slice(0, 1) ?? []).filter((x: TriggerPattern) => x.sufficientData).sort((a: TriggerPattern, b: TriggerPattern) => b.rankScore - a.rankScore).slice(0, recap ? 1 : 3));
  } catch { /* Optional insights must not block the parent page. */ } })(); return () => { active = false; }; }, [recap]);
  if (!patterns.length) return null;
  return <section className="mt-8"><h2 className="text-xl font-semibold">{recap ? "Pattern Worth Watching" : "Condition Patterns"}</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{patterns.map(x => <article key={x.id} className="rounded-xl border p-4"><p className="text-sm font-semibold text-blue-700">{x.conditionLabel} · <span className="capitalize">{x.evidenceStrength}</span></p><h3 className="mt-1 font-semibold">{x.exposureLabel}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{x.summary}</p><p className="mt-2 text-xs text-slate-500">Possible association; this does not establish causation.</p><Link href={`/health/conditions/${x.userConditionId}/patterns`} className="mt-2 inline-flex min-h-11 items-center font-semibold text-blue-700">Review patterns</Link></article>)}</div></section>;
}
