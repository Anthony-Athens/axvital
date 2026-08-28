import type { ObservedValue, SourceResult, SupportedKey } from "./observations.ts";
import { calendarDays, shiftDate } from "./time-window.ts";
import { measurement } from "./registry.ts";

export const readinessPolicies = {
  energy_score: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, observedDays: 7, spanDays: 7 },
  mood_score: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, observedDays: 7, spanDays: 7 },
  sleep_quality_score: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, observedDays: 7, spanDays: 7 },
  exercise_estimated_1rm: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, eligibleSets: 5, sessions: 2, dates: 2 },
} as const satisfies Record<SupportedKey, object>;
export type BaselineAggregate = { kind: "numeric"; value: number } | { kind: "ordinal_median"; lower: ObservedValue; upper: ObservedValue };
export type ReadinessResult = {
  contractVersion: 1; policyVersion: 1; registryKey: SupportedKey; registryVersion: 1;
  target: SourceResult["target"]; aggregation: string; unit: string; mode: "historical";
  requestedWindow: { startDate: string; endDateExclusive: string };
  effectiveWindow: { startDate: string; endDateExclusive: string; startAt: string; endAtExclusive: string };
  timezone: string; evaluatedAt: string; observationCount: number; distinctDays: number; distinctSessions: number | null;
  earliestObservation: { date: string; precision: "date" } | null; latestObservation: { date: string; precision: "date" } | null;
  latestValue: ObservedValue | null; baselineAggregate: BaselineAggregate | null;
  classification: "good" | "limited" | "insufficient" | null;
  queryCompleteness: SourceResult["queryCompleteness"]; warnings: string[]; blockers: string[]; temporalLimitations: string[];
  coverage: { expectedDays: number | null; observedDays: number; percentage: number | null; meaning: "checkin_observation_days" | "workout_dates_not_scheduled_coverage" };
  missingness: SourceResult["counts"];
  workout: { eligibleSetCount: number; distinctSessionCount: number; distinctDateCount: number; latestValue: number | null; bestValue: number | null; earliestDate: string | null; latestDate: string | null } | null;
};
/** Data-availability policy, not statistical confidence, clinical quality or a
 * start gate. Source order is deterministic; no source identifiers escape here.
 */
export function evaluateReadiness(source: SourceResult): ReadinessResult {
  const policy = readinessPolicies[source.registryKey];
  if (!policy || source.registryVersion !== policy.registryVersion) throw new Error("UNSUPPORTED_POLICY");
  if (!measurement(source.registryKey, source.registryVersion)?.aggregations.includes(source.aggregation)) throw new Error("INVALID_AGGREGATION");
  const complete = source.queryCompleteness === "complete", points = source.observations;
  const dates = [...new Set(points.map(p => p.logicalDate))].sort();
  const sessions = new Set(points.flatMap(p => p.workout ? [p.workout.sessionId] : []));
  const workout = source.registryKey === "exercise_estimated_1rm";
  const first = complete ? dates[0] ?? null : null, last = complete ? dates.at(-1) ?? null : null;
  const latest = complete ? points.at(-1)?.value ?? null : null;
  const values = points.map(p => p.value.value).sort((a, b) => a - b);
  let aggregate: BaselineAggregate | null = null;
  if (complete && values.length) {
    if (source.registryKey === "sleep_quality_score") {
      const sorted = [...points].sort((a, b) => a.value.value - b.value.value);
      aggregate = { kind: "ordinal_median", lower: sorted[Math.floor((sorted.length - 1) / 2)].value, upper: sorted[Math.floor(sorted.length / 2)].value };
    } else {
      const value = source.aggregation === "maximum" ? values.at(-1)! : source.aggregation === "median"
        ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2
        : values.reduce((sum, n) => sum + n, 0) / values.length;
      aggregate = { kind: "numeric", value };
    }
  }
  let classification: ReadinessResult["classification"] = null;
  if (complete) {
    const good = "eligibleSets" in policy
      ? points.length >= policy.eligibleSets && sessions.size >= policy.sessions && dates.length >= policy.dates
      : dates.length >= policy.observedDays && !!first && !!last && calendarDays(first, shiftDate(last, 1)) >= policy.spanDays;
    classification = !points.length ? "insufficient" : good ? "good" : "limited";
  }
  const warnings = [...source.warnings, "READINESS_IS_AVAILABILITY_HEURISTIC"];
  if (classification === "limited") warnings.push("SPARSE_BASELINE");
  if (classification === "insufficient") warnings.push("NO_ELIGIBLE_OBSERVATIONS");
  return {
    contractVersion: 1, policyVersion: 1, registryKey: source.registryKey, registryVersion: 1,
    target: source.target, aggregation: source.aggregation, unit: source.unit, mode: "historical",
    requestedWindow: { startDate: source.window.startDate, endDateExclusive: source.window.endDateExclusive },
    effectiveWindow: { startDate: source.window.startDate, endDateExclusive: source.window.endDateExclusive, startAt: source.window.startAt, endAtExclusive: source.window.effectiveEndAtExclusive },
    timezone: source.window.timeZone, evaluatedAt: source.window.evaluatedAt,
    observationCount: points.length, distinctDays: dates.length, distinctSessions: workout ? sessions.size : null,
    earliestObservation: first ? { date: first, precision: "date" } : null, latestObservation: last ? { date: last, precision: "date" } : null,
    latestValue: latest, baselineAggregate: aggregate, classification, queryCompleteness: source.queryCompleteness,
    warnings, blockers: complete ? [] : [source.queryCompleteness === "failed" ? "SOURCE_UNAVAILABLE" : "INCOMPLETE_SOURCE_READ"], temporalLimitations: [...source.temporalLimitations],
    coverage: { expectedDays: workout ? null : source.window.expectedDays, observedDays: dates.length, percentage: !complete || workout ? null : Math.round(dates.length / source.window.expectedDays * 100), meaning: workout ? "workout_dates_not_scheduled_coverage" : "checkin_observation_days" },
    missingness: { ...source.counts },
    workout: workout ? { eligibleSetCount: points.length, distinctSessionCount: sessions.size, distinctDateCount: dates.length,
      latestValue: latest?.value ?? null, bestValue: complete && values.length ? values.at(-1)! : null, earliestDate: first, latestDate: last } : null,
  };
}
