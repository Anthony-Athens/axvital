import type { PlannedActivity, PlannedActivityOccurrence, RecurrenceType } from "./types";

export type RecurrenceRule = Pick<
  PlannedActivity,
  "start_date" | "end_date" | "recurrence_type" | "days_of_week" | "interval_days"
> & { recurrence_active_from?: string | null };

// All date-only calculations use YYYY-MM-DD components in UTC. Weekdays follow
// JavaScript's convention: 0=Sunday through 6=Saturday.
function utcDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function daysBetween(start: string, end: string) {
  return Math.round((utcDate(end).getTime() - utcDate(start).getTime()) / 86_400_000);
}

export function weekday(date: string) {
  return utcDate(date).getUTCDay();
}

export function addCalendarDays(date: string, amount: number) {
  const value = utcDate(date);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function datesInRange(start: string, end: string) {
  const dates: string[] = [];
  for (let date = start; date <= end; date = addCalendarDays(date, 1)) dates.push(date);
  return dates;
}

export function occursOnDate(rule: RecurrenceRule, date: string): boolean {
  if (date < rule.start_date || (rule.recurrence_active_from && date < rule.recurrence_active_from) || (rule.end_date && date > rule.end_date)) return false;
  const elapsed = daysBetween(rule.start_date, date);
  const day = weekday(date);
  const recurrence: Record<RecurrenceType, () => boolean> = {
    none: () => elapsed === 0,
    daily: () => true,
    weekdays: () => day >= 1 && day <= 5,
    specific_days: () => Boolean(rule.days_of_week?.includes(day)),
    weekly: () => day === weekday(rule.start_date),
    interval: () => Boolean(rule.interval_days && elapsed % rule.interval_days === 0),
  };
  return recurrence[rule.recurrence_type]();
}

export function buildOccurrenceRows(activities: PlannedActivity[], userId: string, start: string, end: string) {
  const unique = new Map<string, { user_id: string; planned_activity_id: string; scheduled_date: string; scheduled_time: string | null }>();
  activities.forEach((activity) => datesInRange(start, end).filter((date) => occursOnDate(activity, date)).forEach((date) => unique.set(`${activity.id}:${date}`, { user_id: userId, planned_activity_id: activity.id, scheduled_date: date, scheduled_time: activity.scheduled_time })));
  return [...unique.values()];
}

export function shouldDeleteOccurrenceForRecurrenceEdit(occurrence: Pick<PlannedActivityOccurrence, "status" | "scheduled_date">, futureFrom: string) {
  return occurrence.status === "planned" && occurrence.scheduled_date >= futureFrom;
}
