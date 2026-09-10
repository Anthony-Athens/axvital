import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadIntelligence } from "./load.ts";

test("loader bounds and scopes each source, preserves partial failures, and ignores stale ongoing end times", async () => {
  const calls: Array<[string, string, unknown[]]> = [];
  const client = { from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "gte", "lte", "order", "range"]) query[method] = (...args: unknown[]) => { calls.push([table,method,args]); return query; };
    query.then = (resolve: (value: unknown) => void) => resolve({ error: table === "daily_checkins" ? { message: "offline" } : null, data: table === "condition_episodes" ? [{ id: "episode", started_at: "2026-09-01T00:00:00Z", ended_at: "2026-09-02T00:00:00Z", status: "ongoing", overall_severity: null }] : [] });
    return query;
  } } as unknown as SupabaseClient;
  const result = await loadIntelligence(client, "owner", "condition", Date.parse("2026-09-10T00:00:00Z"));
  assert.deepEqual(result.unavailable, ["Check-in"]);
  assert.equal(result.episodes[0].end, null);
  for (const table of new Set(calls.map(c => c[0]))) {
    assert.ok(calls.some(c => c[0] === table && c[1] === "eq" && c[2][0] === "user_id" && c[2][1] === "owner"));
    assert.ok(calls.some(c => c[0] === table && c[1] === "gte"));
    assert.ok(calls.some(c => c[0] === table && c[1] === "lte"));
  }
  assert.ok(calls.some(c => c[1] === "eq" && c[2][0] === "user_condition_id" && c[2][1] === "condition"));
});
