import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadIntelligence } from "./load.ts";
import { activityDay } from "./model.ts";
import { dayOrdinal } from "../measurements/time-window.ts";

test("local loader preserves date-only fields and bounds date queries by the local day", async () => {
  const calls: Array<[string,string,unknown[]]> = [];
  const client = { from(table: string) {
    const query: Record<string,unknown> = {};
    for (const method of ["select","eq","is","gte","lte","order","range","or"]) query[method] = (...args: unknown[]) => { calls.push([table,method,args]); return query; };
    query.then = (resolve: (value: unknown)=>void) => resolve({error:null,data:table === "daily_checkins" ? [{id:"check",checkin_date:"2026-09-09",sleep_quality:"Poor"}] : table === "health_events" ? [{id:"legacy",event_date:"2026-09-09",event_time:"23:30:00",event_type:"note"}] : []});
    return query;
  } } as unknown as SupabaseClient;
  const zone = "America/Los_Angeles";
  const result = await loadIntelligence(client,"owner","condition",Date.parse("2026-09-10T01:00:00Z"),zone);
  assert.equal(result.timeZone,zone);
  assert.ok(result.healthEvents.every(e=>e.logicalDate === "2026-09-09" && activityDay(e,zone) === dayOrdinal("2026-09-09",zone)));
  assert.ok(calls.some(([table,method,args])=>table==="daily_checkins" && method==="lte" && args[1]==="2026-09-09"));
  assert.equal(calls.filter(([,method])=>method==="select").length,6);
});

test("loader bounds and scopes each source, preserves partial failures, and ignores stale ongoing end times", async () => {
  const calls: Array<[string, string, unknown[]]> = [];
  const client = { from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "gte", "lte", "order", "range", "or"]) query[method] = (...args: unknown[]) => { calls.push([table,method,args]); return query; };
    query.then = (resolve: (value: unknown) => void) => resolve({ error: table === "daily_checkins" ? { message: "offline" } : null, data: table === "condition_episodes" ? [{ id: "episode", started_at: "2026-09-01T00:00:00Z", ended_at: "2026-09-02T00:00:00Z", status: "ongoing", overall_severity: null }] : [] });
    return query;
  } } as unknown as SupabaseClient;
  const result = await loadIntelligence(client, "owner", "condition", Date.parse("2026-09-10T00:00:00Z"));
  assert.deepEqual(result.unavailable, ["Check-in"]);
  assert.equal(result.episodes[0].end, null);
  for (const table of new Set(calls.map(c => c[0]))) {
    assert.ok(calls.some(c => c[0] === table && c[1] === "eq" && c[2][0] === "user_id" && c[2][1] === "owner"));
    assert.ok(calls.some(c => c[0] === table && c[1] === (table === "condition_episodes" ? "or" : "gte")));
    assert.ok(calls.some(c => c[0] === table && c[1] === "lte"));
  }
  assert.ok(calls.some(c => c[1] === "eq" && c[2][0] === "user_condition_id" && c[2][1] === "condition"));
  assert.ok(result.associations.every(a => !a.sufficient && a.preEpisodeRate === null));
  assert.ok(calls.some(c => c[1] === "or" && String(c[2][0]).includes("status.eq.ongoing")));
});
