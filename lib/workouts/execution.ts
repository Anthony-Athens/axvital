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

