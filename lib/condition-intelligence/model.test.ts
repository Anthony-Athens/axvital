import test from "node:test";
import assert from "node:assert/strict";
import { DAY, metrics, lookback, summarizeLookback, aggregateActivity, type Episode } from "./model.ts";
const start = Date.parse("2025-12-30T12:00:00Z");
const e = (offset: number, end: number | null = null, severity: number | null = null): Episode => ({ id: String(offset), start: start + offset * DAY, end: end === null ? null : start + end * DAY, severity });
test("empty and one-episode metrics preserve missing data", () => {
  assert.equal(metrics([], start).since, null);
  const result = metrics([e(0)], start + DAY);
  assert.equal(result.interval, null); assert.equal(result.duration, null); assert.equal(result.severity, null); assert.equal(result.since, 1);
});
test("average intervals cross month and year boundaries and sort input", () => {
  const result = metrics([e(34), e(0), e(4)], start + 40 * DAY);
  assert.equal(result.interval, 17); assert.equal(result.since, 6);
});
test("duration excludes ongoing and invalid episodes; latest completion uses end time", () => {
  const result = metrics([e(0, 10, 2), e(4, 6, 8), e(12), e(13, 12)], start + 15 * DAY);
  assert.equal(result.duration, 6); assert.equal(result.recentDuration, 10); assert.equal(result.severity, 5); assert.equal(result.recentSeverity, null);
});
test("lookback includes lower boundary and excludes onset", () => {
  const window = lookback(start); assert.equal(window.start, start - 7 * DAY);
  const events = [window.start - 1, window.start, start - 1, start].map((at,i) => ({ id: String(i), at, category: "Workout" }));
  assert.deepEqual(summarizeLookback(e(0), events), [["Workout", 2]]);
});
test("date-only records exclude onset day and include seven prior calendar days", () => {
  const events = ["2025-12-23", "2025-12-29", "2025-12-30"].map(id => ({ id, at: Date.parse(`${id}T00:00:00Z`), category: "Check-in", dateOnly: true }));
  assert.deepEqual(summarizeLookback(e(0), events), [["Check-in", 2]]);
});
test("activity ticks aggregate by day and category", () => {
  assert.equal(aggregateActivity([{ id: "1", at: start, category: "Nutrition" }, { id: "2", at: start + 1, category: "Nutrition" }])[0].count, 2);
});
