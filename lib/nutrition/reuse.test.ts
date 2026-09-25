import assert from "node:assert/strict";
import test from "node:test";
import { rankFrequentFoods, rankRecentFoods, resolveTargets, totalKnownNutrition } from "./reuse.ts";
import type { Entry } from "./nutrition.ts";

test("incomplete voice intake marks totals unknown without fabricating zero-nutrient consumption", () => {
  const entries = [{ items: [{ calories: 216, protein_grams: 18.9, carbohydrate_grams: 1.2, fat_grams: 14.4 }] }, { nutrition_status: "incomplete", items: [] }] as Entry[];
  const total = totalKnownNutrition(entries);
  assert.equal(total.calories, 216); assert.equal(total.protein_grams, 18.9);
  assert.ok(total.incomplete.has("calories")); assert.ok(total.incomplete.has("protein_grams"));
});

const uses = [
  { key: "global:a", name: "Apple", usedAt: "2026-08-01T10:00:00Z" },
  { key: "global:b", name: "Banana", usedAt: "2026-08-02T10:00:00Z" },
  { key: "global:a", name: "Apple", usedAt: "2026-08-03T10:00:00Z" },
];
test("recent foods are deduplicated and use latest authoritative log", () => {
  assert.deepEqual(rankRecentFoods(uses).map((food) => food.key), ["global:a", "global:b"]);
});
test("frequent foods use count then recency", () => {
  assert.equal(rankFrequentFoods(uses, "2026-07-01")[0]?.count, 2);
});
test("target resolution uses effective range, priority, then creation time", () => {
  const base = { target_type: "protein", target_value: 100, unit: "g", source_type: "user", starts_on: null, ends_on: null };
  const targets = [
    { ...base, id: "low", priority: 0, created_at: "2026-01-01" },
    { ...base, id: "high", priority: 2, created_at: "2026-01-01" },
    { ...base, id: "future", priority: 4, starts_on: "2027-01-01", created_at: "2026-01-01" },
  ];
  assert.equal(resolveTargets(targets, "2026-08-06")[0]?.id, "high");
});
