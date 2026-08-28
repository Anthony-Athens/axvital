import type { SessionExercise, SessionSet } from "../workouts/types.ts";

/** WorkoutExecution planned summary and execution.actualSetSummary use lb.
 * No conversion, per-implement normalization, or historical unit inference.
 * Keep this v1 formula stable; change registry/formula version for future models.
 */
export const EPLEY_V1 = { key: "epley", version: 1, unit: "lb" } as const;
export type EpleySet = Pick<SessionSet, "user_id" | "workout_session_id" | "workout_session_exercise_id" | "status" | "set_type" | "actual_weight" | "actual_reps">;
export type EpleyExercise = Pick<SessionExercise, "id" | "user_id" | "workout_session_id" | "exercise_id" | "tracking_type">;
export type EpleyScope = { userId: string; exerciseId: string };

/** Pure numeric adapter, not an authenticated reader. Callers must fetch owned,
 * parent-consistent rows in a bounded window. Set status (not session status,
 * exercise is_completed, or completed_at alone) is authoritative completion.
 */
export function estimated1rmEpleyV1(set: EpleySet, exercise: EpleyExercise, scope: EpleyScope): number | null {
  if (!scope.userId || !scope.exerciseId || set.user_id !== scope.userId || exercise.user_id !== scope.userId
    || set.workout_session_exercise_id !== exercise.id || set.workout_session_id !== exercise.workout_session_id
    || exercise.exercise_id !== scope.exerciseId || exercise.tracking_type !== "weight_reps"
    || set.status !== "completed" || set.set_type !== "working") return null;
  const weight = set.actual_weight, reps = set.actual_reps;
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0
    || typeof reps !== "number" || !Number.isInteger(reps) || reps < 1 || reps > 10) return null;
  const estimate = weight * (1 + reps / 30.0);
  return Number.isFinite(estimate) ? estimate : null;
}

/** Maximum of already window-scoped sets; no eligible observations => unknown. */
export function maximumEstimated1rmEpleyV1(rows: readonly { set: EpleySet; exercise: EpleyExercise }[], scope: EpleyScope): number | null {
  let maximum: number | null = null;
  for (const { set, exercise } of rows) {
    const value = estimated1rmEpleyV1(set, exercise, scope);
    if (value !== null && (maximum === null || value > maximum)) maximum = value;
  }
  return maximum;
}

/** Future bounded source-reader output, not a readiness implementation. Retain
 * each eligible set (no early daily maximum) for counts, first/last dates,
 * latest/best and trend inputs. Use session_date as the workout calendar date;
 * nullable completed_at is timing context, never an invented timestamp.
 * Missing/ineligible rows never become zero-valued points. Reader must also
 * validate the session's ownership and apply window/cutoff/truncation rules.
 */
export type EpleyV1SourcePoint = {
  setId: string; sessionId: string; exerciseId: string; sessionDate: string;
  completedAt: string | null; value: number; unit: "lb"; formulaVersion: 1;
};
