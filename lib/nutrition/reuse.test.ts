import assert from "node:assert/strict";
import test from "node:test";
import { rankFrequentFoods, rankRecentFoods, resolveTargets } from "./reuse.ts";

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
