import assert from "node:assert/strict";
import test from "node:test";
import {
  checkinStreak,
  scoreTrend,
  sleepSummary,
  windowDates,
  type SummaryRow,
} from "./summary.ts";

const row = (date: string, energy: number | null, sleep: string | null = null): SummaryRow => ({
  checkin_date: date,
  energy_score: energy,
  mood_score: energy,
  sleep_quality: sleep,
});

test("windows are calendar days ending today, oldest first, across month boundaries", () => {
  assert.deepEqual(windowDates("2026-11-03"), [
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
    "2026-11-02",
    "2026-11-03",
  ]);
  assert.equal(windowDates("2026-11-03", 7, 7)[6], "2026-10-27");
});

test("score trend averages logged days only and compares with the previous week", () => {
  const rows = [
    row("2026-11-12", 8),
    row("2026-11-10", 7),
    row("2026-11-07", 6),
    row("2026-11-05", 6),
    row("2026-11-04", 5),
  ];
  const trend = scoreTrend(rows, "2026-11-12", "energy_score");
  // Current week Nov 6–12: 6, 7, 8. Previous week Oct 30–Nov 5: 5, 6.
  assert.equal(trend.average, 7);
  assert.equal(trend.previous, 5.5);
  assert.equal(trend.delta, 1.5);
  assert.deepEqual(trend.series, [null, 6, null, null, 7, null, 8]);
});

test("no history yields nulls rather than zeros", () => {
  const trend = scoreTrend([], "2026-11-12", "mood_score");
  assert.equal(trend.average, null);
  assert.equal(trend.delta, null);
  assert.deepEqual(trend.series, Array(7).fill(null));
});

test("sleep summary picks the most frequent rating, ties go to the better one", () => {
  const rows = [
    row("2026-11-12", 7, "Good"),
    row("2026-11-11", 7, "Great"),
    row("2026-11-10", 7, "Good"),
    row("2026-11-09", 7, "Great"),
    row("2026-11-08", 7, "Poor"),
  ];
  const s = sleepSummary(rows, "2026-11-12");
  assert.equal(s.typical, "Great");
  assert.deepEqual(s.series, [0, 0, 1, 4, 3, 4, 3]);
  assert.equal(sleepSummary([], "2026-11-12").typical, null);
});

test("streak counts back from today, or from yesterday before today's check-in", () => {
  const rows = [row("2026-11-11", 7), row("2026-11-10", 7), row("2026-11-08", 7)];
  assert.equal(checkinStreak(rows, "2026-11-12"), 2);
  assert.equal(checkinStreak([...rows, row("2026-11-12", 7)], "2026-11-12"), 3);
  assert.equal(checkinStreak([], "2026-11-12"), 0);
});
