import assert from "node:assert/strict";
import test from "node:test";
import { formatVolume, lastSession, nextWorkout, weeklyVolume, workoutWeek } from "./overview.ts";
import type { PlannedWorkout, WorkoutSession } from "./types";

const planned = (
  id: string,
  date: string,
  status: PlannedWorkout["status"] = "planned",
  time: string | null = null,
): PlannedWorkout =>
  ({
    id,
    name: id,
    scheduled_date: date,
    scheduled_time: time,
    status,
    estimated_duration_minutes: 50,
  }) as PlannedWorkout;

const session = (
  id: string,
  date: string,
  status: WorkoutSession["status"],
  sets: [number, number][] = [],
  plannedId: string | null = null,
): WorkoutSession =>
  ({
    id,
    name: id.split("#")[0],
    session_date: date,
    status,
    planned_workout_id: plannedId,
    started_at: `${date}T18:00:00Z`,
    ended_at: `${date}T18:50:00Z`,
    duration_seconds: 3000,
    exercises: [
      {
        sets: sets.map(([weight, reps], i) => ({
          id: `${id}-${i}`,
          status: "completed",
          actual_weight: weight,
          actual_weight_unit: "lb",
          actual_reps: reps,
        })),
      },
    ],
  }) as unknown as WorkoutSession;

test("next workout prefers one in progress, then the earliest planned today or later", () => {
  const rows = [
    planned("Later", "2026-11-14"),
    planned("Evening", "2026-11-12", "planned", "18:00:00"),
    planned("Morning", "2026-11-12", "planned", "07:00:00"),
  ];
  assert.equal(nextWorkout(rows, "2026-11-12")?.id, "Morning");
  assert.equal(
    nextWorkout([...rows, planned("Now", "2026-11-11", "in_progress")], "2026-11-12")?.id,
    "Now",
  );
  assert.equal(nextWorkout([planned("Old", "2026-11-10")], "2026-11-12"), null);
});

test("last session finds the latest completed run of the same workout", () => {
  const sessions = [
    session("Upper#1", "2026-11-01", "completed", [[100, 10]]),
    session("Upper#2", "2026-11-07", "completed", [
      [100, 10],
      [100, 8],
    ]),
    session("Upper#3", "2026-11-09", "abandoned", [[100, 10]]),
  ];
  assert.deepEqual(lastSession("Upper", sessions), {
    date: "2026-11-07",
    minutes: 50,
    volume: 1800,
  });
  assert.equal(lastSession("Lower", sessions), null);
});

test("the week merges completed sessions with planned workouts and flags missed days", () => {
  const week = workoutWeek(
    [
      planned("Upper", "2026-11-12"),
      planned("Skipped", "2026-11-10"),
      planned("Done", "2026-11-11"),
    ],
    [
      session("Done", "2026-11-11", "completed", [], "Done"),
      session("Lower", "2026-11-09", "completed"),
    ],
    "2026-11-12",
  );
  assert.equal(week[0].date, "2026-11-09");
  assert.deepEqual(
    week[0].items.map((i) => i.state),
    ["done"],
  );
  assert.deepEqual(
    week[1].items.map((i) => i.state),
    ["missed"],
  );
  assert.deepEqual(
    week[2].items.map((i) => `${i.name}:${i.state}`),
    ["Done:done"],
  );
  assert.deepEqual(
    week[3].items.map((i) => i.state),
    ["planned"],
  );
});

test("weekly volume buckets completed sessions by Monday-start week", () => {
  const volume = weeklyVolume(
    [
      session("A", "2026-11-09", "completed", [[100, 10]]),
      session("B", "2026-11-08", "completed", [[50, 10]]),
      session("C", "2026-11-11", "abandoned", [[999, 10]]),
    ],
    "2026-11-12",
    3,
  );
  assert.deepEqual(volume, [
    { start: "2026-10-26", volume: 0 },
    { start: "2026-11-02", volume: 500 },
    { start: "2026-11-09", volume: 1000 },
  ]);
  assert.equal(formatVolume(9840), "9.8k");
  assert.equal(formatVolume(14600), "15k");
});
