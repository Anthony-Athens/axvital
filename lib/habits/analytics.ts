import type { PlannedActivityOccurrence } from "../planner/types";

type AnalyticsOccurrence = Pick<PlannedActivityOccurrence, "scheduled_date" | "status">;
export type Adherence = { scheduled: number; completed: number; skipped: number; missed: number; percentage: number };

export function calculateCompletionRate(rows: AnalyticsOccurrence[], today: string) { return calculateAdherence(rows, "0000-01-01", today).percentage; }
export function calculateAdherence(rows: AnalyticsOccurrence[], start: string, end: string): Adherence {
  const eligible = rows.filter((row) => row.scheduled_date >= start && row.scheduled_date <= end);
  const completed = eligible.filter((row) => row.status === "completed").length;
  const skipped = eligible.filter((row) => row.status === "skipped").length;
  const missed = eligible.filter((row) => row.status === "planned" && row.scheduled_date < end).length;
  return { scheduled: eligible.length, completed, skipped, missed, percentage: eligible.length ? Math.round((completed / eligible.length) * 100) : 0 };
}
export const calculateWeeklyAdherence = calculateAdherence;
export const calculateMonthlyAdherence = calculateAdherence;
