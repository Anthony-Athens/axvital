import type { HistoricalWindow } from "./time-window.ts";
export type SupportedKey = "energy_score" | "mood_score" | "sleep_quality_score" | "exercise_estimated_1rm";
export type TargetIdentity = { kind: "none" } | { kind: "exercise"; exerciseId: string };
export type ObservedValue = { kind: "numeric"; value: number } | { kind: "ordinal"; value: number; category: string };
/** Internal source identifiers and raw workout fields must not be serialized as
 * public API payloads. Date-only points have no invented observation timestamp.
 */
export type Observation = {
  sourceId: string; logicalDate: string; precision: "date"; value: ObservedValue;
  eligibility: "eligible";
  workout?: { sessionId: string; sessionStartedAt: string; groupOrder: number; exerciseOrder: number; setNumber: number; completedAt: string | null; actualWeight: number; actualReps: number };
};
export type SourceResult = {
  contractVersion: 1; registryKey: SupportedKey; registryVersion: 1; adapterVersion: 1;
  sourceDomain: "checkins" | "workouts"; target: TargetIdentity; grain: string; unit: string; aggregation: string;
  window: HistoricalWindow; observations: Observation[]; observationCount: number;
  queryCompleteness: "complete" | "truncated" | "failed";
  counts: { sourceRows: number; nullValues: number; excluded: number; censored: number; absentDays: number | null };
  exclusions: Record<string, number>; warnings: string[]; temporalLimitations: string[];
};
