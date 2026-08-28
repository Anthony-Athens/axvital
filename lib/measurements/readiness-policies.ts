import type { ObservedValue, SourceResult, SupportedKey } from "./observations.ts";
import { calendarDays, shiftDate } from "./time-window.ts";
import { measurement } from "./registry.ts";

export const readinessPolicies = {
  energy_score: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, observedDays: 7, spanDays: 7 },
  mood_score: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, observedDays: 7, spanDays: 7 },
  sleep_quality_score: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, observedDays: 7, spanDays: 7 },
  exercise_estimated_1rm: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, eligibleSets: 5, sessions: 2, dates: 2 },
  nutrition_calories: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, completeDays: 7, fraction: 0.5 },
  nutrition_protein_grams: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, completeDays: 7, fraction: 0.5 },
  nutrition_carbohydrate_grams: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, completeDays: 7, fraction: 0.5 },
  nutrition_fat_grams: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, completeDays: 7, fraction: 0.5 },
  nutrition_fiber_grams: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, completeDays: 7, fraction: 0.5 },
  nutrition_caffeine_mg: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, completeDays: 7, fraction: 0.5 },
  nutrition_alcohol_grams: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, completeDays: 7, fraction: 0.5 },
  condition_episode_frequency: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 28, recordedOnly: true },
  condition_episode_duration_hours: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 28, observations: 3, distinctDays: 1 },
  condition_episode_peak_severity: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 28, observations: 3, distinctDays: 1 },
  condition_episode_impact: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 28, observations: 3, distinctDays: 1 },
  symptom_event_frequency: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, recordedOnly: true },
  symptom_occurrence_count: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, recordedOnly: true },
  symptom_severity: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, observations: 5, distinctDays: 3 },
  symptom_duration_minutes: { registryVersion: 1, policyVersion: 1, defaultWindowDays: 14, observations: 5, distinctDays: 3 },
} as const satisfies Record<SupportedKey, object>;
export type BaselineAggregate = { kind: "numeric"; value: number } | { kind: "ordinal_median"; lower: ObservedValue; upper: ObservedValue };
export type ReadinessResult = {
  contractVersion: 1; policyVersion: 1; registryKey: SupportedKey; registryVersion: 1;
  target: SourceResult["target"]; aggregation: string; unit: string; mode: "historical";
  requestedWindow: { startDate: string; endDateExclusive: string };
  effectiveWindow: { startDate: string; endDateExclusive: string; startAt: string; endAtExclusive: string };
  timezone: string; evaluatedAt: string; observationCount: number; distinctDays: number; distinctSessions: number | null;
  earliestObservation: { date: string; precision: "date" | "timestamp"; occurredAt?: string } | null; latestObservation: { date: string; precision: "date" | "timestamp"; occurredAt?: string } | null;
  latestValue: ObservedValue | null; baselineAggregate: BaselineAggregate | null;
  classification: "good" | "limited" | "insufficient" | null;
  queryCompleteness: SourceResult["queryCompleteness"]; warnings: string[]; blockers: string[]; temporalLimitations: string[];
  coverage: { expectedDays: number | null; observedDays: number; percentage: number | null; meaning: "checkin_observation_days" | "workout_dates_not_scheduled_coverage" | "field_complete_and_logging_complete_days" | "event_days_not_surveillance" };
  missingness: SourceResult["counts"];
  workout: { eligibleSetCount: number; distinctSessionCount: number; distinctDateCount: number; latestValue: number | null; bestValue: number | null; earliestDate: string | null; latestDate: string | null } | null;
  nutrition?: { qualifyingCompleteDays: number | null; partialDays: number | null; unknownCoverageDays: number | null; fieldIncompleteDays: number | null; requestedDays: number };
  recordedTotal?: number | null;
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
  const nutrition = source.sourceDomain === "nutrition", events = source.sourceDomain === "episodes" || source.sourceDomain === "symptoms";
  const qualifying = (source.nutritionDays ?? []).filter(d => d.fieldComplete && d.coverageStatus === "complete").length;
  const first = complete ? dates[0] ?? null : null, last = complete ? dates.at(-1) ?? null : null;
  const latest = complete ? points.at(-1)?.value ?? null : null;
  const values = points.map(p => p.value.value).sort((a, b) => a - b);
  let aggregate: BaselineAggregate | null = null;
  if (complete && values.length) {
    if (measurement(source.registryKey, source.registryVersion)?.scale === "ordinal") {
      const sorted = [...points].sort((a, b) => a.value.value - b.value.value);
      aggregate = { kind: "ordinal_median", lower: sorted[Math.floor((sorted.length - 1) / 2)].value, upper: sorted[Math.floor(sorted.length / 2)].value };
    } else {
      const value = source.aggregation === "count" ? values.length : source.aggregation === "sum" ? values.reduce((sum, n) => sum + n, 0) : source.aggregation === "maximum" ? values.at(-1)! : source.aggregation === "median"
        ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2
        : values.reduce((sum, n) => sum + n, 0) / values.length;
      aggregate = { kind: "numeric", value };
    }
  }
  if (complete && source.aggregation === "count" && !values.length) aggregate = { kind: "numeric", value: 0 };
  let classification: ReadinessResult["classification"] = null;
  if (complete) {
    const good = "eligibleSets" in policy
      ? points.length >= policy.eligibleSets && sessions.size >= policy.sessions && dates.length >= policy.dates
      : "completeDays" in policy ? qualifying >= policy.completeDays && qualifying / source.window.expectedDays >= policy.fraction
      : "observations" in policy ? points.length >= policy.observations && dates.length >= policy.distinctDays
      : "recordedOnly" in policy ? false
      : dates.length >= policy.observedDays && !!first && !!last && calendarDays(first, shiftDate(last, 1)) >= policy.spanDays;
    classification = !points.length ? "insufficient" : good ? "good" : "limited";
    if ("recordedOnly" in policy && source.aggregation === "count") classification = "limited";
  }
  const warnings = [...source.warnings, "READINESS_IS_AVAILABILITY_HEURISTIC"];
  if (classification === "limited") warnings.push("SPARSE_BASELINE");
  if (classification === "insufficient") warnings.push("NO_ELIGIBLE_OBSERVATIONS");
  if (complete && events && source.aggregation === "count" && !points.length) warnings.push("ZERO_RECORDED_EVENTS_NOT_VERIFIED_ABSENCE");
  return {
    contractVersion: 1, policyVersion: 1, registryKey: source.registryKey, registryVersion: 1,
    target: source.target, aggregation: source.aggregation, unit: source.unit, mode: "historical",
    requestedWindow: { startDate: source.window.startDate, endDateExclusive: source.window.endDateExclusive },
    effectiveWindow: { startDate: source.window.startDate, endDateExclusive: source.window.endDateExclusive, startAt: source.window.startAt, endAtExclusive: source.window.effectiveEndAtExclusive },
    timezone: source.window.timeZone, evaluatedAt: source.window.evaluatedAt,
    observationCount: points.length, distinctDays: dates.length, distinctSessions: workout ? sessions.size : null,
    earliestObservation: first ? { date: first, precision: points[0].precision, ...(points[0].occurredAt ? { occurredAt: points[0].occurredAt } : {}) } : null,
    latestObservation: last ? { date: last, precision: points.at(-1)!.precision, ...(points.at(-1)!.occurredAt ? { occurredAt: points.at(-1)!.occurredAt } : {}) } : null,
    latestValue: latest, baselineAggregate: aggregate, classification, queryCompleteness: source.queryCompleteness,
    warnings, blockers: complete ? [] : [source.queryCompleteness === "failed" ? "SOURCE_UNAVAILABLE" : "INCOMPLETE_SOURCE_READ"], temporalLimitations: [...source.temporalLimitations],
    coverage: { expectedDays: workout || events ? null : source.window.expectedDays, observedDays: dates.length, percentage: !complete || workout || events ? null : Math.round((nutrition ? qualifying : dates.length) / source.window.expectedDays * 100), meaning: workout ? "workout_dates_not_scheduled_coverage" : events ? "event_days_not_surveillance" : nutrition ? "field_complete_and_logging_complete_days" : "checkin_observation_days" },
    missingness: { ...source.counts },
    workout: workout ? { eligibleSetCount: points.length, distinctSessionCount: sessions.size, distinctDateCount: dates.length,
      latestValue: latest?.value ?? null, bestValue: complete && values.length ? values.at(-1)! : null, earliestDate: first, latestDate: last } : null,
    ...(nutrition ? { nutrition: { qualifyingCompleteDays: complete ? qualifying : null, partialDays: complete ? (source.nutritionDays ?? []).filter(d => d.coverageStatus === "partial").length : null,
      unknownCoverageDays: complete ? (source.nutritionDays ?? []).filter(d => d.coverageStatus === "unknown").length : null,
      fieldIncompleteDays: complete ? (source.nutritionDays ?? []).filter(d => !d.fieldComplete).length : null, requestedDays: source.window.expectedDays } } : {}),
    ...(events && (source.aggregation === "count" || source.aggregation === "sum") ? { recordedTotal: aggregate?.kind === "numeric" ? aggregate.value : null } : {}),
  };
}
