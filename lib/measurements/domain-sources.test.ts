import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceRequest } from "./sources/index.ts";
import { evaluateReadiness } from "./readiness-policies.ts";
import { database } from "../security/test-database.ts";
type Resolved = { url: string; shortCircuit?: boolean };
const { registerHooks } = nodeModule as unknown as { registerHooks(hooks: { resolve: (s: string, c: unknown, next: (s: string, c: unknown) => Resolved) => Resolved }): { deregister(): void } };
const hook = registerHooks({ resolve(s, c, next) { return s === "server-only" ? { url: "data:text/javascript,export{}", shortCircuit: true } : next(s, c); } });
const { readObservations } = await import("./sources/index.ts");hook.deregister();
type Row = Record<string, unknown>;
const A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb", C = "cccccccc-cccc-4ccc-cccc-cccccccccccc", S = "dddddddd-dddd-4ddd-dddd-dddddddddddd", U = "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee";
const clock = () => new Date("2026-08-28T12:00:00Z");
function request(key: string): SourceRequest {
  return { startDate: "2026-08-14", endDateExclusive: "2026-08-28", timeZone: "UTC", outcome: { registry_key: key, registry_version: 1, outcome_role: "primary", expected_direction: "increase", source_config: {},
    aggregation_method: key.endsWith("frequency") ? "count" : key === "symptom_occurrence_count" ? "sum" : key.endsWith("impact") ? "median" : "average",
    ...(key.startsWith("condition_") ? { user_condition_id: C } : key.startsWith("symptom_") ? { symptom_id: S } : {}) } };
}
function fixture(tables: Record<string, Row[]> = {}, opts: { fail?: string; count?: number | null; ignoreFilters?: boolean; rpc?: unknown; user?: string | null } = {}) {
  const calls: { table: string; selection: string; limit: number; filters: [string, string, unknown][] }[] = [];
  const all: Record<string, Row[]> = { user_conditions: [{ id: C, user_id: A }], symptoms: [{ id: S }], user_symptoms: [{ id: U, user_id: A }], ...tables };
  const client = { auth: { getUser: async () => ({ data: { user: opts.user === null ? null : { id: opts.user ?? A } }, error: null }) },
    rpc(name: string) { assert.equal(name, "read_nutrition_observations_v1");return { abortSignal: async () => ({ data: opts.rpc, error: opts.fail === "rpc" ? { message: "private error" } : null }) }; },
    from(table: string) {
      const call = { table, selection: "", limit: Infinity, filters: [] as [string, string, unknown][] };calls.push(call);
      const chain = { select(s: string) { call.selection = s;return chain; }, order() { return chain; }, limit(n: number) { call.limit = n;return chain; }, abortSignal() { return chain; },
        eq(k: string, v: unknown) { call.filters.push(["eq", k, v]);return chain; }, is(k: string, v: unknown) { call.filters.push(["eq", k, v]);return chain; },
        gte(k: string, v: unknown) { call.filters.push(["gte", k, v]);return chain; }, lt(k: string, v: unknown) { call.filters.push(["lt", k, v]);return chain; },
        in(k: string, v: unknown) { call.filters.push(["in", k, v]);return chain; },
        async maybeSingle() { const r = await execute();return { ...r, data: r.data?.[0] ?? null }; },
        then(resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) { return execute().then(resolve, reject); } };
      async function execute() {
        if (opts.fail === table) return { error: { message: "private health payload" }, data: null, count: null };
        const rows = (all[table as keyof typeof all] ?? []).filter(row => opts.ignoreFilters || call.filters.every(([op, key, value]) => op === "eq" ? row[key] === value : op === "in" ? (value as unknown[]).includes(row[key]) : op === "gte" ? String(row[key]) >= String(value) : String(row[key]) < String(value)));
        return { error: null, data: rows.slice(0, call.limit), count: opts.count === undefined ? rows.length : opts.count };
      }
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}
function nutrition(days = 1) {
  return { version: 1, truncated: false, entries: Array.from({ length: days }, (_, i) => ({ id: `e${i}`, user_id: A, consumed_at: `2026-08-${14 + i}T12:00:00Z` })),
    items: Array.from({ length: days }, (_, i) => ({ id: `i${i}`, nutrition_entry_id: `e${i}`, calories: 200, protein_grams: 20, carbohydrate_grams: 10, fat_grams: 5, fiber_grams: null, caffeine_mg: 0, alcohol_grams: 0, quantity_multiplier: 3 })),
    coverage: Array.from({ length: days }, (_, i) => ({ local_date: `2026-08-${14 + i}`, time_zone: "UTC", coverage_status: "complete" })) };
}
function episode(id = "ep1", date = "2026-08-14"): Row { return { id, user_id: A, user_condition_id: C, started_at: `${date}T12:00:00Z`, ended_at: `${date}T14:00:00Z`, status: "resolved", archived_at: null }; }
function update(ep = "ep1", date = "2026-08-14", patch: Row = {}): Row { return { id: `u-${ep}`, user_id: A, condition_episode_id: ep, recorded_at: `${date}T14:00:00Z`, created_at: `${date}T14:00:00Z`, overall_severity: 7, functional_impact: "moderate", status: "resolved", ...patch }; }
function symptom(id = "s1", date = "2026-08-14"): Row { return { id, user_id: A, symptom_id: S, user_symptom_id: null, started_at: `${date}T12:00:00Z`, ended_at: `${date}T13:00:00Z`, severity: 6, occurrence_count: null, resolved: true, deleted_at: null }; }

test("nutrition uses scaled snapshots, zero/null/missing and per-day completeness without double multiplication", async () => {
  const data = nutrition();data.items.push({ ...data.items[0], id: "null", calories: null as unknown as number });
  data.coverage.push({ local_date: "2026-08-15", time_zone: "UTC", coverage_status: "complete" });
  const source = await readObservations(fixture({}, { rpc: data }).client, request("nutrition_calories"), clock);
  assert.equal(source.observations[0].value.value, 200);assert.equal(source.counts.nullValues, 1);
  assert.equal(source.nutritionDays?.[0].fieldComplete, false);assert.equal(source.nutritionDays?.[0].knownItemCount, 1);
  assert.equal(source.nutritionDays?.[1].subtotal, null);assert.equal(source.nutritionDays?.[1].coverageStatus, "complete");
  assert.equal(evaluateReadiness(source).classification, "limited");
  const zero = await readObservations(fixture({}, { rpc: nutrition() }).client, request("nutrition_caffeine_mg"), clock);
  assert.equal(zero.observations[0].value.value, 0);
  const unknown = await readObservations(fixture({}, { rpc: nutrition() }).client, request("nutrition_fiber_grams"), clock);
  assert.equal(evaluateReadiness(unknown).classification, "insufficient");assert.equal(unknown.observationCount, 0);
});
test("nutrition readiness requires seven qualifying days AND half the window", async () => {
  for (const [days, expected] of [[7, "good"], [6, "limited"], [0, "insufficient"]] as const) {
    const source = await readObservations(fixture({}, { rpc: nutrition(days) }).client, request("nutrition_protein_grams"), clock);
    assert.equal(evaluateReadiness(source).classification, expected);
  }
  const req = request("nutrition_calories");req.startDate = "2026-08-01";
  const source = await readObservations(fixture({}, { rpc: nutrition(7) }).client, req, clock);
  assert.equal(evaluateReadiness(source).classification, "limited");
  const data = nutrition(7);data.coverage[0].coverage_status = "partial";data.coverage.pop();
  const ready = evaluateReadiness(await readObservations(fixture({}, { rpc: data }).client, request("nutrition_calories"), clock));
  assert.equal(ready.nutrition?.partialDays, 1);assert.equal(ready.nutrition?.unknownCoverageDays, 8);assert.equal(ready.classification, "limited");
});
test("nutrition timezone grouping, foreign ownership and operational failures are safe", async () => {
  const data = nutrition();data.entries[0].consumed_at = "2026-08-15T01:00:00Z";data.coverage = [];
  const req = request("nutrition_calories");req.timeZone = "America/New_York";
  assert.equal((await readObservations(fixture({}, { rpc: data }).client, req, clock)).observations[0].logicalDate, "2026-08-14");
  for (const opts of [{ rpc: { ...nutrition(), truncated: true } }, { rpc: nutrition(), fail: "rpc" }, { rpc: { ...nutrition(), entries: [{ ...nutrition().entries[0], user_id: B }] } }]) {
    const ready = evaluateReadiness(await readObservations(fixture({}, opts).client, request("nutrition_calories"), clock));
    assert.equal(ready.classification, null);assert.equal(ready.baselineAggregate, null);
  }
});
test("episode frequency is recorded count with zero ambiguity and never good", async () => {
  for (const count of [0, 1, 5]) {
    const rows = Array.from({ length: count }, (_, i) => episode(`ep${i}`));
    const source = await readObservations(fixture({ condition_episodes: rows }).client, request("condition_episode_frequency"), clock);
    const ready = evaluateReadiness(source);assert.equal(ready.recordedTotal, count);assert.equal(ready.classification, "limited");assert.equal(ready.coverage.percentage, null);
    if (!count) assert.ok(ready.warnings.includes("ZERO_RECORDED_EVENTS_NOT_VERIFIED_ABSENCE"));
  }
});
for (const key of ["condition_episode_duration_hours", "condition_episode_peak_severity", "condition_episode_impact"]) test(`${key} uses update evidence and three-episode policy`, async () => {
  for (const [count, expected] of [[3, "good"], [1, "limited"], [0, "insufficient"]] as const) {
    const rows = Array.from({ length: count }, (_, i) => episode(`ep${i}`)), updates = rows.map(e => update(String(e.id)));
    const source = await readObservations(fixture({ condition_episodes: rows, episode_updates: updates }).client, request(key), clock);
    assert.equal(evaluateReadiness(source).classification, expected);
    if (count) assert.equal(source.observations[0].value.value, key.endsWith("hours") ? 2 : key.endsWith("severity") ? 7 : 2);
    assert.ok(source.temporalLimitations.includes("EPISODE_UPDATES_MUTABLE_AND_BACKDATABLE"));
  }
});
test("reopened/open/contradictory episodes are censored; peak and ordinal impact ignore parent summaries", async () => {
  for (const row of [{ ...episode(), status: "ongoing" }, { ...episode(), ended_at: null }, { ...episode(), ended_at: "2026-08-14T11:00:00Z" }]) {
    const source = await readObservations(fixture({ condition_episodes: [row], episode_updates: [update()] }).client, request("condition_episode_duration_hours"), clock);
    assert.equal(source.counts.censored, 1);assert.equal(source.observationCount, 0);
  }
  const source = await readObservations(fixture({ condition_episodes: [{ ...episode(), overall_severity: 10 }], episode_updates: [update(), update("ep1", "2026-08-14", { id: "later", recorded_at: "2026-08-29T12:00:00Z", overall_severity: 10 })] }).client, request("condition_episode_peak_severity"), clock);
  assert.equal(source.observations[0].value.value, 7);
  const impact = await readObservations(fixture({ condition_episodes: [episode("ep1"), episode("ep2")], episode_updates: [update(), update("ep2", "2026-08-14", { functional_impact: "significant" })] }).client, request("condition_episode_impact"), clock);
  assert.equal(evaluateReadiness(impact).baselineAggregate?.kind, "ordinal_median");
});
test("episode/symptom ownership, target IDs, query errors and caps never become normal readiness", async () => {
  for (const key of ["condition_episode_frequency", "symptom_event_frequency"]) {
    const table = key.startsWith("condition") ? "condition_episodes" : "user_symptom_events";
    for (const opts of [{ fail: table }, { count: 1001 }]) {
      const r = await readObservations(fixture({}, opts).client, request(key), clock);assert.equal(evaluateReadiness(r).classification, null);
    }
  }
  await assert.rejects(readObservations(fixture({ user_conditions: [{ id: C, user_id: B }] }).client, request("condition_episode_frequency"), clock), /TARGET_NOT_FOUND/);
  const source = await readObservations(fixture({ condition_episodes: [{ ...episode(), user_id: B }, { ...episode("wrong"), user_condition_id: B }] }, { ignoreFilters: true }).client, request("condition_episode_frequency"), clock);
  assert.equal(source.observationCount, 0);assert.equal(source.counts.excluded, 2);
});
test("symptom catalog history works; durable identity never falls back to text/catalog", async () => {
  const tables = { user_symptom_events: [symptom(), { ...symptom("s2"), user_symptom_id: U }, { ...symptom("foreign"), user_id: B }] };
  const catalog = await readObservations(fixture(tables).client, request("symptom_event_frequency"), clock);assert.equal(catalog.observationCount, 2);
  const req = request("symptom_event_frequency");delete req.outcome.symptom_id;req.outcome.user_symptom_id = U;
  const durable = await readObservations(fixture(tables, { ignoreFilters: true }).client, req, clock);assert.equal(durable.observationCount, 1);
  assert.ok(durable.warnings.includes("UNLINKED_DURABLE_HISTORY_NOT_MATCHED"));
});
test("symptom condition scope deduplicates links and checks owner", async () => {
  const req = request("symptom_event_frequency");req.outcome.user_condition_id = C;
  const source = await readObservations(fixture({ user_symptom_events: [symptom(), symptom("s2")], symptom_event_conditions: [{ symptom_event_id: "s1", user_condition_id: C }, { symptom_event_id: "s1", user_condition_id: C }] }).client, req, clock);
  assert.equal(source.observationCount, 1);assert.equal(evaluateReadiness(source).recordedTotal, 1);
  await assert.rejects(readObservations(fixture({ user_conditions: [{ id: C, user_id: B }] }).client, req, clock), /TARGET_NOT_FOUND/);
});
test("symptom occurrences remain unknown when null; frequency zero is explicitly ambiguous", async () => {
  const none = await readObservations(fixture({ user_symptom_events: [symptom()] }).client, request("symptom_occurrence_count"), clock);
  assert.equal(none.counts.nullValues, 1);assert.equal(evaluateReadiness(none).recordedTotal, null);
  const some = await readObservations(fixture({ user_symptom_events: [{ ...symptom(), occurrence_count: 4 }, symptom("s2")] }).client, request("symptom_occurrence_count"), clock);
  assert.equal(evaluateReadiness(some).recordedTotal, 4);assert.equal(evaluateReadiness(some).classification, "limited");
  const zero = evaluateReadiness(await readObservations(fixture().client, request("symptom_event_frequency"), clock));assert.equal(zero.recordedTotal, 0);assert.equal(zero.classification, "limited");
});
for (const key of ["symptom_severity", "symptom_duration_minutes"]) test(`${key} requires five events across three dates`, async () => {
  for (const [count, days, expected] of [[5, 3, "good"], [5, 1, "limited"], [4, 3, "limited"], [0, 1, "insufficient"]] as const) {
    const rows = Array.from({ length: count }, (_, i) => symptom(`s${i}`, `2026-08-${14 + i % days}`));
    const source = await readObservations(fixture({ user_symptom_events: rows }).client, request(key), clock);
    assert.equal(evaluateReadiness(source).classification, expected);
    if (count) assert.equal(source.observations[0].value.value, key.endsWith("minutes") ? 60 : 6);
  }
});
test("symptom open/contradictory duration is censored and timestamp sorting uses instants", async () => {
  for (const patch of [{ ended_at: null }, { ended_at: "2026-08-14T11:00:00Z" }, { resolved: false }, { ended_at: "2026-08-29T12:00:00Z" }]) {
    const source = await readObservations(fixture({ user_symptom_events: [{ ...symptom(), ...patch }] }).client, request("symptom_duration_minutes"), clock);
    assert.equal(source.counts.censored, 1);assert.equal(source.observationCount, 0);
  }
  const source = await readObservations(fixture({ user_symptom_events: [{ ...symptom("later"), started_at: "2026-08-14T10:00:00-04:00", severity: 9 }, { ...symptom("earlier"), started_at: "2026-08-14T13:00:00Z", severity: 2 }] }, { ignoreFilters: true }).client, request("symptom_severity"), clock);
  assert.equal(evaluateReadiness(source).latestValue?.value, 9);assert.equal(source.observations[0].precision, "timestamp");
});
test("condition default is 28 days; child caps/errors suppress aggregates", async () => {
  const req = request("condition_episode_duration_hours");delete req.startDate;delete req.endDateExclusive;
  const source = await readObservations(fixture().client, req, clock);assert.equal(source.window.expectedDays, 28);
  const failed = await readObservations(fixture({ condition_episodes: [episode()] }, { fail: "episode_updates" }).client, req, clock);
  assert.equal(evaluateReadiness(failed).classification, null);
  const truncated = await readObservations(fixture({ condition_episodes: [episode()], episode_updates: Array.from({ length: 1000 }, (_, i) => update("ep1", "2026-08-14", { id: String(i) })) }).client, req, clock);
  assert.equal(truncated.queryCompleteness, "truncated");assert.equal(evaluateReadiness(truncated).baselineAggregate, null);
});

test("Nutrition invoker RPC reads one bounded snapshot under RLS and works inside read-only transaction", async t => {
  const db = await database();t.after(() => db.close());
  const metadata = await db.query<{ prosecdef: boolean; provolatile: string }>("select prosecdef,provolatile from pg_proc where proname='read_nutrition_observations_v1'");
  assert.deepEqual(metadata.rows[0], { prosecdef: false, provolatile: "s" });
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${A}',false);`);
  const food = (await db.query<{ id: string }>("insert into public.user_foods(user_id,name,serving_name,serving_quantity,serving_unit,calories) values($1,'Fixture','portion',1,'each',100) returning id", [A])).rows[0].id;
  const entry = (await db.query<{ id: string }>("insert into public.nutrition_entries(user_id,consumed_at) values($1,'2020-01-01T12:00:00Z') returning id", [A])).rows[0].id;
  await db.query("insert into public.nutrition_entry_items(nutrition_entry_id,user_food_id,source_name,serving_name_snapshot,serving_quantity_snapshot,serving_unit_snapshot,quantity_multiplier,calories) values($1,$2,'Fixture','portion',1,'each',3,300)", [entry, food]);
  await db.query("insert into public.nutrition_log_days(user_id,local_date,time_zone,coverage_status) values($1,'2020-01-01','UTC','complete')", [A]);
  await db.exec("begin transaction read only");
  const read = async () => (await db.query<{ data: { entries: Row[]; items: Row[]; coverage: Row[]; truncated: boolean } }>("select public.read_nutrition_observations_v1('2020-01-01','2020-01-03','UTC','2020-01-03T12:00:00Z') data")).rows[0].data;
  const data = await read();assert.equal(data.entries.length, 1);assert.equal(data.items[0].calories, 300);assert.equal(data.coverage[0].coverage_status, "complete");assert.equal(data.truncated, false);
  await db.exec("rollback");
  // Havana repeats midnight: include the first occurrence, not only PostgreSQL's later offset.
  const repeated = (await db.query<{ id: string }>("insert into public.nutrition_entries(user_id,consumed_at) values($1,'2020-11-01T04:30:00Z') returning id", [A])).rows[0].id;
  const midnight = (await db.query<{ data: { entries: Row[] } }>("select public.read_nutrition_observations_v1('2020-11-01','2020-11-02','America/Havana','2020-11-03T12:00:00Z') data")).rows[0].data;
  assert.equal(midnight.entries[0].id, repeated);
  await db.query("update public.nutrition_entries set deleted_at=now() where id=$1", [entry]);
  const deleted = await read();assert.equal(deleted.items.length, 0);assert.equal(deleted.entries.length, 0);assert.equal(deleted.coverage[0].coverage_status, "unknown");
  await db.exec(`select set_config('request.jwt.claim.sub','${B}',false)`);assert.equal((await read()).coverage.length, 0);
  await db.exec("reset role;set role anon");await assert.rejects(read(), /permission denied/);
  const sql = readFileSync(new URL("../../supabase/migrations/202608280003_nutrition_observation_read.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /\b(insert into|update public|delete from|execute format)\b/i);
});
