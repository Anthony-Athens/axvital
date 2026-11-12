import assert from "node:assert/strict";
import test from "node:test";
import { habitStreaks, severityStrip, weekDates, weekSummary } from "./overview.ts";
import type { ActivityType } from "../planner/types";

const occ = (
  id: string,
  date: string,
  status: "completed" | "skipped" | "planned",
  type: ActivityType,
  title = id,
  activityId = title,
  time: string | null = null,
) => ({
  id,
  scheduled_date: date,
  scheduled_time: time,
  status,
  planned_activity: { id: activityId, title, activity_type: type },
});

test("weeks start on Monday, including when today is Sunday", () => {
  assert.deepEqual(weekDates("2026-11-12"), [
    "2026-11-09",
    "2026-11-10",
    "2026-11-11",
    "2026-11-12",
    "2026-11-13",
    "2026-11-14",
    "2026-11-15",
  ]);
  assert.equal(weekDates("2026-11-15")[0], "2026-11-09");
});

test("week summary counts this week only and marks workout days", () => {
  const rows = [
    occ("a", "2026-11-09", "completed", "workout", "Lower A"),
    occ("b", "2026-11-10", "planned", "workout", "Missed"),
    occ("c", "2026-11-12", "planned", "workout", "Upper A", "Upper A", "18:00:00"),
    occ("d", "2026-11-14", "planned", "workout", "Lower B"),
    occ("e", "2026-11-11", "skipped", "habit", "Walk"),
    occ("f", "2026-11-02", "completed", "workout", "Last week"),
  ];
  const s = weekSummary(rows, "2026-11-12");
  assert.equal(s.total, 5);
  assert.equal(s.done, 1);
  assert.equal(s.skipped, 1);
  assert.equal(s.upcoming, 3);
  assert.deepEqual(s.workouts.days, [
    "done",
    "missed",
    "none",
    "planned",
    "none",
    "planned",
    "none",
  ]);
  assert.equal(s.workouts.done, 1);
  assert.equal(s.workouts.total, 4);
  assert.deepEqual(s.workouts.next, { title: "Upper A", date: "2026-11-12", time: "18:00:00" });
});

test("habit streaks group by habit and ignore non-habits", () => {
  const rows = [
    occ("1", "2026-11-10", "completed", "habit", "Walk"),
    occ("2", "2026-11-11", "completed", "habit", "Walk"),
    occ("3", "2026-11-12", "planned", "habit", "Walk"),
    occ("4", "2026-11-11", "skipped", "habit", "Stretch"),
    occ("5", "2026-11-12", "completed", "habit", "Stretch"),
    occ("6", "2026-11-12", "completed", "workout", "Upper"),
  ];
  assert.deepEqual(habitStreaks(rows, "2026-11-12"), [
    { title: "Walk", streak: 2 },
    { title: "Stretch", streak: 1 },
  ]);
});

test("severity strip keeps the worst rating per day and leaves quiet days empty", () => {
  const noon = (date: string) => new Date(`${date}T12:00:00`).toISOString();
  const strip = severityStrip(
    [
      { started_at: noon("2026-11-12"), severity: 3 },
      { started_at: noon("2026-11-12"), severity: 6 },
      { started_at: noon("2026-11-10"), severity: null },
    ],
    "2026-11-12",
    4,
  );
  assert.deepEqual(strip, [null, 0, null, 6]);
});
