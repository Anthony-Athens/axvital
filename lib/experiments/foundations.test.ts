import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { database } from "../security/test-database.ts";
import { outcomeRegistry } from "../measurements/registry.ts";
import { validateOutcome } from "../measurements/validation.ts";
import { validateRule } from "../rules/validation.ts";
import { validateV2Draft, generateQuestion } from "./v2.ts";
import { classificationState, coverageState } from "../nutrition/classifications.ts";
import { patternRules } from "../nutrition/pattern-templates.ts";
import { nutritionTargetProjection } from "../nutrition/target-rule-adapter.ts";
import type { PGlite } from "@electric-sql/pglite";

const A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const energy = { registry_key: "energy_score", registry_version: 1, outcome_role: "primary", aggregation_method: "average", expected_direction: "increase", source_config: {} };
const protein = { version: 1, domain: "nutrition", kind: "numeric", metric: "protein_grams", operator: "gte", value: 180, unit: "g", period: "day" };
async function as(db: PGlite, user = A, role = "authenticated") { await db.exec(`reset role;select set_config('request.jwt.claim.sub','${user}',false);set role ${role};`); }
async function row<T>(db: PGlite, sql: string, args: unknown[] = []): Promise<T> { return (await db.query<T>(sql, args)).rows[0]; }
async function rule(db: PGlite, owner = A, definition: unknown = protein) {
  return (await row<{ id: string }>(db, "insert into public.target_rules(user_id,name,definition,exercise_id) values($1,'Reviewed target',$2,($2::jsonb->>'exercise_id')::uuid) returning id", [owner, JSON.stringify(definition)])).id;
}
async function draft(db: PGlite, input: unknown, id: string | null = null, revision = 0) {
  return row<{ id: string; config_revision: number; model_version: number; question: string | null; status: string }>(db, "select * from public.save_experiment_v2($1,$2,$3)", [id, revision, JSON.stringify(input)]);
}
async function plan(db: PGlite, ruleId: string) {
  const dates = await row<{ today: string; end_date: string; baseline: string; previous: string }>(db, "select current_date::text today,(current_date+13)::text end_date,(current_date-14)::text baseline,(current_date-1)::text previous");
  return { name: "Synthetic experiment", analysis_timezone: "UTC", baseline_mode: "historical", baseline_start_date: dates.baseline, baseline_end_date: dates.previous, intervention_start_date: dates.today, intervention_end_date: dates.end_date, intervention: { intervention_type: "nutrition_target", rule_id: ruleId }, outcomes: [energy] };
}

test("typed rules reject expressions, invalid units/periods and preserve valid zero", () => {
  validateRule(protein);
  for (const extra of [{ operator: "javascript" }, { unit: "kcal" }, { period: "week" }, { value: -1 }, { value: NaN }, { sql: "select 1" }, { value: null }]) assert.throws(() => validateRule({ ...protein, ...extra }));
  validateRule({ ...protein, value: 0 });
  validateRule({ ...protein, metric: "alcohol_occurrences", operator: "eq", value: 0, unit: "count" });
  validateRule({ version: 1, domain: "nutrition", kind: "cutoff", metric: "food_time", operator: "not_after", local_time: "20:00", time_zone: "America/New_York", period: "day" });
  assert.throws(() => validateRule({ ...protein, kind: "exclusion" }));
});
test("registry gates unsupported sources and criteria", () => {
  validateOutcome(energy);
  assert.throws(() => validateOutcome({ ...energy, registry_key: "body_weight" }));
  assert.throws(() => validateOutcome({ ...energy, source_config: { table: "health_events" } }));
  assert.throws(() => validateOutcome({ ...energy, registry_key: "sleep_quality_score", aggregation_method: "median", success_criterion: { version: 1, kind: "change", basis: "percent", direction: "increase", operator: "gte", amount: 10, unit: "%" } }));
  assert.throws(() => validateOutcome({ ...energy, success_criterion: { version: 1, kind: "target_value", operator: "gte", value: 15, unit: "score_10" } }));
  validateOutcome({ ...energy, success_criterion: { version: 1, kind: "change", basis: "absolute", direction: "increase", operator: "gte", amount: 1, unit: "score_10" } });
  for (const key of ["body_fat", "waist", "sleep_duration", "steps", "added_sugar", "verified_dietary_adherence"]) assert.equal(outcomeRegistry.some(d => d.key === key && d.enabled), false);
});
test("drafts do not fabricate outcomes, and templates/evidence preserve unknown semantics", () => {
  validateV2Draft({ name: "Incomplete draft" });
  assert.equal(generateQuestion(null, "Energy"), null);
  assert.equal(generateQuestion("Sleep protocol", "Energy"), "Does Sleep protocol appear associated with a change in energy?");
  assert.throws(() => validateV2Draft({ name: "Draft", outcomes: [energy, energy] }));
  assert.equal(classificationState([], "dairy"), "unknown");
  assert.equal(coverageState(null), "unknown");
  assert.throws(() => patternRules("ketogenic", {}));
  const rules = patternRules("ketogenic", { carbohydrateCeiling: 50 });
  assert.deepEqual(nutritionTargetProjection(rules[0]), { target_type: "carbohydrates", target_value: 50, unit: "g" });
  assert.throws(() => patternRules("carnivore", {}));
  assert.equal(patternRules("dairy_free", { exclusions: ["dairy"] }).length, 1);
});

test("v2 SQL whitelist matches registry; preflight emits metadata/counts; v1 remains intact", async t => {
  const db = await database(); t.after(() => db.close());
  const inventory = (await db.exec(readFileSync(new URL("../../supabase/tests/sprint13a2_preflight.sql", import.meta.url), "utf8"))).flatMap(result => result.rows) as { status?: string; table_name?: string; supporting_index?: string }[];
  assert.equal(inventory.some(r => r.status?.startsWith("MISSING")), false);
  for (const name of ["experiments", "user_symptoms", "nutrition_patterns", "target_rules"])
    assert.ok(inventory.some(r => r.table_name === name && r.status === "PRESENT" && r.supporting_index));
  for (const definition of outcomeRegistry) assert.deepEqual((await row<{ d: unknown }>(db, "select public.axvital_outcome_definition($1,1) d", [definition.key])).d, definition);
  await as(db);
  const old = await row<{ id: string; model_version: number }>(db, "insert into public.experiments(user_id,name,hypothesis) values($1,'Legacy','Original hypothesis preserved') returning *", [A]);
  assert.equal(old.model_version, 1);
  await db.query("insert into public.experiment_interventions(experiment_id,intervention_type,name,is_primary) values($1,'custom','Legacy primary',true),($1,'custom','Legacy secondary',false)", [old.id]);
  const empty = await draft(db, { name: "Incomplete draft" });
  assert.equal(empty.model_version, 2); assert.equal(empty.question, null);
  assert.equal((await row<{ n: number }>(db, "select count(*)::int n from public.experiment_outcomes where experiment_id=$1", [empty.id])).n, 0);
  await assert.rejects(db.query("select public.start_experiment_v2($1,1)", [empty.id]), /CONFIGURATION_INCOMPLETE/);
  await assert.rejects(db.query("update public.experiments set model_version=2 where id=$1", [old.id]), /MODEL_VERSION_IMMUTABLE/);
  assert.equal((await row<{ n: number }>(db, "select count(*)::int n from public.experiment_interventions where experiment_id=$1", [old.id])).n, 2);
  await db.query("update public.experiments set status='active',current_phase='intervention' where id=$1", [old.id]);
  assert.equal((await row<{ status: string }>(db, "select * from public.transition_experiment($1,'pause')", [old.id])).status, "paused");
});

test("preflight runs against pre-13A schema without mutation", async t => {
  const db = await database(false, undefined, "202608270005_billing_customer_coordination.sql");t.after(() => db.close());
  const before = await db.query("select count(*) from pg_class where relnamespace='public'::regnamespace");
  const preflight = readFileSync(new URL("../../supabase/tests/sprint13a2_preflight.sql", import.meta.url), "utf8");
  const inventory = (await db.exec(preflight)).flatMap(result => result.rows) as { status?: string; migration_history_status?: string }[];
  assert.equal(inventory.filter(r => r.status === "NOT_CREATED_YET").length, 2);
  assert.ok(inventory.some(r => r.migration_history_status === "REQUIRED_SEPARATE_VERIFICATION"));
  assert.deepEqual(await db.query("select count(*) from pg_class where relnamespace='public'::regnamespace"), before);
  await db.exec("alter table public.nutrition_targets rename constraint nutrition_targets_target_value_check to unexpected_deployed_name");
  const drift = (await db.exec(preflight)).flatMap(result => result.rows) as { status?: string; constraint_name?: string }[];
  assert.ok(drift.some(r => r.status === "MISSING_OR_NAME_MISMATCH" && r.constraint_name === "nutrition_targets_target_value_check"));
});

test("started v2 configuration is frozen but a controlled lifecycle transaction can pause and append history", async t => {
  const db = await database();t.after(() => db.close());await as(db);
  const r = await rule(db);const input = await plan(db, r);const e = await draft(db, input);
  await db.query("select public.start_experiment_v2($1,1)", [e.id]);
  await assert.rejects(db.query("update public.experiments set status='paused' where id=$1", [e.id]), /USE_V2_TRANSACTION/);
  await db.exec("reset role");
  // Test-only example of a narrowly approved, migration-owned lifecycle RPC.
  // No production lifecycle API or caller-controlled bypass is installed.
  await db.exec(`create function public.test_pause_v2(target uuid) returns void language plpgsql security definer set search_path='' as $$
    declare e public.experiments;
    begin
      select * into e from public.experiments where id=target and user_id=auth.uid() for update;
      if e.id is null or e.model_version<>2 or e.status<>'active' then raise exception 'INVALID_LIFECYCLE';end if;
      update public.experiments set status='paused',current_phase=e.current_phase,paused_at=now(),updated_at=now() where id=e.id;
      insert into public.experiment_phase_events(experiment_id,user_id,event_type,from_status,to_status,from_phase,to_phase)
      values(e.id,e.user_id,'paused',e.status,'paused',e.current_phase,e.current_phase);
    end $$;
    revoke all on function public.test_pause_v2(uuid) from public,anon;
    grant execute on function public.test_pause_v2(uuid) to authenticated;`);
  for (const assignment of ["question='Changed question'", "intervention_start_date=intervention_start_date+1", "intervention_end_date=intervention_end_date+1", "config_revision=config_revision+1", "analysis_timezone='America/New_York'", "baseline_mode='none'", "name='Changed name'", "notes='Changed notes'", "result_summary='Invented result'", "actual_started_at=actual_started_at+interval '1 hour'"])
    await assert.rejects(db.query(`update public.experiments set ${assignment} where id=$1`, [e.id]), /STARTED_CONFIGURATION_IMMUTABLE/);
  for (const table of ["experiment_interventions", "experiment_outcomes"])
    for (const sql of [`update public.${table} set name='Changed' where experiment_id=$1`, `delete from public.${table} where experiment_id=$1`])
      await assert.rejects(db.query(sql, [e.id]), /STARTED_CONFIGURATION_IMMUTABLE/);
  await assert.rejects(db.query("update public.experiment_start_snapshots set configuration='{}' where experiment_id=$1", [e.id]), /SNAPSHOT_IMMUTABLE/);
  await as(db, B);await assert.rejects(db.query("select public.test_pause_v2($1)", [e.id]), /INVALID_LIFECYCLE/);
  await as(db);await db.query("select public.test_pause_v2($1)", [e.id]);
  assert.deepEqual(await row(db, "select status,current_phase,paused_at is not null as paused from public.experiments where id=$1", [e.id]), { status: "paused", current_phase: "intervention", paused: true });
  assert.deepEqual(await row(db, "select from_status,to_status,from_phase,to_phase from public.experiment_phase_events where experiment_id=$1 and event_type='paused'", [e.id]), { from_status: "active", to_status: "paused", from_phase: "intervention", to_phase: "intervention" });
  await db.exec("reset role");
  await db.query("update public.experiments set status='active',current_phase='analysis',paused_at=null where id=$1", [e.id]);
  await assert.rejects(db.query("delete from public.experiment_phase_events where experiment_id=$1", [e.id]), /V2_EVENT_APPEND_ONLY/);
  // Same source yields the same marker, regardless of experiment-level edits.
  const fingerprint = await row<{ source_fingerprint: string }>(db, "select source_fingerprint from public.experiment_start_snapshots where experiment_id=$1", [e.id]);
  const hash = async () => (await row<{ hash: string }>(db, "select md5(public.axvital_intervention_configuration($1,$2)::text) hash", [JSON.stringify(input.intervention), A])).hash;
  assert.equal(await hash(), fingerprint.source_fingerprint);assert.equal(await hash(), fingerprint.source_fingerprint);
  await db.query("update public.target_rules set definition=$2 where id=$1", [r, JSON.stringify({ ...protein, value: 200 })]);
  assert.notEqual(await hash(), fingerprint.source_fingerprint);
  await as(db);await db.query("delete from public.experiments where id=$1", [e.id]);
  assert.equal((await row<{ n: number }>(db, "select count(*)::int n from public.experiment_start_snapshots where experiment_id=$1", [e.id])).n, 0);
});

test("SQL rule validation, canonical projection, private pattern membership and ownership", async t => {
  const db = await database();t.after(() => db.close());await as(db);
  for (const patch of [{ unit: "mg" }, { value: -1 }, { period: "month" }, { operator: null }, { expression: "x >= 3" }]) await assert.rejects(rule(db, A, { ...protein, ...patch }), /check constraint/);
  const id = await rule(db, A, { ...protein, value: 0 });
  await db.query("insert into public.nutrition_targets(user_id,target_type,target_value,unit,rule_id) values($1,'protein',0,'g',$2)", [A, id]);
  await assert.rejects(db.query("update public.nutrition_targets set target_value=20 where rule_id=$1", [id]), /EDIT_CANONICAL_RULE/);
  await db.query("update public.target_rules set definition=$2 where id=$1", [id, JSON.stringify(protein)]);
  assert.equal(Number((await row<{ target_value: string }>(db, "select target_value from public.nutrition_targets where rule_id=$1", [id])).target_value), 180);
  await assert.rejects(db.query("update public.nutrition_targets set rule_id=null where rule_id=$1", [id]), /CANONICAL_RULE_LINK_IMMUTABLE/);
  const p = await row<{ id: string }>(db, "select * from public.create_nutrition_pattern($1)", [JSON.stringify({ name: "My pattern", template_key: "low_carb", template_version: 1, rules: [{ name: "Carbs", definition: { ...protein, metric: "carbohydrate_grams", operator: "lte", value: 50 } }] })]);
  const before = await row<{ n: number }>(db, "select count(*)::int n from public.target_rules");
  await assert.rejects(db.query("select public.create_nutrition_pattern($1)", [JSON.stringify({ name: "Rejected pattern", rules: [{ name: "Invalid", definition: { ...protein, unit: "oz" } }] })]), /INVALID_PATTERN_RULE/);
  assert.deepEqual(await row(db, "select count(*)::int n from public.target_rules"), before);
  await as(db, B); const bRule = await rule(db, B);
  assert.equal((await db.query("select * from public.nutrition_patterns where id=$1", [p.id])).rows.length, 0);
  await as(db);
  await assert.rejects(db.query("insert into public.nutrition_pattern_rules(user_id,nutrition_pattern_id,rule_id,display_order) values($1,$2,$3,1)", [A, p.id, bRule]), /PATTERN_REQUIRES_OWNED_NUTRITION_RULE/);
  await assert.rejects(db.query("insert into public.nutrition_targets(user_id,target_type,target_value,unit,rule_id) values($1,'protein',180,'g',$2)", [A, bRule]), /INVALID_NUTRITION_RULE|row-level security/);
  await as(db, "", "anon");await assert.rejects(db.exec("select * from public.target_rules"), /permission denied/);
});

test("atomic start freezes selective configuration, fixes future events, rejects stale/direct writes and retries safely", async t => {
  const db = await database();t.after(() => db.close());await as(db);
  const r = await rule(db); const input = await plan(db, r); const e = await draft(db, input);
  await assert.rejects(draft(db, input, e.id, 0), /REVISION_CONFLICT/);
  await assert.rejects(draft(db, { ...input, outcomes: [energy, energy] }), /INVALID_OUTCOMES/);
  const started = await row<{ status: string }>(db, "select * from public.start_experiment_v2($1,1)", [e.id]);assert.equal(started.status, "active");
  const snap = await row<{ configuration: Record<string, unknown>; source_fingerprint: string }>(db, "select * from public.experiment_start_snapshots where experiment_id=$1", [e.id]);
  assert.ok(snap.configuration.question);assert.equal(snap.configuration.baseline_mode, "historical");
  assert.equal(JSON.stringify(snap).includes("food_logs"), false);
  await db.query("select public.start_experiment_v2($1,1)", [e.id]);
  assert.equal((await row<{ n: number }>(db, "select count(*)::int n from public.experiment_start_snapshots where experiment_id=$1", [e.id])).n, 1);
  assert.deepEqual(await row(db, "select from_status,to_status,from_phase,to_phase from public.experiment_phase_events where experiment_id=$1 and event_type='intervention_started'", [e.id]), { from_status: "draft", to_status: "active", from_phase: "planning", to_phase: "intervention" });
  for (const sql of ["update public.experiments set name='Rewritten' where id=$1", "update public.experiments set model_version=1 where id=$1", "delete from public.experiment_outcomes where experiment_id=$1", "update public.experiment_interventions set name='Rewritten' where experiment_id=$1"]) await assert.rejects(db.query(sql, [e.id]), /USE_V2_TRANSACTION|MODEL_VERSION_IMMUTABLE/);
  await assert.rejects(db.query("delete from public.experiment_start_snapshots where experiment_id=$1", [e.id]), /permission denied/);
  await assert.rejects(db.query("select public.transition_experiment($1,'pause')", [e.id]), /USE_V2_TRANSACTION/);
  await db.query("update public.target_rules set definition=$2 where id=$1", [r, JSON.stringify({ ...protein, value: 200 })]);
  assert.deepEqual((await row<{ configuration: unknown }>(db, "select configuration from public.experiment_start_snapshots where experiment_id=$1", [e.id])).configuration, snap.configuration);
  await as(db, B);assert.equal((await db.query("select * from public.experiment_start_snapshots where experiment_id=$1", [e.id])).rows.length, 0);
  await assert.rejects(db.query("select public.start_experiment_v2($1,1)", [e.id]), /EXPERIMENT_NOT_FOUND/);
  await db.exec("reset role");await assert.rejects(db.query("update public.experiment_start_snapshots set configuration='{}' where experiment_id=$1", [e.id]), /SNAPSHOT_IMMUTABLE/);
});

test("both queued start/edit orderings and simultaneous starts preserve one reviewed revision", async t => {
  // PGlite serializes requests; these cover both interleavings, not a multi-connection PostgreSQL stress test.
  const db = await database();t.after(() => db.close());await as(db);const r = await rule(db);const input = await plan(db, r);
  const first = await draft(db, input);
  const a = await Promise.allSettled([db.query("select public.start_experiment_v2($1,1)", [first.id]), draft(db, { ...input, name: "Late edit" }, first.id, 1)]);
  assert.equal(a[0].status, "fulfilled");assert.equal(a[1].status, "rejected");
  const second = await draft(db, input);
  const b = await Promise.allSettled([draft(db, { ...input, name: "Reviewed edit" }, second.id, 1), db.query("select public.start_experiment_v2($1,1)", [second.id])]);
  assert.equal(b[0].status, "fulfilled");assert.equal(b[1].status, "rejected");
  const c = await Promise.allSettled([db.query("select public.start_experiment_v2($1,2)", [second.id]), db.query("select public.start_experiment_v2($1,2)", [second.id])]);
  assert.ok(c.every(result => result.status === "fulfilled"));
  assert.equal((await row<{ n: number }>(db, "select count(*)::int n from public.experiment_start_snapshots where experiment_id=$1", [second.id])).n, 1);
});

test("v2 target/criterion/date validation rejects forged and unsupported configuration", async t => {
  const db = await database();t.after(() => db.close());await as(db, B);
  const bActivity = await row<{ id: string }>(db, "insert into public.planned_activities(user_id,title,activity_type,recurrence_type,start_date) values($1,'Private habit','habit','none',current_date) returning id", [B]);
  const bProtocol = await row<{ id: string }>(db, "insert into public.user_protocols(user_id,name,start_date) values($1,'Private protocol',current_date) returning id", [B]);
  const bCondition = await row<{ id: string }>(db, "insert into public.user_conditions(user_id,custom_condition_name) values($1,'Private condition') returning id", [B]);
  const bSymptom = await row<{ id: string }>(db, "insert into public.user_symptoms(user_id,custom_symptom_name) values($1,'Private symptom') returning id", [B]);
  const bExercise = await row<{ id: string }>(db, "insert into public.exercises(user_id,name,category) values($1,'Private exercise','strength') returning id", [B]);
  await as(db);const r = await rule(db);const input = await plan(db, r);
  for (const intervention of [{ intervention_type: "habit", linked_planned_activity_id: bActivity.id }, { intervention_type: "protocol", linked_user_protocol_id: bProtocol.id }]) await assert.rejects(draft(db, { ...input, intervention }), /INVALID_INTERVENTION/);
  for (const outcome of [
    { ...energy, registry_key: "condition_episode_frequency", aggregation_method: "count", user_condition_id: bCondition.id },
    { ...energy, registry_key: "symptom_event_frequency", aggregation_method: "count", user_symptom_id: bSymptom.id },
    { ...energy, registry_key: "exercise_session_frequency", aggregation_method: "count", exercise_id: bExercise.id },
  ]) await assert.rejects(draft(db, { ...input, outcomes: [outcome] }), /INVALID_TARGET/);
  const shared = await row<{ id: string }>(db, "select id from public.exercises where user_id is null limit 1");
  const valid = { ...energy, registry_key: "exercise_session_frequency", aggregation_method: "count", exercise_id: shared.id };
  await draft(db, { ...input, outcomes: [valid] });
  const privateExercise = await row<{ id: string }>(db, "insert into public.exercises(user_id,name,category) values($1,'My private exercise','strength') returning id", [A]);
  await draft(db, { ...input, outcomes: [{ ...valid, exercise_id: privateExercise.id }] });
  for (const success_criterion of [
    { version: 1, kind: "change", basis: "absolute", direction: "increase", operator: "gte", amount: 20, unit: "lb" },
    { version: 1, kind: "change", basis: "percent", direction: "increase", operator: "gte", amount: 5, unit: "%" },
    { version: 1, kind: "target_value", operator: "gte", value: 405, unit: "lb" },
  ]) {
    const strength = await draft(db, { ...input, outcomes: [{ ...valid, registry_key: "exercise_estimated_1rm", aggregation_method: "maximum", success_criterion }] });
    await db.query("select public.start_experiment_v2($1,1)", [strength.id]);
    const frozen = await row<{ configuration: unknown }>(db, "select configuration from public.experiment_start_snapshots where experiment_id=$1", [strength.id]);
    assert.match(JSON.stringify(frozen.configuration), /actual_weight \* \(1 \+ actual_reps \/ 30\.0\)/);
  }
  const ownCondition = await row<{ id: string }>(db, "insert into public.user_conditions(user_id,custom_condition_name) values($1,'Selected condition') returning id", [A]);
  const conditionDraft = await draft(db, { ...input, outcomes: [{ ...energy, registry_key: "condition_episode_frequency", aggregation_method: "count", user_condition_id: ownCondition.id, success_criterion: { version: 1, kind: "change", basis: "percent", direction: "decrease", operator: "gte", amount: 25, unit: "%" } }] });
  assert.match(conditionDraft.question ?? "", /Selected condition/);
  await db.query("select public.start_experiment_v2($1,1)", [conditionDraft.id]);
  for (const patch of [{ registry_key: "exercise_estimated_1rm" }, { registry_key: "body_weight" }, { registry_key: "steps" }, { source_config: { sql: "select 1" } }, { expected_direction: null }, { success_criterion: { version: 1, kind: "change", basis: "percent", direction: "increase", operator: "gte", amount: 20, unit: "%" } }]) await assert.rejects(draft(db, { ...input, outcomes: [{ ...energy, ...patch }] }), /INVALID_OUTCOME|INVALID_CRITERION/);
  const badDates = await draft(db, { ...input, baseline_start_date: null, baseline_end_date: null });
  await assert.rejects(db.query("select public.start_experiment_v2($1,1)", [badDates.id]), /INVALID_DATES/);
  await assert.rejects(draft(db, { ...input, analysis_timezone: "Not/AZone" }), /INVALID_TIME_ZONE/);
});

test("food evidence stays unknown and coverage invalidates on every entry/item change including day moves", async t => {
  const db = await database();t.after(() => db.close());await as(db);
  const food = await row<{ id: string }>(db, "insert into public.user_foods(user_id,name,serving_name,serving_quantity,serving_unit,calories) values($1,'Unclassified custom food','Portion',1,'portion',100) returning id", [A]);
  const entry = await row<{ id: string }>(db, "insert into public.nutrition_entries(user_id,consumed_at) values($1,current_date+time '12:00') returning id", [A]);
  const item = await row<{ id: string; classification_snapshot: { missing_state: string; evidence: unknown[] } }>(db, "insert into public.nutrition_entry_items(nutrition_entry_id,user_food_id,source_name,serving_name_snapshot,serving_quantity_snapshot,serving_unit_snapshot,classification_snapshot) values($1,$2,'Snapshot name','Portion',1,'portion','{\"fake\":true}') returning *", [entry.id, food.id]);
  assert.equal(item.classification_snapshot.missing_state, "unknown");assert.deepEqual(item.classification_snapshot.evidence, []);
  const coverage = () => db.query("insert into public.nutrition_log_days(user_id,local_date,time_zone,coverage_status) values($1,current_date,'UTC','complete') on conflict(user_id,local_date,time_zone) do update set coverage_status='complete'", [A]);
  const state = async () => (await row<{ coverage_status: string }>(db, "select coverage_status from public.nutrition_log_days where user_id=$1 and local_date=current_date", [A])).coverage_status;
  await coverage();assert.equal(await state(), "complete");
  await db.query("update public.nutrition_entry_items set calories=110 where id=$1", [item.id]);assert.equal(await state(), "unknown");
  await coverage();await db.query("update public.nutrition_entries set consumed_at=consumed_at-interval '1 day' where id=$1", [entry.id]);assert.equal(await state(), "unknown");
  await db.query("insert into public.nutrition_log_days(user_id,local_date,time_zone,coverage_status) values($1,current_date-1,'UTC','complete')", [A]);
  await db.query("update public.nutrition_entries set consumed_at=consumed_at+interval '1 day' where id=$1", [entry.id]);
  assert.equal((await row<{ coverage_status: string }>(db, "select coverage_status from public.nutrition_log_days where local_date=current_date-1")).coverage_status, "unknown");
  await coverage();await db.query("delete from public.nutrition_entry_items where id=$1", [item.id]);assert.equal(await state(), "unknown");
  await coverage();await db.query("update public.nutrition_entries set deleted_at=now() where id=$1", [entry.id]);assert.equal(await state(), "unknown");
  await coverage();await db.query("delete from public.nutrition_entries where id=$1", [entry.id]);assert.equal(await state(), "unknown");
});

test("export and atomic account deletion include every new private table and preserve shared/other-owner data", async t => {
  const db = await database();t.after(() => db.close());await as(db);
  const r = await rule(db);const e = await draft(db, await plan(db, r));await db.query("select public.start_experiment_v2($1,1)", [e.id]);
  await db.query("select public.create_nutrition_pattern($1)", [JSON.stringify({ name: "Private pattern", rules: [{ name: "Protein", definition: protein }] })]);
  await db.query("insert into public.nutrition_targets(user_id,target_type,target_value,unit,rule_id) values($1,'protein',180,'g',$2)", [A, r]);
  const food = await row<{ id: string }>(db, "select id from public.foods limit 1");
  await db.query("insert into public.user_food_classification_assertions(user_id,food_id,classification_key,state,provenance,definition_version) values($1,$2,'dairy','unknown','User review',1)", [A, food.id]);
  await db.query("insert into public.nutrition_log_days(user_id,local_date,time_zone) values($1,current_date,'UTC')", [A]);
  const exported = await row<{ payload: { export_version: string; data: Record<string, unknown[]> } }>(db, "select public.axvital_export_account() payload");
  assert.equal(exported.payload.export_version, "axvital.account.v2");
  const tables = ["target_rules", "nutrition_patterns", "nutrition_pattern_rules", "user_food_classification_assertions", "nutrition_log_days", "experiment_start_snapshots"];
  for (const table of tables) assert.ok(exported.payload.data[table].length > 0, table);
  assert.equal(exported.payload.data.food_classification_assertions, undefined);
  await as(db, B);const bRule = await rule(db, B);
  await db.exec("reset role");
  await db.query("insert into public.food_classification_assertions(food_id,classification_key,state,provenance,definition_version) values($1,'dairy','unknown','Curated review',1)", [food.id]);
  await db.query("select public.axvital_begin_account_deletion($1)", [A]);await db.query("update public.account_deletions set billing_closed=true where user_id=$1", [A]);
  await db.query("delete from auth.users where id=$1", [A]);
  for (const table of tables) assert.equal((await db.query(`select * from public.${table} where user_id=$1`, [A])).rows.length, 0, table);
  assert.equal((await db.query("select * from public.target_rules where id=$1", [bRule])).rows.length, 1);
  assert.equal((await db.query("select * from public.food_classification_assertions where food_id=$1", [food.id])).rows.length, 1);
});

test("new private evidence corruption fails account cleanup closed and new-table schema drift blocks deletion", async t => {
  const db = await database();t.after(() => db.close());await as(db);
  const food = await row<{ id: string }>(db, "insert into public.user_foods(user_id,name,serving_name,serving_quantity,serving_unit,calories) values($1,'Owned food','Portion',1,'portion',100) returning id", [A]);
  await as(db, B);
  await assert.rejects(db.query("insert into public.user_food_classification_assertions(user_id,user_food_id,classification_key,state,provenance,definition_version) values($1,$2,'dairy','unknown','User review',1)", [B, food.id]), /row-level security/);
  await db.exec("reset role");
  // Simulate privileged historical corruption; ordinary API-role writes above cannot create it.
  await db.query("insert into public.user_food_classification_assertions(user_id,user_food_id,classification_key,state,provenance,definition_version) values($1,$2,'dairy','unknown','Synthetic corruption',1)", [B, food.id]);
  await db.query("select public.axvital_begin_account_deletion($1)", [A]);await db.query("update public.account_deletions set billing_closed=true where user_id=$1", [A]);
  await assert.rejects(db.query("delete from auth.users where id=$1", [A]), /ACCOUNT_RELATIONSHIP_REVIEW_REQUIRED/);
  assert.equal((await db.query("select * from auth.users where id=$1", [A])).rows.length, 1);
  await db.exec("alter table public.nutrition_log_days disable row level security");
  await assert.rejects(db.query("select public.axvital_begin_account_deletion($1)", [A]), /ACCOUNT_SCHEMA_REVIEW_REQUIRED/);
});

test("owned protocol, habit, pattern and durable symptom configure without mutating their source", async t => {
  const db = await database();t.after(() => db.close());await as(db);const r = await rule(db);const input = await plan(db, r);
  const habit = await row<{ id: string }>(db, "insert into public.planned_activities(user_id,title,activity_type,recurrence_type,start_date) values($1,'Existing habit','habit','daily',current_date) returning id", [A]);
  const protocol = await row<{ id: string }>(db, "insert into public.user_protocols(user_id,name,start_date) values($1,'Existing protocol',current_date) returning id", [A]);
  await db.query("insert into public.user_protocol_activities(user_id,user_protocol_id,planned_activity_id,is_required) values($1,$2,$3,true)", [A, protocol.id, habit.id]);
  const p = await row<{ id: string }>(db, "select * from public.create_nutrition_pattern($1)", [JSON.stringify({ name: "Dairy review", template_key: "dairy_free", template_version: 1, rules: [{ name: "Exclude dairy", definition: { version: 1, domain: "nutrition", kind: "exclusion", metric: "food_classification", operator: "excludes", classification: "dairy", period: "day" } }] })]);
  for (const intervention of [{ intervention_type: "habit", linked_planned_activity_id: habit.id }, { intervention_type: "protocol", linked_user_protocol_id: protocol.id }, { intervention_type: "nutrition_pattern", nutrition_pattern_id: p.id }]) {
    const e = await draft(db, { ...input, intervention });await db.query("select public.start_experiment_v2($1,1)", [e.id]);
  }
  assert.equal((await row<{ status: string }>(db, "select status from public.user_protocols where id=$1", [protocol.id])).status, "draft");
  await db.query("update public.planned_activities set title='Changed normally' where id=$1", [habit.id]);
  const symptom = await row<{ id: string }>(db, "insert into public.user_symptoms(user_id,custom_symptom_name) values($1,'Explicit custom identity') returning id", [A]);
  await db.query("insert into public.user_symptom_events(user_id,user_symptom_id,custom_symptom_name,started_at) values($1,$2,'Explicit custom identity',now())", [A, symptom.id]);
  await assert.rejects(db.query("insert into public.user_symptom_events(user_id,user_symptom_id,custom_symptom_name,started_at) values($1,$2,'Different identity',now())", [A, symptom.id]), /SYMPTOM_IDENTITY_MISMATCH/);
  await draft(db, { ...input, outcomes: [{ ...energy, registry_key: "symptom_event_frequency", aggregation_method: "count", user_symptom_id: symptom.id }] });
});

test("prospective and no-baseline start phases use existing dates; budgets retain account/billing limits", async t => {
  const db = await database();t.after(() => db.close());await as(db);const r = await rule(db);const input = await plan(db, r);
  const dates = await row<{ today: string; tomorrow: string }>(db, "select current_date::text today,(current_date+1)::text tomorrow");
  const prospective = await draft(db, { ...input, baseline_mode: "prospective", baseline_start_date: dates.today, baseline_end_date: dates.today, intervention_start_date: dates.tomorrow });
  assert.equal((await row<{ current_phase: string }>(db, "select * from public.start_experiment_v2($1,1)", [prospective.id])).current_phase, "baseline");
  const none = await draft(db, { ...input, baseline_mode: "none", baseline_start_date: null, baseline_end_date: null });
  assert.equal((await row<{ current_phase: string }>(db, "select * from public.start_experiment_v2($1,1)", [none.id])).current_phase, "intervention");
  for (const [key, limit] of [["account/export:POST", 2], ["account/delete:POST", 3], ["billing/checkout:POST", 3], ["billing/portal:POST", 6]] as const) {
    for (let n = 0; n < limit; n++) assert.equal((await row<{ ok: boolean }>(db, "select public.axvital_consume_api_budget($1) ok", [key])).ok, true);
    assert.equal((await row<{ ok: boolean }>(db, "select public.axvital_consume_api_budget($1) ok", [key])).ok, false);
  }
});

test("start rechecks cardinality in SQL; whole-experiment erasure still removes immutable snapshot", async t => {
  const db = await database();t.after(() => db.close());await as(db);const r = await rule(db);const input = await plan(db, r);
  const e = await draft(db, input);await db.exec("reset role");
  await db.query("insert into public.experiment_interventions(experiment_id,intervention_type,name,is_primary) values($1,'custom','Privileged invalid fixture',false)", [e.id]);
  await as(db);await assert.rejects(db.query("select public.start_experiment_v2($1,1)", [e.id]), /CONFIGURATION_INCOMPLETE/);
  await db.exec("reset role");await db.query("delete from public.experiment_interventions where experiment_id=$1 and not is_primary", [e.id]);
  await as(db);await db.query("select public.start_experiment_v2($1,1)", [e.id]);await db.query("delete from public.experiments where id=$1", [e.id]);
  assert.equal((await db.query("select * from public.experiment_start_snapshots where experiment_id=$1", [e.id])).rows.length, 0);
});

test("workout intervention captures prescription but no execution observations", async t => {
  const db = await database();t.after(() => db.close());await as(db);const r = await rule(db);const input = await plan(db, r);
  const exercise = await row<{ id: string }>(db, "select id from public.exercises where user_id is null limit 1");
  const template = await row<{ id: string }>(db, "insert into public.workout_templates(user_id,name) values($1,'Selected workout') returning id", [A]);
  const group = await row<{ id: string }>(db, "insert into public.workout_template_groups(user_id,workout_template_id,group_order,group_label) values($1,$2,0,'A') returning id", [A, template.id]);
  const member = await row<{ id: string }>(db, "insert into public.workout_template_exercises(user_id,workout_template_id,workout_template_group_id,exercise_id,exercise_order,display_label,tracking_type) values($1,$2,$3,$4,0,'A1','weight_reps') returning id", [A, template.id, group.id, exercise.id]);
  await db.query("insert into public.workout_template_sets(user_id,workout_template_exercise_id,set_number,target_reps_min,target_reps_max) values($1,$2,1,5,8)", [A, member.id]);
  const e = await draft(db, { ...input, intervention: { intervention_type: "workout", linked_workout_template_id: template.id } });
  await db.query("select public.start_experiment_v2($1,1)", [e.id]);
  const snap = await row<{ configuration: unknown }>(db, "select configuration from public.experiment_start_snapshots where experiment_id=$1", [e.id]);
  assert.match(JSON.stringify(snap.configuration), /target_reps_min/);
  assert.doesNotMatch(JSON.stringify(snap.configuration), /actual_reps|workout_session_sets|daily_checkins/);
});
