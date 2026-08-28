import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { historicalWindow, localDateBoundary, shiftDate } from "./time-window.ts";
import { evaluateReadiness } from "./readiness-policies.ts";
import type { SourceResult } from "./observations.ts";
import type { SourceRequest } from "./sources/index.ts";
import { database } from "../security/test-database.ts";

// Only the Next compiler marker is stubbed in this Node test process. Readers,
// validation, query construction, clock, formulas and readiness run unmodified.
// Node 24 runtime supports hooks; this repo deliberately retains Node 20 types.
type ResolveResult = { url: string; shortCircuit?: boolean };
const { registerHooks } = nodeModule as unknown as { registerHooks(hooks: { resolve: (specifier: string, context: unknown, next: (specifier: string, context: unknown) => ResolveResult) => ResolveResult }): { deregister(): void } };
const hook = registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === "server-only" ? { url: "data:text/javascript,export{}", shortCircuit: true } : nextResolve(specifier, context);
} });
const { readObservations, SOURCE_ROW_LIMIT } = await import("./sources/index.ts");
const { getBaselineReadiness } = await import("../experiments/readiness.ts");
hook.deregister();
const A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb", X = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const clock = () => new Date("2026-08-28T12:00:00Z");
function request(key = "energy_score"): SourceRequest {
  return { timeZone: "America/New_York", startDate: "2026-08-14", endDateExclusive: "2026-08-28", outcome: {
    registry_key: key, registry_version: 1, outcome_role: "primary", aggregation_method: key === "exercise_estimated_1rm" ? "maximum" : key === "sleep_quality_score" ? "median" : "average",
    expected_direction: "increase", source_config: {}, ...(key === "exercise_estimated_1rm" ? { exercise_id: X } : {}),
  } };
}
type Row = Record<string, unknown>;
type Call = { table: string; selection: string; filters: [string, string, unknown][]; limit: number; signal?: AbortSignal };
function clientFor(tables: Record<string, Row[]> = {}, options: { user?: string | null; failed?: string; thrown?: string; count?: number | null; ignoreFilters?: boolean } = {}) {
  const calls: Call[] = [];
  const client = { auth: { getUser: async () => ({ data: { user: options.user === null ? null : { id: options.user ?? A } }, error: null }) },
    from(table: string) {
      const call: Call = { table, selection: "", filters: [], limit: Infinity };calls.push(call);
      const chain = {
        select(selection: string) { call.selection = selection;return chain; },
        eq(key: string, value: unknown) { call.filters.push(["eq", key, value]);return chain; },
        gte(key: string, value: unknown) { call.filters.push(["gte", key, value]);return chain; },
        lt(key: string, value: unknown) { call.filters.push(["lt", key, value]);return chain; },
        order() { return chain; }, limit(n: number) { call.limit = n;return chain; }, abortSignal(signal: AbortSignal) { call.signal = signal;return chain; },
        async maybeSingle() { const response = await execute();return { ...response, data: response.data?.[0] ?? null }; },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) { return execute().then(resolve, reject); },
      };
      async function execute() {
        if (options.thrown === table) throw new Error("private source payload must not escape");
        if (options.failed === table) return { data: null, error: { message: "private source payload" }, count: null };
        const rows = (tables[table] ?? []).filter(row => options.ignoreFilters || call.filters.every(([op, key, expected]) => {
          const value = key.split(".").reduce<unknown>((v, k) => (v as Row)?.[k], row);
          return op === "eq" ? value === expected : op === "gte" ? String(value) >= String(expected) : String(value) < String(expected);
        }));
        return { data: rows.slice(0, call.limit), error: null, count: options.count === undefined ? rows.length : options.count };
      }
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}
function checkin(day = "2026-08-14", energy: number | null = 7): Row { return { id: day, user_id: A, checkin_date: day, energy_score: energy, mood_score: 5, sleep_quality: "Good" }; }
function workout(id = "set1", sessionId = "session1", date = "2026-08-14", weight = 150): Row {
  return { id, user_id: A, workout_session_id: sessionId, workout_session_exercise_id: `exercise-${sessionId}`, set_number: Number(id.replace(/\D/g, "")) || 1,
    status: "completed", set_type: "working", actual_weight: weight, actual_reps: 6, completed_at: null,
    session: { id: sessionId, user_id: A, session_date: date, started_at: `${date}T15:00:00Z`, status: "in_progress" },
    exercise: { id: `exercise-${sessionId}`, user_id: A, workout_session_id: sessionId, exercise_id: X, tracking_type: "weight_reps", group_order: 1, exercise_order: 1 } };
}
function workoutClient(rows: Row[], options: Parameters<typeof clientFor>[1] = {}) { return clientFor({ exercises: [{ id: X, user_id: null }], workout_session_sets: rows }, options); }

test("zoned windows are DST-safe, half-open and independent of process-local dates", () => {
  assert.equal(localDateBoundary("2026-03-08", "America/New_York"), "2026-03-08T05:00:00.000Z");
  assert.equal(localDateBoundary("2026-03-09", "America/New_York"), "2026-03-09T04:00:00.000Z");
  assert.equal(localDateBoundary("2026-11-01", "America/New_York"), "2026-11-01T04:00:00.000Z");
  assert.equal(localDateBoundary("2026-11-02", "America/New_York"), "2026-11-02T05:00:00.000Z");
  assert.equal(localDateBoundary("2026-08-14", "Asia/Kathmandu"), "2026-08-13T18:15:00.000Z");
  assert.equal(localDateBoundary("2018-11-04", "America/Sao_Paulo"), "2018-11-04T03:00:00.000Z");
  assert.throws(() => localDateBoundary("2011-12-30", "Pacific/Apia"), /NONEXISTENT_LOCAL_DATE/);
  for (const args of [["2026-02-30", "2026-03-01"], ["2026-08-28", "2026-08-28"], ["2025-01-01", "2026-08-28"], ["2026-08-28", "2026-08-30"]])
    assert.throws(() => historicalWindow("UTC", clock(), ...args as [string, string]));
  assert.throws(() => historicalWindow("Invalid/Zone", clock()));
  assert.equal(historicalWindow("UTC", clock()).startDate, "2026-08-14");
  assert.equal(historicalWindow("UTC", clock()).expectedDays, 14);
});

test("check-ins preserve date-only points, null/missing/excluded and owner/window filters", async () => {
  const { client, calls } = clientFor({ daily_checkins: [checkin(), checkin("2026-08-15", null), checkin("2026-08-16", 0), { ...checkin("2026-08-17"), user_id: B }, checkin("2026-08-28")] });
  const source = await readObservations(client, request(), clock), ready = evaluateReadiness(source);
  assert.equal(source.observationCount, 1);assert.equal(source.observations[0].logicalDate, "2026-08-14");
  assert.equal("timestamp" in source.observations[0], false);assert.equal(source.counts.nullValues, 1);assert.equal(source.counts.excluded, 1);assert.equal(source.counts.absentDays, 11);
  assert.equal(ready.classification, "limited");assert.equal(calls.length, 1);assert.equal(calls[0].limit, SOURCE_ROW_LIMIT);assert.ok(calls[0].signal);
  assert.ok(calls[0].filters.some(f => f[0] === "lt" && f[1] === "checkin_date"));
  assert.equal(JSON.stringify(ready).includes('"sourceId"'), false);
});

test("seven check-in days are good; sparse is limited and absent is insufficient", async () => {
  for (const [count, expected] of [[7, "good"], [6, "limited"], [0, "insufficient"]] as const) {
    const { client } = clientFor({ daily_checkins: Array.from({ length: count }, (_, i) => checkin(shiftDate("2026-08-14", i))) });
    const result = await getBaselineReadiness(client, request(), clock);
    assert.equal(result.classification, expected);assert.equal(result.observationCount, count);
    assert.equal(result.baselineAggregate?.kind === "numeric" ? result.baselineAggregate.value : null, count ? 7 : null);
  }
});

test("ordinal sleep median returns category bounds, never a fabricated fractional category", async () => {
  const { client } = clientFor({ daily_checkins: ["Poor", "Average", "Good", "Great", "Excellent"].map((sleep_quality, i) => ({ ...checkin(shiftDate("2026-08-14", i)), sleep_quality })) });
  const source = await readObservations(client, request("sleep_quality_score"), clock), ready = evaluateReadiness(source);
  assert.equal(source.counts.excluded, 1);assert.deepEqual(ready.baselineAggregate, { kind: "ordinal_median", lower: { kind: "ordinal", value: 2, category: "Average" }, upper: { kind: "ordinal", value: 3, category: "Good" } });
  const mood = await readObservations(client, request("mood_score"), clock);assert.equal(mood.observations[0].value.value, 5);
});

test("failed and truncated reads suppress normal readiness and aggregates", async () => {
  for (const options of [{ failed: "daily_checkins" }, { thrown: "daily_checkins" }, { count: 1001 }, { count: null }]) {
    const { client } = clientFor({ daily_checkins: [checkin()] }, options);
    const result = await getBaselineReadiness(client, request(), clock);
    assert.notEqual(result.queryCompleteness, "complete");assert.equal(result.classification, null);assert.equal(result.baselineAggregate, null);assert.equal(result.latestValue, null);
    assert.equal(JSON.stringify(result).includes("private source payload"), false);
  }
  const { client } = workoutClient(Array.from({ length: SOURCE_ROW_LIMIT }, (_, i) => workout(`set${i}`)));
  assert.equal((await readObservations(client, request("exercise_estimated_1rm"), clock)).queryCompleteness, "truncated");
});

test("closed dispatch rejects unsupported metrics, forged owner/cutoff and foreign targets", async () => {
  const { client, calls } = clientFor();
  for (const key of ["body_weight", "steps", "exercise_session_frequency", "exercise_repetitions"])
    await assert.rejects(readObservations(client, request(key), clock));
  await assert.rejects(readObservations(client, { ...request(), userId: B } as SourceRequest, clock), /INVALID_REQUEST/);
  await assert.rejects(readObservations(client, { ...request(), evaluatedAt: "2000-01-01" } as SourceRequest, clock), /INVALID_REQUEST/);
  assert.equal(calls.length, 0);
  await assert.rejects(readObservations(clientFor({}, { user: null }).client, request(), clock), /AUTH_REQUIRED/);
  await assert.rejects(readObservations(clientFor({ exercises: [{ id: X, user_id: B }] }).client, request("exercise_estimated_1rm"), clock), /TARGET_NOT_FOUND/);
  const malformed = request("exercise_estimated_1rm");malformed.outcome.exercise_id = "forged";
  await assert.rejects(readObservations(client, malformed, clock), /INVALID_TARGET/);
});

test("workout latest is not best; incomplete sessions and undoubled loads remain eligible", async () => {
  const { client, calls } = workoutClient([workout("set1", "s1", "2026-08-14", 200), workout("set2", "s2", "2026-08-15", 125)]);
  const source = await readObservations(client, request("exercise_estimated_1rm"), clock), ready = evaluateReadiness(source);
  assert.equal(ready.workout?.latestValue, 150);assert.equal(ready.workout?.bestValue, 240);assert.equal(ready.classification, "limited");
  assert.equal(source.observations[1].workout?.actualWeight, 125);assert.equal(calls.length, 2);
  assert.match(calls[1].selection, /workout_session_sets_workout_session_id_fkey!inner/);
  assert.ok(calls[1].filters.some(f => f[1] === "exercise.exercise_id" && f[2] === X));
});

test("workout policy requires five sets across two sessions and dates", async () => {
  for (const [count, sessions, dates, expected] of [[5, 1, 1, "limited"], [5, 2, 1, "limited"], [5, 2, 2, "good"], [4, 2, 2, "limited"], [0, 0, 0, "insufficient"]] as const) {
    const rows = Array.from({ length: count }, (_, i) => workout(`set${i}`, `s${i % sessions}`, shiftDate("2026-08-14", i % dates)));
    const result = await getBaselineReadiness(workoutClient(rows).client, request("exercise_estimated_1rm"), clock);
    assert.equal(result.classification, expected);assert.equal(result.coverage.percentage, null);
  }
});

for (const [label, patch] of [
  ["warmup", { set_type: "warmup" }], ["pending", { status: "pending" }], ["skipped", { status: "skipped" }],
  ["zero", { actual_weight: 0 }], ["negative", { actual_weight: -1 }], ["missing load", { actual_weight: null }],
  ["missing reps", { actual_reps: null }], ["11 reps", { actual_reps: 11 }], ["fractional reps", { actual_reps: 2.5 }],
  ["foreign owner", { user_id: B }], ["inconsistent session", { workout_session_id: "wrong" }],
] as [string, Row][]) test(`adapter excludes ${label}`, async () => {
  const { client } = workoutClient([{ ...workout(), ...patch }], { ignoreFilters: true });
  const result = await readObservations(client, request("exercise_estimated_1rm"), clock);
  assert.equal(result.observationCount, 0);assert.equal(evaluateReadiness(result).classification, "insufficient");
  assert.equal(result.counts.nullValues + result.counts.excluded, 1);
});

test("workout parent ownership, durable target and tracking are rechecked after reads", async () => {
  for (const patch of [{ exercise_id: B }, { user_id: B }, { tracking_type: "bodyweight_reps" }, { workout_session_id: "wrong" }]) {
    const row = workout();row.exercise = { ...row.exercise as Row, ...patch };
    const result = await readObservations(workoutClient([row], { ignoreFilters: true }).client, request("exercise_estimated_1rm"), clock);
    assert.equal(result.observationCount, 0);
  }
  for (const reps of [1, 10]) {
    const result = await readObservations(workoutClient([{ ...workout(), actual_reps: reps }]).client, request("exercise_estimated_1rm"), clock);
    assert.equal(result.observations[0].value.value, 150 * (1 + reps / 30));
  }
});

test("cutoff censors future completions using actual instants, and current day is explicit", async () => {
  const result = await readObservations(workoutClient([{ ...workout(), completed_at: "2026-08-28T09:00:00-04:00" }]).client, request("exercise_estimated_1rm"), clock);
  assert.equal(result.counts.censored, 1);assert.equal(result.observationCount, 0);
  const req = request();req.endDateExclusive = "2026-08-29";
  const current = await readObservations(clientFor().client, req, clock);
  assert.ok(current.warnings.includes("PARTIAL_CURRENT_DAY"));assert.equal(current.window.effectiveEndAtExclusive, clock().toISOString());
});

test("generic numeric zero survives the observation/readiness contract", async () => {
  const source = await readObservations(clientFor({ daily_checkins: [checkin()] }).client, request(), clock);
  const fixture: SourceResult = { ...source, observations: [{ ...source.observations[0], value: { kind: "numeric", value: 0 } }] };
  assert.deepEqual(evaluateReadiness(fixture).baselineAggregate, { kind: "numeric", value: 0 });
});

test("same-day workout order, private exercise visibility and duplicate failure are explicit", async () => {
  const earlier = workout("set9", "s1", "2026-08-14", 200), later = workout("set1", "s1", "2026-08-14", 125);
  later.exercise = { ...later.exercise as Row, group_order: 2 };
  const { client } = clientFor({ exercises: [{ id: X, user_id: A }], workout_session_sets: [later, earlier] });
  const result = await getBaselineReadiness(client, request("exercise_estimated_1rm"), clock);
  assert.equal(result.workout?.latestValue, 150);assert.equal(result.workout?.bestValue, 240);
  const duplicate = await readObservations(clientFor({ daily_checkins: [checkin(), checkin()] }).client, request(), clock);
  assert.equal(duplicate.queryCompleteness, "failed");assert.equal(evaluateReadiness(duplicate).classification, null);
  const req = request();req.outcome.aggregation_method = "median";
  const median = await getBaselineReadiness(clientFor({ daily_checkins: [checkin("2026-08-14", 2), checkin("2026-08-15", 8)] }).client, req, clock);
  assert.deepEqual(median.baselineAggregate, { kind: "numeric", value: 5 });
});

test("server-only readers have no domain mutation paths; real FK names and RLS exist locally", async t => {
  for (const name of ["./sources/index.ts", "../experiments/readiness.ts"]) {
    const source = readFileSync(new URL(name, import.meta.url), "utf8");
    assert.match(source, /import "server-only"/);assert.doesNotMatch(source, /\.(insert|update|upsert|delete|rpc)\(/);
  }
  const db = await database();t.after(() => db.close());
  const fks = await db.query<{ conname: string }>("select conname from pg_constraint where conrelid='public.workout_session_sets'::regclass and contype='f'");
  for (const fk of ["workout_session_sets_workout_session_id_fkey", "workout_session_sets_workout_session_exercise_id_fkey"]) assert.ok(fks.rows.some(r => r.conname === fk));
  await db.query("insert into public.daily_checkins(user_id,checkin_date,energy_score) values($1,'2026-08-14',7),($2,'2026-08-14',9)", [A, B]);
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${A}',false);begin transaction read only;`);
  assert.equal((await db.query("select * from public.daily_checkins where checkin_date='2026-08-14'")).rows.length, 1);
  await db.exec("rollback");
});
