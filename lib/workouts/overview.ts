// Pure summaries for the Workouts home: next workout, this week, weekly volume.
import { calculateWorkoutSessionMetrics } from "./analytics.ts";
import type { PlannedWorkout, WorkoutSession } from "./types";

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function mondayOf(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

/** The workout to put front and centre: one in progress, else the next planned one. */
export function nextWorkout(planned: PlannedWorkout[], today: string) {
  const inProgress = planned.find((w) => w.status === "in_progress");
  if (inProgress) return inProgress;
  return (
    planned
      .filter((w) => w.status === "planned" && w.scheduled_date >= today)
      .sort((a, b) =>
        `${a.scheduled_date}${a.scheduled_time ?? "99"}`.localeCompare(
          `${b.scheduled_date}${b.scheduled_time ?? "99"}`,
        ),
      )[0] ?? null
  );
}

/** Most recent completed session with the same name, for "last time" context. */
export function lastSession(name: string, sessions: WorkoutSession[]) {
  const match = sessions
    .filter((s) => s.status === "completed" && s.name === name)
    .sort((a, b) => b.session_date.localeCompare(a.session_date))[0];
  if (!match) return null;
  const metrics = calculateWorkoutSessionMetrics(match);
  return {
    date: match.session_date,
    minutes: metrics.durationSeconds ? Math.round(metrics.durationSeconds / 60) : null,
    volume: metrics.totalExternalLoadVolume,
  };
}

export type WeekDay = {
  date: string;
  items: {
    name: string;
    state: "done" | "planned" | "in_progress" | "missed";
    minutes: number | null;
  }[];
};

/** Monday–Sunday view merging completed sessions with planned workouts. */
export function workoutWeek(
  planned: PlannedWorkout[],
  sessions: WorkoutSession[],
  today: string,
): WeekDay[] {
  const monday = mondayOf(today);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const done = sessions
      .filter((s) => s.session_date === date && s.status !== "abandoned")
      .map((s) => {
        const metrics = calculateWorkoutSessionMetrics(s);
        return {
          name: s.name,
          state: s.status === "in_progress" ? ("in_progress" as const) : ("done" as const),
          minutes: metrics.durationSeconds ? Math.round(metrics.durationSeconds / 60) : null,
        };
      });
    const doneIds = new Set(
      sessions.filter((s) => s.session_date === date).map((s) => s.planned_workout_id),
    );
    const upcoming = planned
      .filter(
        (w) =>
          w.scheduled_date === date &&
          !doneIds.has(w.id) &&
          (w.status === "planned" || w.status === "in_progress"),
      )
      .map((w) => ({
        name: w.name,
        state: date < today ? ("missed" as const) : ("planned" as const),
        minutes: w.estimated_duration_minutes,
      }));
    return { date, items: [...done, ...upcoming] };
  });
}

/** Total completed load volume per Monday-start week, oldest first, ending this week. */
export function weeklyVolume(sessions: WorkoutSession[], today: string, weeks = 8) {
  const thisWeek = mondayOf(today);
  const starts = Array.from({ length: weeks }, (_, i) => addDays(thisWeek, (i - (weeks - 1)) * 7));
  const totals = starts.map(() => 0);
  for (const s of sessions) {
    if (s.status !== "completed") continue;
    const index = starts.indexOf(mondayOf(s.session_date));
    if (index >= 0) totals[index] += calculateWorkoutSessionMetrics(s).totalExternalLoadVolume;
  }
  return starts.map((start, i) => ({ start, volume: totals[i] }));
}

export function formatVolume(value: number) {
  return value >= 10000
    ? `${(value / 1000).toFixed(0)}k`
    : value >= 1000
      ? `${(value / 1000).toFixed(1)}k`
      : String(Math.round(value));
}
