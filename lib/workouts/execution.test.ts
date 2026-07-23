import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKOUT_FINAL_ACTIONS_CLASS,
  WORKOUT_STATUS_HEADER_CLASS,
  getAddressedSessionSets,
  getCurrentSessionSet,
  getHiddenFutureSessionSets,
  getWorkoutReadiness,
  orderedSessionSets,
} from "./execution.ts";
import type { SessionSet } from "./types.ts";

function set(
  id: string,
  set_number: number,
  status: SessionSet["status"],
): SessionSet {
  return {
    id,
    set_number,
    status,
    user_id: "user",
    workout_session_id: "session",
    workout_session_exercise_id: "exercise",
    planned_workout_set_id: "planned",
    set_type: "working",
    planned_reps: 5,
    planned_reps_min: null,
    planned_reps_max: null,
    planned_weight: 100,
    planned_duration_seconds: null,
    planned_distance: null,
    actual_reps: status === "completed" ? 5 : null,
    actual_weight: status === "completed" ? 100 : null,
    actual_duration_seconds: null,
    actual_distance: null,
    distance_unit: null,
    completed_at: status === "completed" ? "2026-07-23T10:00:00Z" : null,
    notes: null,
  };
}

test("the earliest persisted pending set is the only current set", () => {
  const sets = [
    set("future", 3, "pending"),
    set("done", 1, "completed"),
    set("current", 2, "pending"),
  ];
  assert.equal(getCurrentSessionSet(sets)?.id, "current");
  assert.deepEqual(getHiddenFutureSessionSets(sets).map(({ id }) => id), ["future"]);
});

test("completed and skipped sets become addressed compact rows", () => {
  const sets = [
    set("completed", 1, "completed"),
    set("skipped", 2, "skipped"),
    set("pending", 3, "pending"),
  ];
  assert.deepEqual(
    getAddressedSessionSets(sets).map(({ id }) => id),
    ["completed", "skipped"],
  );
  assert.deepEqual(getWorkoutReadiness(sets), {
    total: 3,
    completed: 1,
    skipped: 1,
    remaining: 1,
  });
});

test("added sets retain persisted ordering", () => {
  assert.deepEqual(
    orderedSessionSets([
      set("added", 4, "pending"),
      set("first", 1, "completed"),
      set("third", 3, "pending"),
    ]).map(({ id }) => id),
    ["first", "third", "added"],
  );
});

test("workout status and completion actions remain in normal flow", () => {
  assert.doesNotMatch(WORKOUT_STATUS_HEADER_CLASS, /\b(?:fixed|sticky)\b/);
  assert.doesNotMatch(WORKOUT_FINAL_ACTIONS_CLASS, /\b(?:fixed|sticky)\b/);
});
