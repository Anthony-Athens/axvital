import test from "node:test";
import assert from "node:assert/strict";
import { estimated1rmEpleyV1, maximumEstimated1rmEpleyV1, EPLEY_V1, type EpleySet, type EpleyExercise } from "./estimated-1rm.ts";
import { measurement, WORKOUT_PERFORMANCE_PRIMARY_OUTCOME } from "./registry.ts";
import { validateOutcome } from "./validation.ts";

// Synthetic numeric boundary fixtures, not assertions about production records.
const scope = { userId: "owner-a", exerciseId: "selected-exercise" };
const exercise: EpleyExercise = { id: "session-exercise", user_id: scope.userId, workout_session_id: "session", exercise_id: scope.exerciseId, tracking_type: "weight_reps" };
const set: EpleySet = { user_id: scope.userId, workout_session_id: "session", workout_session_exercise_id: exercise.id, status: "completed", set_type: "working", actual_weight: 150, actual_reps: 6 };

test("completed working weight_reps set uses deterministic Epley v1 and preserves raw load", () => {
  assert.deepEqual(EPLEY_V1, { key: "epley", version: 1, unit: "lb" });
  assert.equal(estimated1rmEpleyV1(set, exercise, scope), 180);
  for (let i = 0; i < 5; i++) assert.equal(estimated1rmEpleyV1(set, exercise, scope), 180);
  assert.equal(estimated1rmEpleyV1({ ...set, actual_weight: 125 }, exercise, scope), 150); // No dumbbell doubling.
  assert.equal(estimated1rmEpleyV1({ ...set, actual_reps: 1 }, exercise, scope), 150 * (1 + 1 / 30));
  assert.equal(estimated1rmEpleyV1({ ...set, actual_reps: 10 }, exercise, scope), 200);
});

for (const [label, patch] of [
  ["11 reps", { actual_reps: 11 }], ["zero reps", { actual_reps: 0 }], ["fractional reps", { actual_reps: 1.5 }],
  ["zero load", { actual_weight: 0 }], ["negative load", { actual_weight: -1 }],
  ["missing load", { actual_weight: null }], ["missing reps", { actual_reps: null }],
  ["nonfinite load", { actual_weight: Infinity }], ["warmup", { set_type: "warmup" }],
  ["pending", { status: "pending" }], ["skipped", { status: "skipped" }],
  ["wrong owner", { user_id: "owner-b" }], ["wrong parent", { workout_session_exercise_id: "other" }],
  ["wrong session", { workout_session_id: "other" }],
] as [string, Partial<EpleySet>][]) test(`Epley excludes ${label}`, () => {
  assert.equal(estimated1rmEpleyV1({ ...set, ...patch }, exercise, scope), null);
});

test("Epley requires durable target identity and compatible exercise tracking/ownership", () => {
  for (const patch of [{ exercise_id: "different" }, { exercise_id: null }, { tracking_type: "bodyweight_reps" as const }, { user_id: "owner-b" }])
    assert.equal(estimated1rmEpleyV1(set, { ...exercise, ...patch }, scope), null);
});

test("window maximum uses eligible actual values only and empty remains unknown", () => {
  const rows = [set, { ...set, actual_weight: 200, actual_reps: 3 }, { ...set, actual_weight: 999, status: "pending" as const }].map(set => ({ set, exercise }));
  assert.equal(maximumEstimated1rmEpleyV1(rows, scope), 200 * (1 + 3 / 30));
  assert.equal(maximumEstimated1rmEpleyV1([], scope), null);
  assert.equal(maximumEstimated1rmEpleyV1([{ set: { ...set, actual_weight: null }, exercise }], scope), null);
  // Extra planned values cannot fill missing actual fields.
  const missing = { ...set, actual_weight: null, actual_reps: null, planned_weight: 405, planned_reps: 5 };
  assert.equal(estimated1rmEpleyV1(missing, exercise, scope), null);
});

test("Estimated 1RM is first-class and supports lb absolute/target and percent criteria", () => {
  const definition = measurement(WORKOUT_PERFORMANCE_PRIMARY_OUTCOME)!;
  assert.equal(definition.enabled, true);assert.equal(definition.label, "Estimated 1RM");
  assert.deepEqual(definition.formula, { key: "epley", version: 1, expression: "actual_weight * (1 + actual_reps / 30.0)" });
  const outcome = { registry_key: definition.key, registry_version: 1, exercise_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", source_config: {}, outcome_role: "primary", aggregation_method: "maximum", expected_direction: "increase" };
  for (const success_criterion of [
    { version: 1, kind: "change", basis: "absolute", direction: "increase", operator: "gte", amount: 20, unit: "lb" },
    { version: 1, kind: "change", basis: "percent", direction: "increase", operator: "gte", amount: 5, unit: "%" },
    { version: 1, kind: "target_value", operator: "gte", value: 405, unit: "lb" },
  ]) validateOutcome({ ...outcome, success_criterion });
  assert.throws(() => validateOutcome({ ...outcome, success_criterion: { version: 1, kind: "target_value", operator: "gte", value: 180, unit: "kg" } }));
  assert.throws(() => validateOutcome({ ...outcome, aggregation_method: "average" }));
  assert.equal(measurement("exercise_external_load_volume")?.enabled, false);
  assert.equal(measurement("exercise_best_single_load")?.enabled, false);
});
