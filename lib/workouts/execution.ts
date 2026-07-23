import type { ExerciseTrackingType } from "./exercise-metadata";
import type { SessionSet } from "./types";

export const WORKOUT_STATUS_HEADER_CLASS =
  "rounded-xl border border-slate-200 bg-white p-4";

export const WORKOUT_FINAL_ACTIONS_CLASS =
  "safe-bottom mt-6 rounded-xl border border-slate-200 bg-white p-4";

export function orderedSessionSets(sets: SessionSet[] = []) {
  return [...sets].sort((a, b) => a.set_number - b.set_number);
}

export function getCurrentSessionSet(sets: SessionSet[] = []) {
  return orderedSessionSets(sets).find((set) => set.status === "pending") ?? null;
}

export function getAddressedSessionSets(sets: SessionSet[] = []) {
  return orderedSessionSets(sets).filter((set) => set.status !== "pending");
}

export function getHiddenFutureSessionSets(sets: SessionSet[] = []) {
  const current = getCurrentSessionSet(sets);
  return orderedSessionSets(sets).filter(
    (set) => set.status === "pending" && set.id !== current?.id,
  );
}

export function getWorkoutReadiness(sets: SessionSet[]) {
  const completed = sets.filter((set) => set.status === "completed").length;
  const skipped = sets.filter((set) => set.status === "skipped").length;
  const remaining = sets.filter((set) => set.status === "pending").length;
  return { total: sets.length, completed, skipped, remaining };
}

export function actualSetSummary(set: SessionSet) {
  const parts: string[] = [];
  if (set.actual_weight !== null) parts.push(`${set.actual_weight} lb`);
  if (set.actual_reps !== null) parts.push(`${set.actual_reps} reps`);
  if (set.actual_duration_seconds !== null) {
    parts.push(`${set.actual_duration_seconds} sec`);
  }
  if (set.actual_distance !== null) {
    parts.push(`${set.actual_distance} ${set.distance_unit ?? "distance"}`);
  }
  return parts.join(" · ") || "No actual values recorded";
}

export type ActualSetInput = {
  reps: string;
  weight: string;
  duration: string;
  distance: string;
};

export type ActualSetValues = {
  actual_reps: number | null;
  actual_weight: number | null;
  actual_duration_seconds: number | null;
  actual_distance: number | null;
};

export function actualInputValue(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function parseActualNumber(
  value: string,
  label: string,
  required: boolean,
) {
  if (!value.trim()) {
    return required
      ? { value: null, error: `Enter the ${label.toLowerCase()} completed.` }
      : { value: null, error: null };
  }

  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? { value: parsed, error: null }
    : { value: null, error: `Enter a valid ${label.toLowerCase()}.` };
}

export function validateActualSetInput(
  trackingType: ExerciseTrackingType,
  input: ActualSetInput,
): { values: ActualSetValues; errors: Partial<Record<keyof ActualSetInput, string>> } {
  const required = {
    weight: trackingType === "weight_reps",
    reps: ["weight_reps", "bodyweight_reps", "repetitions"].includes(trackingType),
    duration: ["duration", "distance_duration", "calories_duration"].includes(
      trackingType,
    ),
    distance: trackingType === "distance_duration",
  };
  const parsed = {
    weight: parseActualNumber(input.weight, "weight", required.weight),
    reps: parseActualNumber(input.reps, "repetitions", required.reps),
    duration: parseActualNumber(input.duration, "duration", required.duration),
    distance: parseActualNumber(input.distance, "distance", required.distance),
  };
  const errors = Object.fromEntries(
    Object.entries(parsed)
      .filter(([, result]) => result.error)
      .map(([key, result]) => [key, result.error]),
  ) as Partial<Record<keyof ActualSetInput, string>>;

  return {
    values: {
      actual_reps: parsed.reps.value,
      actual_weight: parsed.weight.value,
      actual_duration_seconds: parsed.duration.value,
      actual_distance: parsed.distance.value,
    },
    errors,
  };
}
