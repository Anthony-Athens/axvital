import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration=readFileSync(new URL("../../supabase/migrations/202608210001_add_safe_workout_template_management.sql",import.meta.url),"utf8");
const workoutSchema=readFileSync(new URL("../../supabase/migrations/202607210004_add_workout_planning_execution.sql",import.meta.url),"utf8");

test("template replacement is one PostgreSQL transaction RPC",()=>assert.match(migration,/function public\.replace_workout_template/));
test("atomic replacement validates authenticated ownership",()=>assert.match(migration,/where id=target_id and user_id=owner_id/));
test("safe deletion checks planned workout dependencies",()=>assert.match(migration,/exists\(select 1 from public\.planned_workouts where workout_template_id=target_id\)/));
test("safe deletion checks protocol dependencies",()=>assert.match(migration,/exists\(select 1 from public\.protocol_template_activities where workout_template_id=target_id\)/));
test("safe deletion checks experiment dependencies",()=>assert.match(migration,/exists\(select 1 from public\.experiment_interventions where linked_workout_template_id=target_id\)/));
test("planned exercises are immutable snapshots",()=>assert.match(workoutSchema,/Date-specific immutable snapshots/));
test("planned sets snapshot template targets",()=>assert.match(workoutSchema,/create table public\.planned_workout_sets/));
test("session sets preserve planned and actual values separately",()=>{assert.match(workoutSchema,/planned_weight numeric/);assert.match(workoutSchema,/actual_weight numeric/)});
test("template deletion does not cascade into planned workouts",()=>assert.match(workoutSchema,/workout_template_id uuid references public\.workout_templates\(id\) on delete set null/));
test("template exercise deletion never deletes exercise library rows",()=>assert.match(workoutSchema,/exercise_id uuid not null references public\.exercises\(id\)/));
