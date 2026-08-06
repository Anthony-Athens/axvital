import assert from "node:assert/strict";
import test from "node:test";
import { filterCatalog, validateConditionInput } from "./conditions.ts";
import type { CatalogCondition } from "./types.ts";

const catalog: CatalogCondition[] = [
  { id: "ms", category_id: "neuro", slug: "multiple-sclerosis", name: "Multiple Sclerosis", short_name: "MS", description: null, common_aliases: ["multiple sclerosis"], is_featured: true, display_order: 1, category: { slug: "neurological", name: "Neurological" } },
  { id: "hsv", category_id: "infectious", slug: "hsv-1", name: "Herpes Simplex Virus Type 1", short_name: "HSV-1", description: null, common_aliases: ["oral herpes"], is_featured: true, display_order: 1, category: { slug: "infectious", name: "Infectious" } },
  { id: "sleep-apnea", category_id: "respiratory", slug: "sleep-apnea", name: "Sleep Apnea", short_name: null, description: null, common_aliases: ["sleep apnoea"], is_featured: true, display_order: 1, category: { slug: "respiratory", name: "Respiratory" } },
  { id: "ibs", category_id: "gastrointestinal", slug: "irritable-bowel-syndrome", name: "Irritable Bowel Syndrome", short_name: "IBS", description: null, common_aliases: ["irritable bowel"], is_featured: true, display_order: 1, category: { slug: "gastrointestinal", name: "Gastrointestinal" } },
];

test("catalog search matches official name, abbreviation, alias, and category", () => {
  assert.equal(filterCatalog(catalog, "", "multiple")[0]?.id, "ms");
  assert.equal(filterCatalog(catalog, "", "MS")[0]?.id, "ms");
  assert.equal(filterCatalog(catalog, "", "Sleep Apnea")[0]?.id, "sleep-apnea");
  assert.equal(filterCatalog(catalog, "", "IBS")[0]?.id, "ibs");
  assert.equal(filterCatalog(catalog, "", "herpes")[0]?.id, "hsv");
  assert.equal(filterCatalog(catalog, "", "neurological")[0]?.id, "ms");
});

test("category filter limits catalog", () => assert.deepEqual(filterCatalog(catalog, "infectious", "").map((item) => item.id), ["hsv"]));
test("condition input requires exactly one source", () => {
  assert.ok(validateConditionInput({ status: "active" }, 2026));
  assert.ok(validateConditionInput({ conditionId: "a", customName: "Custom", status: "active" }, 2026));
  assert.equal(validateConditionInput({ customName: "Custom", status: "monitoring" }, 2026), null);
});
test("condition input validates dates, years, and notes", () => {
  assert.ok(validateConditionInput({ conditionId: "a", status: "active", diagnosedYear: 2027 }, 2026));
  assert.ok(validateConditionInput({ conditionId: "a", status: "active", notes: "x".repeat(2001) }, 2026));
  assert.equal(validateConditionInput({ conditionId: "a", status: "resolved", diagnosedYear: 2020 }, 2026), null);
});
