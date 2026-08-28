export type TargetKind = "none" | "condition" | "symptom" | "exercise";
export type MeasurementDefinition = {
  key: string; version: 1; label: string; target: TargetKind; sourceAdapter: "checkins" | "nutrition" | "episodes" | "symptoms" | "workouts";
  unit: string; grain: string; aggregations: readonly string[]; direction: readonly ["increase", "decrease", "maintain", "unknown"];
  scale: "ratio" | "rating" | "ordinal"; eligibility: string; limitations: string; baselineRecommendation: { windowDays: number; observations: number };
  enabled: boolean; disabledReason?: string; legacyType: string;
  formula?: { key: "epley"; version: 1; expression: string };
};
const direction = ["increase", "decrease", "maintain", "unknown"] as const;
const define = (key: string, label: string, target: TargetKind, sourceAdapter: MeasurementDefinition["sourceAdapter"], unit: string, grain: string, aggregations: string[], scale: MeasurementDefinition["scale"], eligibility: string, limitations: string, legacyType: string, enabled = true): MeasurementDefinition => ({
  key, version: 1, label, target, sourceAdapter, unit, grain, aggregations, scale, eligibility, limitations, legacyType, enabled, direction,
  baselineRecommendation: { windowDays: target === "condition" ? 28 : 14, observations: target === "condition" ? 3 : 5 },
  ...(!enabled ? { disabledReason: "Historical load/weight units and/or estimation contract have not been verified." } : {}),
});
/** Metadata only. Source adapters/readiness are the next slice; no evaluators live here. */
export const WORKOUT_PERFORMANCE_PRIMARY_OUTCOME = "exercise_estimated_1rm";
export const outcomeRegistry: readonly MeasurementDefinition[] = [
  define("energy_score", "Energy", "none", "checkins", "score_10", "day", ["average", "median"], "rating", "Non-null 1–10 answer", "Self-report; missing days are unknown", "energy"),
  define("mood_score", "Mood", "none", "checkins", "score_10", "day", ["average", "median"], "rating", "Non-null 1–10 answer", "Self-report; missing days are unknown", "mood"),
  define("sleep_quality_score", "Sleep quality", "none", "checkins", "ordinal_4", "day", ["median"], "ordinal", "Poor/Average/Good/Great mapped 1/2/3/4; unknown aliases excluded", "Ordinal quality, not hours", "sleep_quality"),
  define("body_weight", "Body weight", "none", "checkins", "lb", "day", ["average", "median"], "ratio", "Positive weight with verified units", "No per-row unit provenance", "weight", false),
  ...([ ["calories", "Calories", "kcal"], ["protein_grams", "Protein", "g"], ["carbohydrate_grams", "Carbohydrate", "g"], ["fat_grams", "Fat", "g"], ["fiber_grams", "Fiber", "g"], ["caffeine_mg", "Caffeine", "mg"], ["alcohol_grams", "Alcohol", "g"] ] as const).map(([metric, label, unit]) => define(`nutrition_${metric}`, `Logged ${label.toLowerCase()}`, "none", "nutrition", unit, "day", ["average", "sum"], "ratio", "Nondeleted entry snapshots; known amounts only, retain incomplete-field and intake-coverage flags", "Logged subtotal is not total intake; no record/null nutrient is unknown", "nutrition")),
  define("condition_episode_frequency", "Recorded episode frequency", "condition", "episodes", "count", "window", ["count"], "ratio", "Nonarchived onsets in half-open window", "No onset logs do not establish symptom-free surveillance", "episode_frequency"),
  define("condition_episode_duration_hours", "Resolved episode duration", "condition", "episodes", "h", "episode", ["average", "median"], "ratio", "Onset cohort; resolved by analysis cutoff; end >= start", "Ongoing episodes censored, never zero", "episode_duration"),
  define("condition_episode_peak_severity", "Peak recorded episode severity", "condition", "episodes", "score_10", "episode", ["average", "median"], "rating", "Peak of recorded updates through cutoff; no later mutable-row leakage", "Sparse updates may miss peak; not onset severity", "episode_severity"),
  define("condition_episode_impact", "Recorded episode impact", "condition", "episodes", "ordinal_5", "episode", ["median"], "ordinal", "Latest recorded update at cutoff; none/mild/moderate/significant/severe mapped 0–4", "Do not infer percentage change on ordinal ranks", "episode_impact"),
  define("symptom_event_frequency", "Recorded symptom-event frequency", "symptom", "symptoms", "count", "window", ["count"], "ratio", "Nondeleted event rows in onset window; catalog or durable user symptom ID", "Not occurrence_count or symptom-free surveillance", "symptom_occurrence"),
  define("symptom_occurrence_count", "Reported symptom count", "symptom", "symptoms", "count", "window", ["sum"], "ratio", "Sum nonnull occurrence_count; retain missing count flags", "Null count is not one", "symptom_occurrence"),
  define("symptom_severity", "Recorded symptom severity", "symptom", "symptoms", "score_10", "event", ["average", "median"], "rating", "Nondeleted identified events with 1–10 severity", "Optional condition scope uses event-condition links only", "symptom_severity"),
  define("symptom_duration_minutes", "Resolved symptom duration", "symptom", "symptoms", "min", "event", ["average", "median"], "ratio", "Valid start/end, resolved by cutoff", "Open events censored; overlapping durations are not burden", "symptom_duration"),
  { ...define(WORKOUT_PERFORMANCE_PRIMARY_OUTCOME, "Estimated 1RM", "exercise", "workouts", "lb", "set", ["maximum"], "ratio", "Same-owner consistent session/exercise/set links; selected exercise ID; weight_reps; working; set status completed; finite actual_weight > 0; integer actual_reps 1–10", "Epley estimate, not true 1RM. Existing app lb convention; no per-row unit provenance or conversion. Preserve logged per-implement load, never double dumbbells. Missing is unknown; only eligible sets in window; same load convention required across observations.", "workout_performance"), formula: { key: "epley", version: 1, expression: "actual_weight * (1 + actual_reps / 30.0)" } },
  define("exercise_session_frequency", "Exercise session frequency", "exercise", "workouts", "count", "window", ["count"], "ratio", "Distinct completed sessions with completed eligible sets for exercise ID", "Activity frequency, not the primary strength-performance outcome. Planned exercises do not count as performed", "workout_performance"),
  define("exercise_repetitions", "Exercise repetitions", "exercise", "workouts", "reps", "session", ["sum", "average"], "ratio", "Completed actual sets, nonnegative reps, repetition-compatible tracking", "No substitution of planned reps or unknown values", "workout_performance"),
  ...([ ["exercise_best_single_load", "Best logged single", "lb"], ["exercise_external_load_volume", "External-load volume", "lb_reps"] ] as const).map(([key, label, unit]) => define(key, label, "exercise", "workouts", unit, "session", ["maximum"], "ratio", "Verified load units and versioned eligible-set definition required", "Historical units/load semantics unverified for this metric", "workout_performance", false)),
];
export function measurement(key: string, version = 1) { return outcomeRegistry.find(item => item.key === key && item.version === version); }
