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
  actualInputValue,
  validateActualSetInput,
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

test("untouched pending actual values initialize blank without planned fallback", () => {
  const pending = set("pending", 1, "pending");
  assert.equal(actualInputValue(pending.actual_weight), "");
  assert.equal(actualInputValue(pending.actual_reps), "");
  assert.equal(actualInputValue(pending.actual_duration_seconds), "");
  assert.equal(actualInputValue(pending.actual_distance), "");
  assert.equal(pending.planned_weight, 100);
  assert.equal(pending.planned_reps, 5);
});

test("persisted actual values, including zero, are preserved", () => {
  assert.equal(actualInputValue(125), "125");
  assert.equal(actualInputValue(0), "0");
  assert.equal(actualInputValue(null), "");
});

test("subsequent and added pending sets also initialize blank", () => {
  const subsequent = set("second", 2, "pending");
  const added = { ...set("added", 3, "pending"), planned_workout_set_id: null };
  for (const pending of [subsequent, added]) {
    assert.deepEqual(
      [
        actualInputValue(pending.actual_weight),
        actualInputValue(pending.actual_reps),
      ],
      ["", ""],
    );
  }
});

test("blank optional values persist as null and required fields are contextual", () => {
  const optional = validateActualSetInput("completion", {
    weight: "",
    reps: "",
    duration: "",
    distance: "",
  });
  assert.deepEqual(optional.errors, {});
  assert.deepEqual(Object.values(optional.values), [null, null, null, null]);

  const required = validateActualSetInput("weight_reps", {
    weight: "",
    reps: "",
    duration: "",
    distance: "",
  });
  assert.equal(required.errors.weight, "Enter the weight completed.");
  assert.equal(required.errors.reps, "Enter the repetitions completed.");
});
