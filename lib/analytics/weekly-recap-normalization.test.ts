import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWeeklyRecap } from "./normalizeWeeklyRecap.ts";

const persistedRecap = {
  week_start: "2026-08-10",
  week_end: "2026-08-16",
  generated_at: "2026-08-17T00:00:00.000Z",
  analysis_version: "2",
};

test("normalizes nullable and missing optional persisted sections", () => {
  const recap = normalizeWeeklyRecap({
    ...persistedRecap,
    wins: null,
    changes: [],
    patterns: null,
    next_week_focus: null,
  });

  assert.ok(recap);
  assert.deepEqual(recap.wins, []);
  assert.deepEqual(recap.changes, []);
  assert.deepEqual(recap.patterns, []);
  assert.deepEqual(recap.symptoms, []);
  assert.deepEqual(recap.experiments, []);
  assert.equal(recap.nextWeekFocus, null);
});

test("preserves valid historical snake-case sections", () => {
  const recap = normalizeWeeklyRecap({
    ...persistedRecap,
    summary_metrics: [{ label: "Check-ins", value: "7" }],
    wins: [{ title: "Consistent", description: "Seven check-ins." }],
    next_week_focus: { title: "Keep going", description: "Repeat the routine." },
  });

  assert.ok(recap);
  assert.equal(recap.summaryMetrics[0]?.value, "7");
  assert.equal(recap.wins[0]?.title, "Consistent");
  assert.equal(recap.nextWeekFocus?.title, "Keep going");
});

test("accepts the normalized camel-case API shape", () => {
  const recap = normalizeWeeklyRecap({
    weekStart: "2026-08-10",
    weekEnd: "2026-08-16",
    generatedAt: "2026-08-17T00:00:00.000Z",
    analysisVersion: "2",
    summaryMetrics: [],
    symptoms: [],
    experiments: [],
    nextWeekFocus: null,
  });

  assert.ok(recap);
  assert.equal(recap.weekStart, "2026-08-10");
  assert.equal(recap.nextWeekFocus, null);
});

test("drops malformed optional data without fabricating a focus", () => {
  const recap = normalizeWeeklyRecap({
    ...persistedRecap,
    wins: [null, {}, { title: "Missing description" }],
    next_week_focus: { title: "Incomplete" },
  });

  assert.ok(recap);
  assert.deepEqual(recap.wins, []);
  assert.equal(recap.nextWeekFocus, null);
});
