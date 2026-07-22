import assert from "node:assert/strict";
import test from "node:test";
import { colors, todaySectionOrder } from "./design-tokens.ts";

test("blue is the primary brand palette", () => { assert.equal(colors.blue[600], "#2563EB"); assert.equal(colors.blue[500], "#3B82F6"); assert.equal(colors.blue[700], "#1D4ED8"); assert.equal(colors.blue[100], "#DBEAFE"); assert.equal(colors.blue[50], "#EFF6FF"); });
test("slate tokens define application surfaces and text", () => { assert.equal(colors.slate[50], "#F8FAFC"); assert.equal(colors.slate[900], "#0F172A"); assert.equal(colors.slate[950], "#020617"); assert.equal(colors.slate[200], "#E2E8F0"); });
test("semantic success remains distinct from the blue brand", () => { assert.notEqual(colors.semantic.success, colors.blue[600]); assert.equal(colors.semantic.success, "#059669"); });
test("Today prioritizes status and plan before optional forms", () => { assert.deepEqual(todaySectionOrder, ["header", "summary", "plan", "checkin", "events", "timeline"]); });
