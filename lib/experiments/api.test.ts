import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { database } from "../security/test-database.ts";
import { outcomeRegistry } from "../measurements/registry.ts";
import { discoverOutcomes } from "./discovery.ts";
import { experimentError } from "./api-errors.ts";
type Resolved = { url: string; shortCircuit?: boolean };
const { registerHooks } = nodeModule as unknown as { registerHooks(hooks: { resolve: (s: string, c: unknown, next: (s: string, c: unknown) => Resolved) => Resolved }): { deregister(): void } };
const hook = registerHooks({ resolve(s, c, next) { return s === "server-only" ? { url: "data:text/javascript,export{}", shortCircuit: true } : next(s, c); } });
const { experimentApi } = await import("./api.ts");hook.deregister();
const A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
type Row = Record<string, unknown>;
const energy = { registry_key: "energy_score", registry_version: 1, outcome_role: "primary", aggregation_method: "average", expected_direction: "increase", source_config: {} };
function request(action: string, body?: unknown, query = "", origin: string | null = "https://example.test") {
  return new Request(`https://example.test/api/experiments/v2/${action}${query}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json", ...(origin === null ? {} : { origin }) }, body: JSON.stringify(body) });
}
function fake(options: { anonymous?: boolean; premium?: boolean; budget?: boolean; error?: string; tables?: Record<string, Row[]>; count?: number; failTable?: string; targets?: Row[] } = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = [];
  const tables: Record<string, Row[]> = { subscriptions: options.premium === false ? [] : [{ plan: "premium", status: "active", current_period_end: null }], ...options.tables };
  const client = { auth: { getUser: async () => ({ data: { user: options.anonymous ? null : { id: A } }, error: null }) },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      const response = name === "axvital_consume_api_budget" ? { data: options.budget !== false, error: null } : name === "discover_experiment_targets_v1" ? { data: options.targets ?? [], error: null } : { data: { id: A, status: "draft", config_revision: 1, user_id: A, private_field: "secret" }, error: options.error ? { message: options.error } : null };
      return { abortSignal() { return this; }, then(resolve: (r: unknown) => unknown) { return Promise.resolve(response).then(resolve); } };
    }, from(name: string) {
      calls.push({ name });let rows = [...(tables[name] ?? [])], single = false, limit = Infinity;
      const q = { select() { return q; }, eq(k: string, v: unknown) { rows = rows.filter(r => r[k] === v || (name === "subscriptions" && k === "user_id"));return q; }, is(k: string, v: unknown) { rows = rows.filter(r => r[k] === v);return q; },
        gte(k: string, v: string) { rows = rows.filter(r => String(r[k]) >= v);return q; }, lt(k: string, v: string) { rows = rows.filter(r => String(r[k]) < v);return q; },
        order() { return q; }, limit(n: number, ref?: unknown) { if (!ref) limit = n;return q; }, abortSignal() { return q; }, maybeSingle() { single = true;return q; },
        then(resolve: (r: unknown) => unknown) { return Promise.resolve({ data: single ? rows[0] ?? null : rows.slice(0, limit), count: options.count ?? rows.length, error: options.failTable === name ? { message: "private details" } : null }).then(resolve); } };
      return q;
    } } as unknown as SupabaseClient;
  return { calls, client, api: (action: Parameters<typeof experimentApi>[0]) => experimentApi(action, async () => client) };
}

test("outcome discovery is registry-derived, safe, grouped and honest about disabled/readiness modes", () => {
  const result = discoverOutcomes();assert.equal(result.outcomes.length, outcomeRegistry.length);
  assert.equal(new Set(result.outcomes.map(o => o.registryKey)).size, outcomeRegistry.length);
  assert.equal(result.outcomes.find(o => o.registryKey === "body_weight")?.enabled, false);
  assert.equal(result.outcomes.find(o => o.registryKey === "exercise_estimated_1rm")?.primaryPerformancePreference, true);
  assert.equal(result.outcomes.find(o => o.registryKey === "exercise_session_frequency")?.readinessAvailable, false);
  assert.equal(result.goalGroups.length, 8);assert.deepEqual(result.baselineModes, ["historical", "none"]);
  assert.doesNotMatch(JSON.stringify(result), /sourceAdapter|source_config|formula|actual_weight|daily_checkins/);
});
test("all API operations deny anonymous users and preserve private errors", async () => {
  for (const action of ["outcomes", "targets", "draft", "readiness", "start", "status"] as const) {
    const f = fake({ anonymous: true });const response = await f.api(action)(request(action));
    assert.equal(response.status, 401);assert.equal(response.headers.get("Cache-Control"), "private, no-store");assert.equal(f.calls.length, 0);
  }
});
test("Free discovery and owned draft review remain available after downgrade; authoring requires Premium", async () => {
  const f = fake({ premium: false, tables: { experiments: [{ id: A, user_id: A, model_version: 2, status: "draft", config_revision: 4, interventions: [], outcomes: [] }] } });
  assert.equal((await f.api("outcomes")(request("outcomes"))).status, 200);
  const own = await f.api("draft")(request("draft", undefined, `?id=${A}`));assert.equal(own.status, 200);assert.equal((await own.json()).experiment.config_revision, 4);
  for (const action of ["draft", "start", "readiness"] as const) assert.equal((await f.api(action)(request(action, {}))).status, 403);
  assert.equal(f.calls.some(c => c.name === "save_experiment_v2" || c.name === "start_experiment_v2"), false);
});
test("foreign and nonexistent drafts have identical absent responses", async () => {
  const f = fake({ tables: { experiments: [{ id: B, user_id: B, model_version: 2, status: "draft" }] } });
  for (const id of [A, B]) { const r = await f.api("draft")(request("draft", undefined, `?id=${id}`));assert.equal(r.status, 404);assert.deepEqual(await r.json(), { error: "EXPERIMENT_NOT_FOUND" }); }
});

test("status reads share the existing read budget, reject foreign/query overrides and permit Free read-only review",async()=>{
  const f=fake({premium:false,tables:{experiments:[{id:A,user_id:A,model_version:2,status:"active",config_revision:1,current_phase:"intervention"}]}});
  const response=await f.api("status")(request("status",undefined,`?id=${A}`));assert.equal(response.status,200);const body=await response.json();assert.equal(body.exposure.state,"unknown");assert.equal(body.health,"Unable to determine");assert.equal(response.headers.get("Cache-Control"),"private, no-store");
  assert.ok(f.calls.some(c=>c.name==="axvital_consume_api_budget"&&c.args?.route_key==="http/experiments/draft:GET"));
  assert.equal((await f.api("status")(request("status",undefined,`?id=${B}`))).status,404);
  assert.equal((await f.api("status")(request("status",undefined,`?id=${A}&user_id=${B}`))).status,400);
  assert.equal(f.calls.some(c=>["save_experiment_v2","start_experiment_v2"].includes(c.name)),false);
});
test("experiment attempts use strict origin, bounded streams, exact keys and distinct budgets", async () => {
  const body = { id: null, revision: 0, input: { name: "Draft" } };
  for (const origin of [null, "https://attacker.test"]) assert.equal((await fake().api("draft")(request("draft", body, "", origin))).status, 403);
  for (const bad of [{ ...body, owner: B }, { ...body, input: { name: "Draft", sql: "select 1" } }, { ...body, revision: "0" }]) assert.equal((await fake().api("draft")(request("draft", bad))).status, 400);
  const huge = { ...body, input: { name: "x".repeat(25000) } };assert.equal((await fake().api("draft")(request("draft", huge))).status, 413);
  const f = fake();const saved = await f.api("draft")(request("draft", body));assert.equal(saved.status, 201);
  assert.deepEqual(f.calls.filter(c => c.name === "axvital_consume_api_budget").map(c => c.args?.route_key), ["http/experiments/draft:POST"]);
  const publicBody = await saved.json();assert.equal(publicBody.creationRetryIdempotent, false);assert.equal(publicBody.experiment.user_id, undefined);
  const limited = await fake({ budget: false }).api("draft")(request("draft", body));assert.equal(limited.status, 429);assert.equal(limited.headers.get("Retry-After"), "60");
});
test("invalid registry versions and target combinations fail before persistence", async () => {
  for (const outcome of [{ ...energy, registry_version: "1" }, { ...energy, registry_version: 2 }, { ...energy, registry_key: "body_weight" }, { ...energy, user_condition_id: A }]) {
    const f = fake();const r = await f.api("draft")(request("draft", { id: null, revision: 0, input: { name: "Draft", outcomes: [outcome] } }));assert.equal(r.status, 400);assert.equal(f.calls.some(c => c.name === "save_experiment_v2"), false);
  }
});
test("draft envelope accepts more than the old 8 KiB limit but rejects oversized streamed and empty bodies", async () => {
  const json = JSON.stringify({ id: null, revision: 0, input: { name: "Valid draft" } });
  const raw = (text: string) => new Request("https://example.test/api/experiments/v2/draft", { method: "POST", headers: { origin: "https://example.test", "content-type": "application/json" }, body: text });
  assert.equal((await fake().api("draft")(raw(" ".repeat(9000) + json))).status, 201);
  assert.equal((await fake().api("draft")(raw(" ".repeat(24576) + json))).status, 413);
  assert.equal((await fake().api("draft")(raw(""))).status, 400);
});
test("readiness rejects client cutoff/owner fields and preserves event surveillance warnings", async () => {
  for (const extra of [{ evaluatedAt: "2020-01-01" }, { user_id: B }, { startDate: "2020-01-01" }]) {
    const r = await fake().api("readiness")(request("baseline-readiness", { outcome: energy, timeZone: "UTC", ...extra }));assert.equal(r.status, 400);
  }
  const f = fake({ tables: { user_conditions: [{ id: A, user_id: A }] } });
  const r = await f.api("readiness")(request("baseline-readiness", { outcome: { ...energy, registry_key: "condition_episode_frequency", aggregation_method: "count", user_condition_id: A }, timeZone: "UTC" }));
  const result = await r.json();assert.equal(r.status, 200);assert.equal(result.classification, "limited");assert.equal(result.recordedTotal, 0);
  assert.ok(result.warnings.includes("NO_CONDITION_SURVEILLANCE_DENOMINATOR"));assert.ok(result.warnings.includes("ZERO_RECORDED_EVENTS_NOT_VERIFIED_ABSENCE"));
});
test("safe RPC errors preserve conflicts, absent targets, limits and generic failures", async () => {
  for (const [message, status, code] of [["REVISION_CONFLICT",409,"REVISION_CONFLICT"],["INVALID_TARGET",404,"TARGET_NOT_FOUND"],["INVALID_INTERVENTION",404,"TARGET_NOT_FOUND"],["RATE_LIMITED",429,"RATE_LIMITED"],["PREMIUM_REQUIRED",403,"PREMIUM_REQUIRED"],["private health payload",503,"TEMPORARILY_UNAVAILABLE"]] as const) {
    const r = await fake({ error: message }).api("draft")(request("draft", { id: A, revision: 1, input: { name: "Draft" } }));assert.equal(r.status, status);assert.deepEqual(await r.json(), { error: code });
  }
  assert.equal(experimentError({ code: "23514", message: "secret constraint" }, true).status, 400);
});
test("readiness delegates to the existing engine and excludes internal observations", async () => {
  for (const [n, expected] of [[0,"insufficient"],[1,"limited"],[7,"good"]] as const) {
    const rows = Array.from({ length: n }, (_, i) => ({ id: String(i), user_id: A, checkin_date: `2020-01-0${i+1}`, energy_score: 7 }));
    const r = await fake({ tables: { daily_checkins: rows } }).api("readiness")(request("baseline-readiness", { outcome: energy, timeZone: "UTC", startDate: "2020-01-01", endDateExclusive: "2020-01-15" }));
    assert.equal(r.status, 200);const data = await r.json();assert.equal(data.classification, expected);assert.equal(data.observations, undefined);assert.equal(data.sourceDomain, undefined);
  }
  for (const option of [{ count: 1001 }, { failTable: "daily_checkins" }]) {
    const r = await fake(option).api("readiness")(request("baseline-readiness", { outcome: energy, timeZone: "UTC" }));const data = await r.json();assert.equal(r.status, 503);assert.equal(data.classification, null);assert.equal(data.baselineAggregate, null);
  }
});
test("target paging binds cursor to kind/search, caps pages, and delegates search to server", async () => {
  const f = fake({ targets: [{ id: A, label: "A", identity: "exercise_id", available: true }, { id: B, label: "B", identity: "exercise_id", available: true }] });
  const r = await f.api("targets")(request("targets", undefined, "?kind=exercises&search=press&limit=1"));assert.equal(r.status, 200);const page = await r.json();assert.equal(page.items.length, 1);assert.ok(page.nextCursor);
  assert.equal(f.calls.find(c => c.name === "discover_experiment_targets_v1")?.args?.search_text, "press");
  for (const query of ["?kind=exercises&limit=51", "?kind=subscriptions", `?kindkind=x`, `?kind=conditions&cursor=${page.nextCursor}`, "?kind=exercises&kind=habits"]) assert.equal((await fake().api("targets")(request("targets", undefined, query))).status, 400);
});
test("start preserves RPC revision/retry contract and rejects prospective runtime", async () => {
  const root = { id: A, user_id: A, model_version: 2, status: "active", config_revision: 2, baseline_mode: "historical" };
  const f = fake({ tables: { experiments: [root] } });
  assert.equal((await f.api("start")(request("start", { id: A, revision: 2 }))).status, 200);
  assert.deepEqual(f.calls.find(c => c.name === "start_experiment_v2")?.args, { target_id: A, expected_revision: 2 });
  assert.equal((await f.api("start")(request("start", { id: A, revision: 1 }))).status, 409);
  const prospective = fake({ tables: { experiments: [{ ...root, baseline_mode: "prospective" }] } });
  const denied = await prospective.api("start")(request("start", { id: A, revision: 2 }));assert.equal(denied.status, 409);assert.equal(prospective.calls.some(c => c.name === "start_experiment_v2"), false);
});

test("direct RPC entitlement enforcement fails closed, honors grace, and keeps internal implementations inaccessible", async t => {
  const db = await database();t.after(() => db.close());
  const as = async (owner = A) => db.exec(`reset role;select set_config('request.jwt.claim.sub','${owner}',false);set role authenticated;`);
  const save = () => db.query("select * from public.save_experiment_v2(null,0,'{\"name\":\"Draft\"}')");
  await as();await assert.rejects(save(), /PREMIUM_REQUIRED/);
  await assert.rejects(db.query("select public.start_experiment_v2($1,1)", [A]), /PREMIUM_REQUIRED/);
  await assert.rejects(db.query("select public.axvital_save_experiment_v2_internal(null,0,'{}')"), /permission denied/);
  await assert.rejects(db.query("select public.axvital_start_experiment_v2_internal($1,1)", [A]), /permission denied/);
  for (const [status, period, allowed] of [["active", null, true], ["trialing", "2099-01-01", true], ["past_due", "2099-01-01", true], ["canceled", "2099-01-01", true], ["active", "2020-01-01", false], ["past_due", null, false], ["unpaid", "2099-01-01", false]] as const) {
    await db.exec("reset role");await db.query("insert into public.subscriptions(user_id,plan,status,current_period_end) values($1,'premium',$2,$3) on conflict(user_id) do update set status=excluded.status,current_period_end=excluded.current_period_end", [A, status, period]);await as();
    if (allowed) assert.equal((await save()).rows.length, 1);else await assert.rejects(save(), /PREMIUM_REQUIRED/);
  }
  await assert.rejects(db.query("update public.subscriptions set plan='premium' where user_id=$1 returning id", [A]).then(r => { if (!r.rows.length) throw new Error("denied"); }), /denied|permission/);
  await as(B);await assert.rejects(save(), /PREMIUM_REQUIRED/);
  await db.exec("reset role;set role anon");await assert.rejects(save(), /permission denied/);
});
test("HTTP and mutation budgets use separate rows and retain account/billing limits", async t => {
  const db = await database();t.after(() => db.close());await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${A}',false)`);
  const consume = async (key: string) => (await db.query<{ ok: boolean }>("select public.axvital_consume_api_budget($1) ok", [key])).rows[0].ok;
  for (const [key, maximum] of [["http/experiments/outcomes:GET",30],["http/experiments/targets:GET",30],["http/experiments/draft:GET",30],["http/experiments/readiness:POST",12],["http/experiments/draft:POST",20],["http/experiments/start:POST",6],["experiments/draft:POST",20],["experiments/start:POST",6],["account/export:POST",2],["billing/checkout:POST",3]] as const) {
    for (let n = 0; n < maximum; n++) assert.equal(await consume(key), true, key);assert.equal(await consume(key), false, key);
  }
});
test("real target discovery searches custom/catalog labels, isolates owners and pages without writes", async t => {
  const db = await database();t.after(() => db.close());
  await db.query("insert into public.user_conditions(id,user_id,custom_condition_name) values($1,$1,'Owned condition'),($2,$2,'Foreign condition')", [A,B]);
  await db.query("insert into public.exercises(id,user_id,name,category) values($1,null,'Shared press','strength'),($2,$2,'Private press','strength')", [A,B]);
  const symptomId = (await db.query<{ id: string }>("select id from public.symptoms where is_active limit 1")).rows[0].id;
  await db.query("insert into public.user_symptoms(id,user_id,symptom_id) values($1,$1,$2)", [A,symptomId]);
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${A}',false);begin transaction read only;`);
  const search = async (kind: string, text = "", cursor: string | null = null, limit = 20) => (await db.query<{ id: string; label: string; identity: string }>("select * from public.discover_experiment_targets_v1($1,$2,$3,$4)", [kind,text,cursor,limit])).rows;
  assert.deepEqual((await search("conditions")).map(r => r.id), [A]);
  assert.deepEqual((await search("exercises", "press")).filter(r => [A,B].includes(r.id)).map(r => r.id), [A]);
  assert.equal((await search("symptoms"))[0].identity, "user_symptom_id");assert.equal((await search("catalog_symptoms"))[0].identity, "symptom_id");
  const first = await search("catalog_symptoms", "", null, 1);assert.equal(first.length, 2);
  const next = await search("catalog_symptoms", "", first[0].id, 1);assert.equal(next[0].id, first[1].id);
  assert.equal((await search("conditions", "%")).length, 0);
  for (const kind of ["habits","protocols","nutrition_patterns","target_rules","workout_templates"]) await search(kind);
  await db.exec(`rollback;set role authenticated;select set_config('request.jwt.claim.sub','${A}',false)`);await assert.rejects(search("subscriptions"), /INVALID_REQUEST/);await assert.rejects(search("conditions", "", null, 51), /INVALID_REQUEST/);
});
test("API modules use user-scoped infrastructure, thin routes and no payload logging", () => {
  for (const path of ["api.ts","targets.ts","draft-read.ts"]) {
    const code = readFileSync(new URL(path, import.meta.url), "utf8");assert.doesNotMatch(code, /service.role|supabase\/admin|console\.(log|error)|\.insert\(|\.update\(|\.delete\(/i);
  }
  for (const route of ["outcomes","targets","draft","baseline-readiness","start"]) {
    const code = readFileSync(new URL(`../../app/api/experiments/v2/${route}/route.ts`, import.meta.url), "utf8");assert.match(code, /experimentApi/);assert.match(code, /supabase\/server/);
  }
});
