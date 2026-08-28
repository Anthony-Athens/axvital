import type { HistoricalWindow } from "./time-window.ts";
export type NutritionKey = "nutrition_calories" | "nutrition_protein_grams" | "nutrition_carbohydrate_grams" | "nutrition_fat_grams" | "nutrition_fiber_grams" | "nutrition_caffeine_mg" | "nutrition_alcohol_grams";
export type SupportedKey = "body_weight" | "energy_score" | "mood_score" | "sleep_quality_score" | "exercise_estimated_1rm" | NutritionKey
  | "condition_episode_frequency" | "condition_episode_duration_hours" | "condition_episode_peak_severity" | "condition_episode_impact"
  | "symptom_event_frequency" | "symptom_occurrence_count" | "symptom_severity" | "symptom_duration_minutes";
export type TargetIdentity = { kind: "none" } | { kind: "exercise"; exerciseId: string } | { kind: "condition"; conditionId: string }
  | { kind: "symptom"; symptomId?: string; userSymptomId?: string; conditionId?: string };
export type NutritionDay = { logicalDate: string; entryCount: number; knownItemCount: number; unknownItemCount: number; hasItems: boolean; fieldComplete: boolean; coverageStatus: "complete" | "partial" | "unknown"; subtotal: number | null };
export type ObservedValue = { kind: "numeric"; value: number } | { kind: "ordinal"; value: number; category: string };
/** Internal source identifiers and raw workout fields must not be serialized as
 * public API payloads. Date-only points have no invented observation timestamp.
 */
export type Observation = {
  sourceId: string; logicalDate: string; precision: "date" | "timestamp"; occurredAt?: string; value: ObservedValue;
  eligibility: "eligible";
  workout?: { sessionId: string; sessionStartedAt: string; groupOrder: number; exerciseOrder: number; setNumber: number; completedAt: string | null; actualWeight: number; actualReps: number };
};
export type SourceResult = {
  contractVersion: 1; registryKey: SupportedKey; registryVersion: 1|2; adapterVersion: 1;
  sourceDomain: "checkins" | "workouts" | "nutrition" | "episodes" | "symptoms"; target: TargetIdentity; grain: string; unit: string; aggregation: string;
  window: HistoricalWindow; observations: Observation[]; observationCount: number;
  queryCompleteness: "complete" | "truncated" | "failed";
  counts: { sourceRows: number; nullValues: number; excluded: number; censored: number; absentDays: number | null };
  exclusions: Record<string, number>; warnings: string[]; temporalLimitations: string[];
  nutritionDays?: NutritionDay[];
};
