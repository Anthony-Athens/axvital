"use client";
import { useState } from "react";
import { Button, ButtonLink, EmptyState, PageContainer, PageHeader, Surface } from "@/components/ui/design-system";
import { CONDITION_RANGE_LABEL, days, metrics, PRE_EPISODE_LOOKBACK_DAYS, summarizeLookback, type Activity, type Episode, type ConditionAssociation } from "@/lib/condition-intelligence/model";
import { ConditionTimeline, dateLabel } from "./ConditionTimeline";
import { compareAssociations } from "@/lib/condition-intelligence/associations";
import { ConditionPatterns } from "./ConditionPatterns";
import { episodeContext, focusEvidence, intervalContext, type IntelligenceFocus } from "@/lib/condition-intelligence/context";
import { EpisodeContext } from "./EpisodeContext";

export function ConditionMetricCard({ label, value, context }: { label: string; value: string; context?: string | null }) { return <Surface compact><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{value}</p>{context ? <p className="mt-2 text-xs text-slate-500">{context}</p> : null}</Surface>; }
export function EpisodeLookbackCard({ episode, events, index, incomplete, timeZone }: { episode: Episode; events: Activity[]; index: number; incomplete: boolean; timeZone: string }) {
  const counts = summarizeLookback(episode, events, timeZone);
  return <Surface compact><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Episode {index + 1}</p><h3 className="mt-1 font-semibold">{dateLabel(episode.start, timeZone)}</h3><p className="mt-1 text-xs text-slate-500">{episode.end === null ? "Ongoing" : days((episode.end - episode.start) / 86400000)} · Severity {episode.severity ?? "not recorded"}</p>{counts.length ? <ul className="mt-4 space-y-2 text-sm">{counts.map(([category, count]) => <li key={category} className="flex justify-between gap-3"><span>{category} records</span><strong>{count}</strong></li>)}</ul> : <p className="mt-4 text-sm text-slate-500">{incomplete ? "Activity is partially unavailable for this window." : "No health activity recorded in this window."}</p>}</Surface>;
}
export function ConditionIntelligence({ condition, episodes, healthEvents, now, start, associations, unavailable = [], mode = "app", timeZone = "UTC" }: { condition: { id: string; name: string }; episodes: Episode[]; healthEvents: Activity[]; now: number; start: number; associations?: ConditionAssociation[]; unavailable?: string[]; mode?: "app" | "marketing"; timeZone?: string }) {
  const [focus, setFocus] = useState<IntelligenceFocus>(null);
  const rows = episodes.filter(e => e.start >= start && e.start <= now).sort((a,b) => a.start - b.start);
  const stats = metrics(rows, now);
  const comparisons = associations ?? compareAssociations(episodes, healthEvents, start, now, !unavailable.includes("Check-in"), timeZone);
  const highlights = focusEvidence(focus, comparisons, rows, healthEvents, timeZone);
  const selectedEpisode = focus?.kind === "episode" ? rows.find(e => e.id === focus.id) : undefined;
  const selectedContext = selectedEpisode ? episodeContext(selectedEpisode, episodes, healthEvents, timeZone, !unavailable.includes("Check-in")) : null;
  const historical = intervalContext(rows, now);
  const severity = (n: number | null) => n === null ? "Not recorded" : `${Number(n.toFixed(1))} / 10`;
  return <PageContainer className="min-w-0 pb-28 [overflow-wrap:anywhere]">
    {mode === "app" ? <nav aria-label="Breadcrumb" className="mb-4 text-sm text-blue-700"><a href="/my-health">My Health</a><span> / Conditions / </span><a href={`/health/conditions/${condition.id}`}>{condition.name}</a></nav> : null}
    <PageHeader eyebrow="Condition Intelligence" title={condition.name} description="Your episode history and the health activity recorded around it." actions={mode === "app" ? <ButtonLink href="/health/episodes/new">Log episode</ButtonLink> : undefined}/>
    <div className="my-5 border-b border-slate-200 pb-3 text-sm font-semibold text-blue-700">Overview</div>
    <p className="mb-4 text-sm text-slate-500">{CONDITION_RANGE_LABEL} · Intervals and time since an episode use start times. Duration uses completed episodes; most recent duration uses the latest end time. Severity uses the latest recorded episode-level value.</p>
    <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 lg:grid-cols-3">{[
      ["Average time between episodes", days(stats.interval, "Not enough data")], ["Time since last episode", days(stats.since)], ["Average episode duration", days(stats.duration)], ["Most recent completed duration", days(stats.recentDuration)], ["Average episode severity", severity(stats.severity)], ["Most recent episode severity", severity(stats.recentSeverity)],
    ].map(([label,value]) => <ConditionMetricCard key={label} label={label} value={value} context={label === "Time since last episode" ? historical : undefined}/>)}</div>
    {!rows.length ? <div className="mt-6"><EmptyState title="Your episode history starts here" description="No episodes started in the last 12 months. Logged episodes in this range will build your condition history."/></div> : null}
    {rows.length === 1 ? <p className="mt-4 text-sm text-slate-600">Time between episodes becomes available after at least two episodes are logged.</p> : null}
    {unavailable.length ? <p role="status" className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Some activity could not be loaded completely: {unavailable.join(", ")}. Summaries below are partial. Reload to try again.</p> : null}
    <div className="mt-6 min-w-0" id="condition-timeline"><ConditionTimeline episodes={rows} healthEvents={healthEvents} start={start} now={now} mode={mode} timeZone={timeZone} focused={focus !== null} highlightedEpisodes={highlights.episodeIds} highlightedClusters={highlights.clusterKeys} selectedEpisodeId={selectedEpisode?.id} onSelectEpisode={id => setFocus({ kind: "episode", id })}/></div>
    {focus ? <div className="mt-3 flex flex-wrap items-center gap-3"><p role="status" className="text-sm font-medium">{focus.kind === "association" ? `Evidence focus: ${comparisons.find(a => a.factorKey === focus.key)?.label ?? focus.key}` : "Episode context selected"}</p><Button variant="secondary" onClick={() => setFocus(null)}>Clear timeline focus</Button></div> : null}
    {selectedEpisode && selectedContext ? <EpisodeContext episode={selectedEpisode} context={selectedContext} partial={unavailable.length > 0} onClose={() => { setFocus(null); document.getElementById(`episode-marker-${selectedEpisode.id}`)?.focus({ preventScroll: true }); }}/> : null}
    <section className="mt-8"><h2 className="text-xl font-semibold">What happened before your episodes?</h2><p className="mt-2 text-sm text-slate-500">Events recorded in the {PRE_EPISODE_LOOKBACK_DAYS} days before each episode. Logs cover the seven local calendar days before onset day. Counts summarize recorded health activity.</p><p className="mt-2 text-sm text-slate-500">More consistent tracking gives AXVital more context around your episodes.</p><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{rows.map((episode,index) => <EpisodeLookbackCard key={episode.id} episode={episode} index={index} events={healthEvents} incomplete={Boolean(unavailable.length)} timeZone={timeZone}/>)}</div></section>
    <ConditionPatterns associations={comparisons} timeZone={timeZone} selectedKey={focus?.kind === "association" ? focus.key : null} onSelect={key => setFocus(key ? { kind: "association", key } : null)}/>
  </PageContainer>;
}
