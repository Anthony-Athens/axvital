export const PRE_EPISODE_LOOKBACK_DAYS = 7;
export const DAY = 86_400_000;
export const CONDITION_RANGE_MONTHS = 12;
export const CONDITION_RANGE_LABEL = `Last ${CONDITION_RANGE_MONTHS} months`;
export type Episode = { id: string; start: number; end: number | null; severity: number | null };
export type CheckinObservations = { sleepQuality?: unknown; stress?: unknown; energy?: unknown; exercise?: unknown };
export type Activity = { id: string; at: number; category: string; dateOnly?: boolean; checkin?: CheckinObservations };
export type FactorKey = "poor_sleep" | "high_stress" | "low_energy" | "exercise";
export type AssociationEvidence = { episodeId: string; onset: number; start: number; end: number; eligibleDays: number; presentDays: number; eventIds: string[] };
export type ConditionAssociation = {
  factorKey: FactorKey; label: string; definition: string;
  episodesObserved: number; eligibleEpisodes: number;
  preEpisodeOccurrences: number; preEpisodeEligibleDays: number; preEpisodeRate: number | null;
  baselineOccurrences: number; baselineEligibleDays: number; baselineRate: number | null;
  relativeRate: number | null; sufficient: boolean; reasons: string[];
  dataQuality: "low" | "moderate" | "strong"; evidence: AssociationEvidence[];
};
export const calendarDay = (at: number) => Math.floor(at / DAY) * DAY;
// Shared proportional date axis for episodes, shading and activity.
export function timelineX(at: number, start: number, end: number, width: number) { return 100 + (at - start) / (end - start) * (width - 220); }
export function timelineLayout(categories: readonly string[]) {
  // Fixed visual slots: removing a category never moves another category's lane.
  // These are existing Activity labels, not additional data categories.
  const offsets: Record<string, number> = {
    "Check-in": -18, Nutrition: -36, Fluid: -54, Note: -72, "Health event": -90,
    Workout: 18, Exercise: 36, Supplement: 54, Medication: 72, Symptom: 90,
  };
  const plotTop = 70, centerY = 170, plotBottom = 270;
  const activityY = (index: number) => centerY + (offsets[categories[index]] ?? -90) - 4;
  return { activityY, plotTop, centerY, plotBottom, intervalY: 300, axisY: 355, height: 375 };
}
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
export function rangeStart(now: number, months = CONDITION_RANGE_MONTHS) {
  const date = new Date(now), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay)); return date.getTime();
}
export function days(value: number | null, missing = "Not recorded") { return value === null ? missing : `${Number(value.toFixed(1))} days`; }
