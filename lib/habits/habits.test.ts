import assert from "node:assert/strict";
import test from "node:test";
import { calculateHabitProgress, derivedOccurrenceStatus, reopenProgressFields } from "./progress.ts";
import { calculateBestStreak, calculateCurrentStreak } from "./streaks.ts";
import { calculateMonthlyAdherence, calculateWeeklyAdherence } from "./analytics.ts";

const binary = { tracking_type: "binary" as const, target_value: null, minimum_value: null, allow_partial_completion: false };
const quantity = { tracking_type: "quantity" as const, target_value: 100, minimum_value: null, allow_partial_completion: true };
const occurrence = (date: string, status: "planned" | "completed" | "skipped", actual_value: number | null = null) => ({ scheduled_date: date, status, actual_value });

test("binary completion is 100 percent", () => assert.deepEqual(calculateHabitProgress(binary, null, true), { status: "completed", completionPercentage: 100, minimumReached: false }));
test("quantity calculates partial progress", () => assert.equal(calculateHabitProgress(quantity, 50).completionPercentage, 50));
test("quantity completes at target", () => assert.equal(calculateHabitProgress(quantity, 100).status, "completed"));
test("minimum value completes below target", () => { const result = calculateHabitProgress({ ...quantity, minimum_value: 60 }, 60); assert.equal(result.status, "completed"); assert.equal(result.minimumReached, true); });
test("duration calculates progress", () => assert.equal(calculateHabitProgress({ ...quantity, tracking_type: "duration", target_value: 30 }, 20).completionPercentage, 20 / 30 * 100));
test("percentage may exceed 100", () => assert.equal(calculateHabitProgress(quantity, 125).completionPercentage, 125));
test("reopening clears current timestamps and preserves first completion", () => assert.deepEqual(reopenProgressFields("2026-07-20T12:00:00Z", "2026-07-21T12:00:00Z"), { status: "planned", completed_at: null, skipped_at: null, completion_percentage: null, first_completed_at: "2026-07-20T12:00:00Z", last_updated_at: "2026-07-21T12:00:00Z" }));
test("past planned is derived missed", () => assert.equal(derivedOccurrenceStatus(occurrence("2026-07-20", "planned"), "2026-07-21"), "missed"));
test("partial past progress is derived partial", () => assert.equal(derivedOccurrenceStatus(occurrence("2026-07-20", "planned", 20), "2026-07-21"), "partial"));
test("scheduled occurrence rows alone determine streak", () => assert.equal(calculateCurrentStreak([occurrence("2026-07-18", "completed"), occurrence("2026-07-20", "completed")], "2026-07-20"), 2));
test("unscheduled dates do not break streaks", () => assert.equal(calculateBestStreak([occurrence("2026-07-13", "completed"), occurrence("2026-07-20", "completed")]), 2));
test("planned today does not break current streak", () => assert.equal(calculateCurrentStreak([occurrence("2026-07-20", "completed"), occurrence("2026-07-21", "planned")], "2026-07-21"), 1));
test("skipped is not completed", () => assert.equal(calculateCurrentStreak([occurrence("2026-07-20", "completed"), occurrence("2026-07-21", "skipped")], "2026-07-21"), 0));
test("current streak stops at missed occurrence", () => assert.equal(calculateCurrentStreak([occurrence("2026-07-19", "completed"), occurrence("2026-07-20", "planned"), occurrence("2026-07-21", "completed")], "2026-07-21"), 1));
test("best streak finds longest run", () => assert.equal(calculateBestStreak([occurrence("2026-07-17", "completed"), occurrence("2026-07-18", "completed"), occurrence("2026-07-19", "skipped"), occurrence("2026-07-20", "completed")]), 2));
test("weekly adherence includes skipped and missed in denominator", () => assert.deepEqual(calculateWeeklyAdherence([occurrence("2026-07-20", "completed"), occurrence("2026-07-21", "skipped"), occurrence("2026-07-22", "planned")], "2026-07-20", "2026-07-23"), { scheduled: 3, completed: 1, skipped: 1, missed: 1, percentage: 33 }));
test("monthly adherence uses bounded dates", () => assert.equal(calculateMonthlyAdherence([occurrence("2026-06-30", "completed"), occurrence("2026-07-01", "completed"), occurrence("2026-07-02", "planned")], "2026-07-01", "2026-07-03").percentage, 50));
test("existing records behave as binary defaults", () => assert.equal(calculateHabitProgress(binary, null, false).status, "planned"));
