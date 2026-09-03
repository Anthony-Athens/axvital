import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { activityTimestamp, loadRecentActivity, normalizeRecentActivity, recentActivityFromRow } from "./recent-activity.ts";

const at = "2026-09-03T12:00:00Z";
const make = (source: string, row: Record<string, unknown>) => recentActivityFromRow(source, { id: "one", created_at: at, ...row });
test("sorts actual instants newest first, including mixed offsets", () => {
  const items = [...make("nutrition_entry", { id: "food", consumed_at: "2026-09-03T10:00:00-04:00" }), ...make("symptom_event", { id: "symptom", started_at: "2026-09-03T13:00:00Z" })];
  assert.deepEqual(normalizeRecentActivity(items).map(x => x.sourceId), ["food", "symptom"]);
});
test("workout completion uses end time and suppresses its planner mirror by stable relation", () => {
  const workout = make("workout_session", { name: "CB1 - L1", status: "completed", started_at: "2026-09-02T23:00:00Z", ended_at: at, planned_activity_occurrence_id: "occ" });
  const mirror = make("planned_activity_occurrence", { id: "occ", status: "completed", completed_at: at, planned_activity: { id: "a", title: "Different text", activity_type: "habit" } });
  const result = normalizeRecentActivity([...mirror, ...workout, ...workout]);
  assert.equal(result.length, 1);
  assert.equal(result[0].category, "Workout");
  assert.equal(result[0].occurredAt, at);
  assert.equal(result[0].title, "Completed CB1 - L1");
});
test("workout planner metadata never becomes a habit, even when protocol-linked", () => {
  for (const protocol of [null, "p"]) assert.deepEqual(make("planned_activity_occurrence", { status: "completed", completed_at: at, planned_activity: { activity_type: "workout", user_protocol_id: protocol } }), []);
});
test("real habits and protocol actions stay distinct, including identical names", () => {
  const rows = [null, "p"].flatMap((protocol, i) => make("planned_activity_occurrence", { id: String(i), status: "completed", completed_at: at, planned_activity: { id: "habit", title: "Morning Walk", activity_type: "habit", user_protocol_id: protocol } }));
  const result = normalizeRecentActivity([...rows, ...rows]);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(x => x.category), ["Habit", "Protocol"]);
});
test("one food, supplement and symptom record each yields one item; similar names never merge", () => {
  const rows = [...make("nutrition_entry", { title: "Same", consumed_at: at, items: [{ source_name: "Same" }, { source_name: "Other" }] }), ...make("health_event", { title: "Same", event_type: "supplement", event_date: "2026-09-03", event_time: "12:00:00", dose_amount: 5, dose_unit: "g" }), ...make("symptom_event", { custom_symptom_name: "Same", started_at: at, severity: 0 })];
  assert.equal(normalizeRecentActivity([...rows, ...rows]).length, 3);
  assert.equal(rows[1].detail, "5 g");
  assert.equal(rows[2].detail, "Severity 0");
});
test("timestamp fallback prefers occurrence, then created; invalid optional values stay unknown", () => {
  assert.equal(activityTimestamp(at, "2020-01-01T00:00:00Z"), at);
  assert.equal(activityTimestamp("bad", at), at);
  assert.equal(activityTimestamp(null, null), null);
  const item = make("nutrition_entry", { consumed_at: null })[0];
  assert.equal(item.occurredAt, at);
  assert.equal(item.detail, null);
  assert.equal(item.title, "Logged food");
});
test("check-ins keep the logical day without invented noon or later update times", () => {
  const item = make("daily_checkin", { checkin_date: "2026-09-01", updated_at: at })[0];
  assert.equal(item.logicalDate, "2026-09-01");
  assert.equal(item.occurredAt, null);
  assert.deepEqual(make("daily_checkin", { checkin_date: "2026-02-30" }), []);
});
test("date-only health logs have no artificial clock; local late-night events keep their day", () => {
  const item = make("health_event", { event_type: "fluid", event_date: "2026-09-02", title: "Water" })[0];
  assert.equal(item.logicalDate, "2026-09-02");
  assert.equal(item.occurredAt, null);
  const local = make("health_event", { event_type: "note", event_date: "2026-09-02", event_time: "23:59:00" })[0];
  assert.equal(new Date(local.occurredAt!).getDate(), 2);
});
test("episode start/resolution are separate facts and abandoned workout is not completed", () => {
  const row = { started_at: at, ended_at: "2026-09-03T14:00:00Z" };
  assert.equal(normalizeRecentActivity([...make("condition_episode", row), ...make("condition_episode", { ...row, activity_phase: "resolved" })]).length, 2);
  const workout = make("workout_session", { ...row, status: "abandoned" })[0];
  assert.equal(workout.title, "Ended workout");
  assert.equal(workout.detail, "Workout abandoned");
});
test("recent results are bounded and one source failure does not erase other activity", async () => {
  const limits: number[] = [], tables: string[] = [];
  const client = { auth: { getUser: async () => ({ data: { user: { id: "u" } }, error: null }) }, from: (table: string) => {
    tables.push(table);
    const query = { select: () => query, eq: () => query, gte: () => query, lt: () => query, lte: () => query, order: () => query, is: () => query, neq: () => query, in: () => query, limit: (n: number) => { limits.push(n); return query; }, then: (resolve: (result: unknown) => unknown) => resolve({ data: table === "nutrition_entries" ? [{ id: "food", consumed_at: at }] : [], error: table === "health_events" ? { message: "private database error" } : null }) };
    return query;
  } } as unknown as SupabaseClient;
  const result = await loadRecentActivity(client, { start: at, end: "2026-09-04T00:00:00Z", startDate: "2026-09-03", endDate: "2026-09-03" });
  assert.equal(tables.length, 12);
  assert.ok(limits.every(n => n === 40));
  assert.deepEqual(result.failedSources, ["health_event"]);
  assert.equal(result.items[0].category, "Nutrition");
  assert.equal(normalizeRecentActivity(Array.from({ length: 20 }, (_, i) => ({ ...result.items[0], id: String(i), sourceId: String(i) }))).length, 12);
});
