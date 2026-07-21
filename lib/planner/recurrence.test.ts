import assert from "node:assert/strict";
import test from "node:test";
import { buildOccurrenceRows, occursOnDate, shouldDeleteOccurrenceForRecurrenceEdit } from "./recurrence.ts";
import type { PlannedActivity, RecurrenceType } from "./types";

function rule(recurrence_type: RecurrenceType, extra: Partial<PlannedActivity> = {}): PlannedActivity {
  return { id: "activity", user_id: "user", title: "Test", description: null, activity_type: "habit", recurrence_type, start_date: "2026-07-20", end_date: null, scheduled_time: null, days_of_week: null, interval_days: null, is_active: true, tracking_type: "binary", target_value: null, target_unit: null, minimum_value: null, allow_partial_completion: false, habit_color: null, habit_icon: null, sort_order: null, paused_at: null, reactivated_at: null, recurrence_active_from: null, created_at: "", updated_at: "", ...extra };
}

test("one-time activity occurs only on start date", () => { assert.equal(occursOnDate(rule("none"), "2026-07-20"), true); assert.equal(occursOnDate(rule("none"), "2026-07-21"), false); });
test("daily occurs every day after start", () => assert.equal(occursOnDate(rule("daily"), "2026-07-25"), true));
test("weekdays exclude weekends", () => { assert.equal(occursOnDate(rule("weekdays"), "2026-07-24"), true); assert.equal(occursOnDate(rule("weekdays"), "2026-07-25"), false); });
test("specific days use 0 Sunday through 6 Saturday", () => { const value = rule("specific_days", { days_of_week: [2, 4] }); assert.equal(occursOnDate(value, "2026-07-21"), true); assert.equal(occursOnDate(value, "2026-07-22"), false); });
test("weekly matches start weekday", () => { assert.equal(occursOnDate(rule("weekly"), "2026-07-27"), true); assert.equal(occursOnDate(rule("weekly"), "2026-07-28"), false); });
test("interval calculates every X days", () => { const value = rule("interval", { interval_days: 3 }); assert.equal(occursOnDate(value, "2026-07-26"), true); assert.equal(occursOnDate(value, "2026-07-25"), false); });
test("nothing occurs before start", () => assert.equal(occursOnDate(rule("daily"), "2026-07-19"), false));
test("nothing occurs after end", () => assert.equal(occursOnDate(rule("daily", { end_date: "2026-07-22" }), "2026-07-23"), false));
test("occurrence generation de-duplicates activity dates", () => assert.equal(buildOccurrenceRows([rule("daily"), rule("daily")], "user", "2026-07-20", "2026-07-21").length, 2));
test("recurrence edits preserve completed and skipped history", () => { assert.equal(shouldDeleteOccurrenceForRecurrenceEdit({ status: "completed", scheduled_date: "2026-07-22" }, "2026-07-21"), false); assert.equal(shouldDeleteOccurrenceForRecurrenceEdit({ status: "skipped", scheduled_date: "2026-07-22" }, "2026-07-21"), false); assert.equal(shouldDeleteOccurrenceForRecurrenceEdit({ status: "planned", scheduled_date: "2026-07-22" }, "2026-07-21"), true); });
test("reactivation boundary prevents paused-period generation", () => { const value = rule("daily", { recurrence_active_from: "2026-07-25" }); assert.equal(occursOnDate(value, "2026-07-24"), false); assert.equal(occursOnDate(value, "2026-07-25"), true); });
test("UTC date parsing preserves the requested weekday", () => assert.equal(occursOnDate(rule("specific_days", { days_of_week: [1] }), "2026-07-20"), true));
