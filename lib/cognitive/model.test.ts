import test from "node:test";
import assert from "node:assert/strict";
import { comparisonGroups, comparisonKey, difficulties, expected, generateQuestion, GENERATOR_VERSION, operations, SCORING_VERSION, stats, TestRun, validQuestion, validateCompletion, validateConfig, type Completion, type Config } from "./model.ts";
import { activeNavigationId } from "../navigation/routes.ts";
import { normalizeRecentActivity, recentActivityFromRow } from "../dashboard/recent-activity.ts";
import { getCognitiveEvents } from "../timeline/sources/cognitive.ts";
import { filterTimeline } from "../timeline/filter.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
const id = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const config: Config = { mode: "time", value: 2, difficulty: "standard", operation: "mixed" };

test("all operations and difficulties produce bounded whole-number valid questions, including zero and maximum RNG", () => {
  for (const difficulty of Object.keys(difficulties) as Config["difficulty"][]) for (const operation of Object.keys(operations) as Config["operation"][]) {
    const c = { ...config, difficulty, operation };
    for (let i = 0; i < 2000; i++) {
      const q = generateQuestion(c, i === 0 ? () => 0 : i === 1 ? () => 0.999999999 : Math.random);
      assert.ok(validQuestion(q, c), JSON.stringify(q));
      assert.ok(Number.isInteger(expected(q)));
      if (q.operator === "/") assert.ok(q.b > 0);
    }
  }
});
test("standard preserves the reference generator, including asymmetric multiplication operand ranges", () => {
  assert.deepEqual(generateQuestion({ ...config, operation: "*" }, () => 0), { a: 0, b: 0, operator: "*" });
  const sequence = [0, 0.99999];
  assert.deepEqual(generateQuestion({ ...config, operation: "*" }, () => sequence.shift()!), { a: 0, b: 99, operator: "*" });
  assert.ok(!validQuestion({ a: 1, b: 0, operator: "/" }, config));
  assert.ok(!validQuestion({ a: 3, b: 2, operator: "/" }, config));
});
test("verified percentage scoring, zero answers, precision, and invalid inputs", () => {
  assert.deepEqual(stats(20, 15, 120000), { answered: 20, correct: 15, accuracy: 75, qpm: 10, score: 750 });
  assert.equal(stats(1, 1, 1500).qpm, 40);
  assert.equal(stats(0, 0, 120000).score, 0);
  assert.equal(stats(0, 0, 0).score, 0);
  for (const args of [[2, 3, 1000], [-1, 0, 1000], [1, 1, NaN], [1, 1, -1]]) assert.throws(() => stats(...args as [number, number, number]));
});
test("blank and malformed answers do not advance; duplicate question token is rejected", () => {
  const r = new TestRun(config, id, 1000, () => 0.5);
  for (const raw of ["", " ", "abc", "NaN", "Infinity", "1.5", "1e2", "0x10"]) assert.equal(r.submit(raw, 0, 2000), false);
  assert.equal(r.answers.length, 0);
  assert.equal(r.submit(String(expected(r.question)), 0, 2250), true);
  assert.equal(r.submit("0", 0, 2251), false);
  assert.equal(r.answers.length, 1);
  assert.equal(r.answers[0].atMs, 1250);
});
test("timed deadline stops submissions even without interval callbacks; expiry finalizes exactly once", () => {
  const r = new TestRun(config, id, 1000);
  assert.equal(r.submit("0", 0, 121000), false);
  const first = r.finished;
  assert.ok(first); assert.equal(first.elapsedMs, 120000); assert.equal(first.answers.length, 0);
  assert.equal(r.tick(900000), first);
  assert.equal(r.submit("0", 0, 900001), false);
  assert.equal(validateCompletion(first).score, 0);
});
test("count mode completes only after its configured count with actual elapsed milliseconds", () => {
  const r = new TestRun({ ...config, mode: "count", value: 20 }, id, 1000);
  for (let i = 0; i < 20; i++) {
    assert.equal(r.submit(String(expected(r.question)), i, 1100 + i * 1234), true);
    if (i < 19) assert.equal(r.finished, null);
  }
  assert.equal(r.finished!.elapsedMs, 23546);
  const saved = validateCompletion(r.finished!); assert.equal(saved.correct, 20);
  assert.equal(r.submit("0", 20, 50000), false);
});
test("abandoning never finalizes or counts further attempts", () => {
  const r = new TestRun(config, id, 1000); r.abandon();
  assert.equal(r.submit("0", 0, 2000), false); assert.equal(r.tick(999999), null);
});
test("persistence validation rejects incomplete counts, expired attempts, wrong operations/ranges and score versions", () => {
  const s: Completion = { id, config, startedAt: "2026-10-01T12:00:00.000Z", elapsedMs: 120000, answers: [], scoringVersion: SCORING_VERSION, generatorVersion: GENERATOR_VERSION };
  const a = { a: 1, b: 1, operator: "+" as const, answer: 2, atMs: 1000 };
  assert.equal(validateCompletion({ ...s, answers: [a] }).correct, 1);
  for (const bad of [{ ...s, elapsedMs: 1 }, { ...s, scoringVersion: "fraction-v1" }, { ...s, answers: [{ ...a, atMs: 120000 }] }, { ...s, config: { ...config, mode: "count" as const, value: 20 } }, { ...s, answers: [{ ...a, a: 999 }] }, { ...s, config: { ...config, operation: "*" as const }, answers: [a] }]) assert.throws(() => validateCompletion(bad));
  assert.throws(() => validateConfig({ ...config, value: 3 }));
});
test("comparisons partition by every configuration field and both scoring and question versions", () => {
  const base = validateCompletion({ id, config, startedAt: "2026-10-01T12:00:00.000Z", elapsedMs: 120000, answers: [], scoringVersion: SCORING_VERSION, generatorVersion: GENERATOR_VERSION });
  const variants = [base, ...["mode", "value", "difficulty", "operation"].map(key => ({ ...base, config: { ...base.config, [key]: key === "mode" ? "count" : key === "value" ? 5 : key === "difficulty" ? "hard" : "+" } })), { ...base, scoringVersion: "other" }, { ...base, generatorVersion: "other" }];
  assert.equal(new Set(variants.map(comparisonKey)).size, 7);
  const rows = Array.from({ length: 10 }, (_, i) => ({ ...base, id: String(i), endedAt: new Date(Date.parse(base.endedAt) + i * 1000).toISOString(), score: i }));
  const g = comparisonGroups(rows)[0]; assert.equal(g.best, 9); assert.equal(g.trend, 5);
  assert.equal(comparisonGroups(rows.slice(0, 9))[0].trend, null);
});
test("navigation stays in Track or Learn and Today's Activity identifies one saved cognitive session", () => {
  assert.equal(activeNavigationId("/cognitive-training"), "track");
  assert.equal(activeNavigationId("/cognitive-training/session"), "track");
  assert.equal(activeNavigationId("/cognitive-training/history"), "learn");
  const item = recentActivityFromRow("cognitive_session", { id, ended_at: "2026-10-01T12:02:00Z", elapsed_ms: 120000 });
  assert.equal(item[0].title, "Completed Cognitive Training");
  assert.equal(item[0].sourceId, id); assert.equal(item[0].category, "Cognitive Training");
  assert.equal(normalizeRecentActivity([...item, ...item]).length, 1);
  assert.equal(item[0].href, `/cognitive-training/results/${id}`);
});
test("Today's Activity reads completed sessions by owner and completion time, with a separate category and result link", async () => {
  const calls: unknown[][] = [];
  const query = {
    select: (columns: string) => { calls.push(["select", columns]); return query; },
    eq: (column: string, value: string) => { calls.push(["eq", column, value]); return query; },
    gte: (column: string, value: string) => { calls.push(["gte", column, value]); return query; },
    lt: (column: string, value: string) => { calls.push(["lt", column, value]); return query; },
    order: () => query, limit: () => query,
    abortSignal: async () => ({ data: [{ id, config, ended_at: "2026-10-01T12:02:00Z", elapsed_ms: 120000 }], error: null }),
  };
  const client = { from: (table: string) => { calls.push(["table", table]); return query; } } as unknown as SupabaseClient;
  const events = await getCognitiveEvents({ client, userId: "owner", start: "2026-10-01T00:00:00Z", end: "2026-10-02T00:00:00Z", startDate: "2026-10-01", endDate: "2026-10-01" });
  assert.equal(events.length, 1); assert.equal(events[0].id, `cognitive_session:${id}`);
  assert.equal(events[0].title, "Completed Cognitive Training"); assert.equal(events[0].eventType, "cognitive_training");
  assert.equal(events[0].occurredAt, "2026-10-01T12:02:00Z"); assert.equal(events[0].detailHref, `/cognitive-training/results/${id}`);
  assert.deepEqual(events[0].metadata, { durationMinutes: 2 });
  assert.deepEqual(filterTimeline(events, "activity"), events);
  assert.deepEqual(filterTimeline(events, "routines"), []); assert.deepEqual(filterTimeline(events, "health"), []);
  assert.ok(calls.some(c => c.join(":") === "eq:user_id:owner"));
  assert.ok(calls.some(c => c.join(":") === "gte:ended_at:2026-10-01T00:00:00Z"));
  assert.ok(!calls.some(c => String(c[1]).includes("score")));
});
