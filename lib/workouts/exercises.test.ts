import assert from "node:assert/strict";
import test from "node:test";
import { EQUIPMENT_OPTIONS, EXERCISE_CATEGORIES, MOVEMENT_PATTERNS, TRACKING_TYPES, normalizeExerciseName } from "./exercise-metadata.ts";
import { exerciseMatchesSearch, normalizeCreateExerciseInput } from "./exercises.ts";
import type { Exercise } from "./types.ts";

const exercise: Exercise = { id: "1", user_id: null, name: "Romanian Deadlift", normalized_name: "romaniandeadlift", aliases: ["RDL"], description: null, category: "strength", movement_pattern: "hinge", primary_muscle_group: "hamstrings", secondary_muscle_groups: ["glutes"], equipment: "barbell", default_tracking_type: "weight_reps", is_archived: false, created_at: "", updated_at: "" };

test("exercise names normalize consistently for duplicate detection", () => { assert.equal(normalizeExerciseName("  Push-Up! "), "pushup"); assert.equal(normalizeExerciseName("Push up"), "pushup"); });
test("creation payload trims text, converts blanks to null, and parses normalized metadata", () => { const payload = normalizeCreateExerciseInput({ name: "  Split Squat ", description: " ", category: " Strength ", movement_pattern: "", primary_muscle_group: " Quadriceps ", secondary_muscle_groups: [" Glutes ", ""], equipment: " Dumbbell ", default_tracking_type: "Weight Reps" }); assert.deepEqual(payload, { name: "Split Squat", normalized_name: "splitsquat", aliases: [], description: null, category: "strength", movement_pattern: null, equipment: "dumbbell", primary_muscle_group: "quadriceps", secondary_muscle_groups: ["glutes"], default_tracking_type: "weight_reps" }); });
test("invalid constrained values are rejected before reaching Supabase", () => { assert.throws(() => normalizeCreateExerciseInput({ name: "Test", category: "Strength Training", default_tracking_type: "sets" }), /valid category/); });
test("search matches both canonical name and aliases", () => { assert.equal(exerciseMatchesSearch(exercise, "Romanian"), true); assert.equal(exerciseMatchesSearch(exercise, "rdl"), true); assert.equal(exerciseMatchesSearch(exercise, "bench"), false); });
test("centralized metadata values match database constraints", () => { assert.ok(EXERCISE_CATEGORIES.includes("plyometric")); assert.ok(MOVEMENT_PATTERNS.includes("olympic_lift")); assert.ok(EQUIPMENT_OPTIONS.includes("stability_ball")); assert.ok(TRACKING_TYPES.includes("weight_reps")); });
