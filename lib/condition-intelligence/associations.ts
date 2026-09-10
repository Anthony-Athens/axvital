import { calendarDay, DAY, lookback, type Activity, type CheckinObservations, type ConditionAssociation, type Episode, type FactorKey } from "./model.ts";

export const MIN_EPISODES_FOR_ASSOCIATION = 2;
export const MIN_LOOKBACK_DAYS = 7;
export const MIN_BASELINE_DAYS = 28;
export const MIN_FACTOR_DAYS = 3;
export const STRONG_DATA = { episodes: 4, lookbackDays: 21, baselineDays: 60 };
export const LOW_ENERGY_MAX = 3;
const categorical = (value: unknown, allowed: string[], present: string[]) => typeof value === "string" && allowed.includes(value) ? present.includes(value) : null;
export const factors: Array<{ key: FactorKey; label: string; definition: string; evaluate: (value: CheckinObservations) => boolean | null }> = [
  { key: "poor_sleep", label: "Poor sleep quality", definition: "Eligible: a Poor, Average, Good or Great sleep-quality answer. Present: Poor. Absent: Average, Good or Great. Missing or other values are ignored; this does not measure sleep hours.", evaluate: c => categorical(c.sleepQuality, ["Poor", "Average", "Good", "Great"], ["Poor"]) },
  { key: "high_stress", label: "High self-reported stress", definition: "Eligible: a Low, Medium or High stress answer. Present: High. Absent: Low or Medium. Missing or other values are ignored.", evaluate: c => categorical(c.stress, ["Low", "Medium", "High"], ["High"]) },
  { key: "low_energy", label: "Low energy (1–3/10)", definition: "Eligible: an integer energy score from 1 to 10. Present: 1–3. Absent: 4–10. Missing or invalid values are ignored.", evaluate: c => typeof c.energy === "number" && Number.isInteger(c.energy) && c.energy >= 1 && c.energy <= 10 ? c.energy <= LOW_ENERGY_MAX : null },
  { key: "exercise", label: "Exercise reported", definition: "Eligible: a None, No Workout, Light, Moderate or Intense exercise answer. Present: Light, Moderate or Intense. Absent: None or No Workout. Missing answers and optional workout-log absence are ignored.", evaluate: c => categorical(c.exercise, ["None", "No Workout", "Light", "Moderate", "Intense"], ["Light", "Moderate", "Intense"]) },
];

/** Day-level descriptive comparisons, not significance tests. Input includes carry-in
 * episodes intersecting the range, so an older ongoing episode cannot enter baseline. */
export function compareAssociations(episodes: Episode[], events: Activity[], start: number, now: number, checkinsComplete = true): ConditionAssociation[] {
  // Exclude partial first/current days. Only full UTC days inside the visible range.
  const first = Math.ceil(start / DAY) * DAY, end = calendarDay(now);
  const visible = episodes.filter(e => Number.isFinite(e.start) && e.start >= start && e.start <= now).sort((a,b) => a.start - b.start || a.id.localeCompare(b.id));
  const episodeDays = new Set<number>(), preDays = new Set<number>();
  for (const episode of episodes) {
    if (!Number.isFinite(episode.start) || episode.start > now) continue;
    const until = episode.end !== null && Number.isFinite(episode.end) && episode.end >= episode.start ? Math.min(episode.end, now) : now;
    for (let day = Math.max(first, calendarDay(episode.start)); day <= calendarDay(until) && day < end; day += DAY) episodeDays.add(day);
  }
  const windows = visible.map(episode => {
    const window = lookback(calendarDay(episode.start));
    for (let day = Math.max(first, window.start); day < Math.min(end, window.end); day += DAY) preDays.add(day);
    return { episode, ...window };
  });
  return factors.map(factor => {
    const observations = new Map<number, { present: boolean; ids: string[]; conflict: boolean }>();
    for (const event of events) {
      if (!event.checkin || !Number.isFinite(event.at)) continue;
      const day = calendarDay(event.at), present = factor.evaluate(event.checkin);
      if (day < first || day >= end || present === null || episodeDays.has(day)) continue;
      const existing = observations.get(day);
      if (existing) { existing.conflict ||= existing.present !== present; existing.ids.push(event.id); }
      else observations.set(day, { present, ids: [event.id], conflict: false });
    }
    // Conflicting duplicate answers are unknown, rather than selecting a convenient value.
    for (const [day, observation] of observations) if (observation.conflict) observations.delete(day);
    let preEpisodeOccurrences = 0, preEpisodeEligibleDays = 0, baselineOccurrences = 0, baselineEligibleDays = 0;
    for (const [day, observation] of observations) {
      if (preDays.has(day)) { preEpisodeEligibleDays++; if (observation.present) preEpisodeOccurrences++; }
      else { baselineEligibleDays++; if (observation.present) baselineOccurrences++; }
    }
    const evidence = windows.map(window => {
      const days = [...observations].filter(([day]) => day >= window.start && day < window.end);
      return { episodeId: window.episode.id, onset: window.episode.start, start: window.start, end: window.end, eligibleDays: days.length, presentDays: days.filter(([,d]) => d.present).length, eventIds: days.flatMap(([,d]) => d.present ? d.ids : []) };
    });
    const eligibleEpisodes = evidence.filter(e => e.eligibleDays > 0).length, episodesObserved = evidence.filter(e => e.presentDays > 0).length;
    const reasons: string[] = [];
    if (!checkinsComplete) reasons.push("Check-in data is unavailable or incomplete.");
    if (eligibleEpisodes < MIN_EPISODES_FOR_ASSOCIATION) reasons.push(`At least ${MIN_EPISODES_FOR_ASSOCIATION} episodes with eligible lookback observations are needed.`);
    if (preEpisodeEligibleDays < MIN_LOOKBACK_DAYS) reasons.push(`At least ${MIN_LOOKBACK_DAYS} unique eligible pre-episode days are needed.`);
    if (baselineEligibleDays < MIN_BASELINE_DAYS) reasons.push(`At least ${MIN_BASELINE_DAYS} eligible baseline days are needed.`);
    if (preEpisodeOccurrences + baselineOccurrences < MIN_FACTOR_DAYS) reasons.push(`At least ${MIN_FACTOR_DAYS} factor-present days across both groups are needed.`);
    const sufficient = reasons.length === 0;
    const preEpisodeRate = sufficient ? preEpisodeOccurrences / preEpisodeEligibleDays : null;
    const baselineRate = sufficient ? baselineOccurrences / baselineEligibleDays : null;
    const relativeRate = preEpisodeRate !== null && baselineRate !== null && baselineRate > 0 ? preEpisodeRate / baselineRate : null;
    return { factorKey: factor.key, label: factor.label, definition: factor.definition, episodesObserved, eligibleEpisodes, preEpisodeOccurrences, preEpisodeEligibleDays, preEpisodeRate, baselineOccurrences, baselineEligibleDays, baselineRate, relativeRate, sufficient, reasons, evidence, dataQuality: !sufficient ? "low" : eligibleEpisodes >= STRONG_DATA.episodes && preEpisodeEligibleDays >= STRONG_DATA.lookbackDays && baselineEligibleDays >= STRONG_DATA.baselineDays ? "strong" : "moderate" };
  });
}

export function leadingAssociation(rows: ConditionAssociation[]) {
  return rows.filter(r => r.sufficient && r.preEpisodeRate !== null && r.baselineRate !== null && r.preEpisodeRate > r.baselineRate && r.episodesObserved >= MIN_EPISODES_FOR_ASSOCIATION)
    .sort((a,b) => (b.preEpisodeRate! - b.baselineRate!) - (a.preEpisodeRate! - a.baselineRate!) || b.episodesObserved / b.eligibleEpisodes - a.episodesObserved / a.eligibleEpisodes || (b.preEpisodeEligibleDays + b.baselineEligibleDays) - (a.preEpisodeEligibleDays + a.baselineEligibleDays) || a.factorKey.localeCompare(b.factorKey))[0] ?? null;
}
