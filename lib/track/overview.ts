// Pure summaries behind the Track hub tiles.
import { calculateCurrentStreak } from "../habits/streaks.ts";
import type { PlannedActivityOccurrence } from "../planner/types";

type Occ = Pick<
  PlannedActivityOccurrence,
  "id" | "scheduled_date" | "scheduled_time" | "status"
> & {
  planned_activity?: Pick<
    NonNullable<PlannedActivityOccurrence["planned_activity"]>,
    "id" | "title" | "activity_type"
  > | null;
};

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday-start week containing `today`, as 7 ISO dates. */
export function weekDates(today: string) {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = addDays(today, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export type DayMark = "done" | "planned" | "missed" | "none";

export function weekSummary(rows: Occ[], today: string) {
  const days = weekDates(today);
  const week = rows.filter((row) => row.scheduled_date >= days[0] && row.scheduled_date <= days[6]);
  const done = week.filter((row) => row.status === "completed").length;
  const skipped = week.filter((row) => row.status === "skipped").length;
  const workouts = week.filter((row) => row.planned_activity?.activity_type === "workout");
  const workoutDays: DayMark[] = days.map((date) => {
    const own = workouts.filter((row) => row.scheduled_date === date);
    if (!own.length) return "none";
    if (own.some((row) => row.status === "completed")) return "done";
    if (date < today || own.every((row) => row.status === "skipped")) return "missed";
    return "planned";
  });
  const next = workouts
    .filter((row) => row.status === "planned" && row.scheduled_date >= today)
    .sort((a, b) =>
      `${a.scheduled_date}${a.scheduled_time ?? ""}`.localeCompare(
        `${b.scheduled_date}${b.scheduled_time ?? ""}`,
      ),
    )[0];
  return {
    days,
    total: week.length,
    done,
    skipped,
    upcoming: week.length - done - skipped,
    workouts: {
      done: workouts.filter((row) => row.status === "completed").length,
      total: workouts.length,
      days: workoutDays,
      next: next
        ? {
            title: next.planned_activity?.title ?? "Workout",
            date: next.scheduled_date,
            time: next.scheduled_time,
          }
        : null,
    },
  };
}

/** Current streak per habit, longest first. */
export function habitStreaks(rows: Occ[], today: string, limit = 3) {
  const byHabit = new Map<string, { title: string; rows: Occ[] }>();
  for (const row of rows) {
    const activity = row.planned_activity;
    if (!activity || activity.activity_type !== "habit") continue;
    const entry = byHabit.get(activity.id) ?? { title: activity.title, rows: [] };
    entry.rows.push(row);
    byHabit.set(activity.id, entry);
  }
  return [...byHabit.values()]
    .map(({ title, rows: own }) => ({ title, streak: calculateCurrentStreak(own, today) }))
    .sort((a, b) => b.streak - a.streak || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** Highest severity per local day over the last `days` days (oldest first); null = nothing logged. */
export function severityStrip(
  events: { started_at: string; severity: number | null }[],
  today: string,
  days = 14,
) {
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i - (days - 1)));
  return dates.map((date) => {
    const own = events.filter((event) => localDate(event.started_at) === date);
    if (!own.length) return null;
    return Math.max(0, ...own.map((event) => event.severity ?? 0));
  });
}

export function localDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
