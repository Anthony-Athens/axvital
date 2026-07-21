import type { OccurrenceStatus, PlannedActivity, PlannedActivityOccurrence, TrackingType } from "../planner/types";

export type HabitProgressInput = Pick<PlannedActivity, "tracking_type" | "target_value" | "minimum_value" | "allow_partial_completion">;
export type ProgressResult = { status: OccurrenceStatus; completionPercentage: number | null; minimumReached: boolean };

export function calculateHabitProgress(activity: HabitProgressInput, actualValue: number | null, explicitlyComplete = false): ProgressResult {
  if (activity.tracking_type === "binary") return { status: explicitlyComplete ? "completed" : "planned", completionPercentage: explicitlyComplete ? 100 : null, minimumReached: false };
  const target = activity.target_value;
  if (!target || actualValue === null || actualValue <= 0) return { status: explicitlyComplete ? "completed" : "planned", completionPercentage: actualValue === 0 ? 0 : null, minimumReached: false };
  const percentage = (actualValue / target) * 100;
  const minimumReached = activity.minimum_value !== null && actualValue >= activity.minimum_value && actualValue < target;
  const automatic = actualValue >= target || minimumReached;
  return { status: automatic || explicitlyComplete ? "completed" : "planned", completionPercentage: percentage, minimumReached };
}

export function derivedOccurrenceStatus(occurrence: Pick<PlannedActivityOccurrence, "status" | "scheduled_date" | "actual_value">, today: string) {
  if (occurrence.status === "planned" && occurrence.scheduled_date < today) return occurrence.actual_value && occurrence.actual_value > 0 ? "partial" : "missed";
  if (occurrence.status === "planned" && occurrence.actual_value && occurrence.actual_value > 0) return "partial";
  if (occurrence.scheduled_date > today) return "upcoming";
  return occurrence.status;
}

export function progressLabel(trackingType: TrackingType, value: number | null, unit: string | null) {
  if (trackingType === "binary") return "Yes / No";
  if (trackingType === "duration") { const minutes = value ?? 0; const hours = Math.floor(minutes / 60); return hours ? `${hours}h ${minutes % 60}m` : `${minutes} min`; }
  return `${value ?? 0} ${unit ?? "units"}`;
}

export function reopenProgressFields(firstCompletedAt: string | null, now: string) {
  return { status: "planned" as const, completed_at: null, skipped_at: null, completion_percentage: null, first_completed_at: firstCompletedAt, last_updated_at: now };
}
