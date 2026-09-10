export const PRE_EPISODE_LOOKBACK_DAYS = 7;
export const DAY = 86_400_000;
export type Episode = { id: string; start: number; end: number | null; severity: number | null };
export type Activity = { id: string; at: number; category: string; dateOnly?: boolean };
export function lookback(start: number) { return { start: start - PRE_EPISODE_LOOKBACK_DAYS * DAY, end: start }; }
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export function metrics(episodes: Episode[], now: number) {
  const rows = episodes.filter(e => Number.isFinite(e.start) && e.start <= now).sort((a, b) => a.start - b.start);
  const completed = rows.filter(e => e.end !== null && Number.isFinite(e.end) && e.end >= e.start && e.end <= now).sort((a,b) => a.end! - b.end!);
  return {
    interval: mean(rows.slice(1).map((e, i) => (e.start - rows[i].start) / DAY)),
    since: rows.length ? (now - rows.at(-1)!.start) / DAY : null,
    duration: mean(completed.map(e => (e.end! - e.start) / DAY)),
    recentDuration: completed.length ? (completed.at(-1)!.end! - completed.at(-1)!.start) / DAY : null,
    severity: mean(rows.flatMap(e => e.severity !== null && e.severity >= 1 && e.severity <= 10 ? [e.severity] : [])),
    recentSeverity: rows.at(-1)?.severity ?? null,
  };
}
export function summarizeLookback(episode: Episode, events: Activity[]) {
  const window = lookback(episode.start);
  const counts = new Map<string, number>();
  for (const event of events) {
    // Date-only logs use UTC calendar days; onset day is excluded because time is unknown.
    const start = event.dateOnly ? Math.floor(window.start / DAY) * DAY : window.start;
    const end = event.dateOnly ? Math.floor(window.end / DAY) * DAY : window.end;
    if (event.at >= start && event.at < end) counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b));
}
export function aggregateActivity(events: Activity[]) {
  const groups = new Map<string, { at: number; category: string; count: number }>();
  for (const event of events) {
    const at = Math.floor(event.at / DAY) * DAY;
    const key = `${at}:${event.category}`;
    const group = groups.get(key) ?? { at, category: event.category, count: 0 };
    group.count++; groups.set(key, group);
  }
  return [...groups.values()];
}
export function rangeStart(now: number) { const date = new Date(now); date.setUTCMonth(date.getUTCMonth() - 18); return date.getTime(); }
export function days(value: number | null, missing = "Not recorded") { return value === null ? missing : `${Number(value.toFixed(1))} days`; }
