import { factors } from "./associations.ts";
import { activityDay, aggregateActivity, calendarDay, DAY, days, episodeWindow, metrics, summarizeLookback, type Activity, type ConditionAssociation, type Episode, type FactorKey } from "./model.ts";

export type IntelligenceFocus = { kind: "association"; key: FactorKey } | { kind: "episode"; id: string } | null;
export function focusEvidence(focus: IntelligenceFocus, associations: ConditionAssociation[], episodes: Episode[], events: Activity[], timeZone: string) {
  const ids = new Set<string>(), episodeIds = new Set<string>();
  if (focus?.kind === "association") {
    for (const evidence of associations.find(a => a.factorKey === focus.key)?.evidence ?? []) {
      if (evidence.presentDays > 0) { episodeIds.add(evidence.episodeId); evidence.eventIds.forEach(id => ids.add(id)); }
    }
  } else if (focus?.kind === "episode") {
    const episode = episodes.find(e => e.id === focus.id);
    if (episode) { episodeIds.add(episode.id); const window = episodeWindow(episode, timeZone); for (const event of events) { const day = activityDay(event, timeZone); if (day >= window.start && day < window.end) ids.add(event.id); } }
  }
  const clusterKeys = new Set(aggregateActivity(events, timeZone).filter(t => t.eventIds.some(id => ids.has(id))).map(t => `${t.at}:${t.category}`));
  return { episodeIds, clusterKeys };
}
export function episodeContext(episode: Episode, episodes: Episode[], events: Activity[], timeZone: string, checkinsComplete = true) {
  const window = episodeWindow(episode, timeZone);
  const rows = events.filter(e => { const day = activityDay(e, timeZone); return day >= window.start && day < window.end; });
  const usable = new Set<number>();
  const coverage = factors.map(factor => {
    const byDay = new Map<number, boolean | null>();
    for (const event of rows) {
      if (!event.checkin) continue;
      const value = factor.evaluate(event.checkin); if (value === null) continue;
      const day = activityDay(event, timeZone);
      if (byDay.has(day) && byDay.get(day) !== value) byDay.set(day, null); else if (!byDay.has(day)) byDay.set(day, value);
    }
    const days = [...byDay].filter(([,v]) => v !== null).map(([day]) => day);
    days.forEach(day => usable.add(day));
    return { key: factor.key, label: factor.key === "poor_sleep" ? "Sleep quality" : factor.key === "high_stress" ? "Stress" : factor.key === "low_energy" ? "Energy" : "Exercise answer", days: checkinsComplete ? days.length : null };
  });
  const ordered = [...episodes].sort((a,b) => a.start - b.start || a.id.localeCompare(b.id)), index = ordered.findIndex(e => e.id === episode.id), prior = ordered[index - 1];
  return { window, coverage, usableDays: checkinsComplete ? usable.size : null, eventCount: rows.length,
    categories: summarizeLookback(episode, rows, timeZone), priorInterval: prior ? (episode.start - prior.start) / DAY : null,
    startDay: calendarDay(episode.start, timeZone), endDay: episode.end === null ? null : calendarDay(episode.end, timeZone),
    duration: episode.end !== null && episode.end >= episode.start ? (episode.end - episode.start) / DAY : null,
  };
}
export function intervalContext(episodes: Episode[], now: number) {
  const rows = episodes.filter(e => e.start <= now);
  if (rows.length < 3) return null; // At least two completed start-to-start intervals.
  const stats = metrics(rows, now);
  if (stats.interval === null || stats.since === null || stats.interval <= 0) return null;
  const difference = Number((stats.since - stats.interval).toFixed(1));
  return difference === 0 ? "Equal to your average interval" : `${days(Math.abs(difference))} ${difference > 0 ? "longer" : "shorter"} than your average interval`;
}
