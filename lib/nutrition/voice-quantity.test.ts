import test from "node:test";
import assert from "node:assert/strict";
import { validateExtraction } from "../voice/schema.ts";
import { foodIdentity, parseIntake, normalizeServingUnit, nutritionDraft, nutritionPreview } from "./voice-nutrition.ts";
import { provisionalFood } from "./food-resolution.ts";
import type { Serving } from "./nutrition.ts";

export function extracted(title: string, fragment: string, patch: Record<string, unknown> = {}) {
  return validateExtraction({ events: [{ event_type: "food", title, source_fragment: fragment,
    amount: null, food_quantity: null, food_unit: null, dose_amount: null, dose_unit: null,
    duration_minutes: null, distance: null, distance_unit: null, intensity: null, severity: null,
    notes: null, time_expression: null, ...patch }] }, fragment, new Date("2026-09-25T12:00:00Z"), "UTC")[0];
}
export const examples = [
  ["three eggs", "eggs", 3, "each", "egg", 3],
  ["2 eggs", "eggs", 2, "each", "egg", 2],
  ["six ounces of chicken breast", "chicken breast", 6, "oz", "chicken-breast-cooked", 1.5],
  ["one cup of Greek yogurt", "Greek yogurt", 1, "cup", "greek-yogurt", 1],
  ["half a cup of oatmeal", "oatmeal", 0.5, "cup", "oatmeal", 0.5],
  ["one and a half cups of rice", "rice", 1.5, "cup", "white-rice-cooked", 1.5],
  ["two slices of pepperoni pizza", "pepperoni pizza", 2, "slice", "pepperoni-pizza", null],
] as const;
test("quantity identity and normalized units survive strict extraction, including amount omitted and title-only quantities", () => {
  for (const [phrase, identity, quantity, unit] of examples) {
    const fragment = `I ate ${phrase}.`;
    assert.equal(foodIdentity(phrase), identity);
    for (const title of [phrase, identity]) {
      const candidate = extracted(title, fragment, { food_quantity: quantity, food_unit: unit });
      assert.equal(candidate.event.title, identity);
      assert.deepEqual(candidate.intake, { quantity, unit, meal_type: null });
      assert.deepEqual(extracted(title, fragment).intake, candidate.intake, "deterministic repair of omitted model quantity");
    }
  }
  assert.throws(() => extracted("eggs", "I ate three eggs.", { food_quantity: 1 }), /INVALID_AI_RESPONSE/);
  assert.throws(() => extracted("eggs", "I ate three eggs.", { food_unit: "cup" }), /INVALID_AI_RESPONSE/);
  assert.throws(() => extracted("eggs", "I ate three eggs and two cups of rice.", { amount: "two cups" }), /INVALID_AI_RESPONSE/);
  for (const phrase of ["6 oz chicken breast", "six ounces chicken breast"]) {
    assert.equal(foodIdentity(phrase), "chicken breast");
    assert.deepEqual(extracted(phrase, `I ate ${phrase}.`).intake, { quantity: 6, unit: "oz", meal_type: null });
  }
  assert.deepEqual(extracted("eggs", "I ate two bowls of eggs.").intake, { quantity: 2, unit: "bowls", meal_type: null });
});
test("unit normalization, count semantics, unsupported amounts and ambiguous drinks stay safe", () => {
  for (const [variants, normalized] of [[['ounce','ounces','oz'],'oz'],[['gram','grams','g'],'g'],[['cup','cups'],'cup'],[['tablespoon','tablespoons','tbsp'],'tbsp'],[['teaspoon','teaspoons','tsp'],'tsp'],[['slice','slices'],'slice'],[['item','items','each'],'each'],[['milliliter','milliliters','ml'],'ml']] as const)
    for (const unit of variants) assert.equal(normalizeServingUnit(unit), normalized);
  const serving = { id: "serving", food_id: "food", serving_unit: "each", serving_quantity: 1, calories: 100, is_default: true, display_order: 0 } as Serving;
  const bread = { ...provisionalFood("bread"), food_id: "food", method: "exact" as const };
  assert.equal(nutritionPreview(bread, nutritionDraft(bread, [{ ...serving, serving_unit: "slice" }], null, "I ate two slices of bread."))?.multiplier, 2);
  for (const label of ["bananas", "apples", "protein bars"]) {
    const food = { ...provisionalFood(label), food_id: "food", method: "exact" as const };
    const draft = nutritionDraft(food, [serving], null, `I ate 2 ${label}.`);
    assert.equal(draft.quantity, 2); assert.equal(draft.unit, "each");
    assert.equal(nutritionPreview(food, draft)?.multiplier, 2);
    assert.equal(nutritionPreview(food, nutritionDraft(food, [{ ...serving, serving_unit: "cup" }], null, `I ate 2 ${label}.`)), null);
    assert.equal(nutritionPreview(food, nutritionDraft(food, [serving], "2 bowls")), null);
  }
  for (const [label, phrase] of [["chicken", "I ate chicken."], ["yogurt", "I had some yogurt."], ["milk", "I drank ounces of milk."]]) assert.equal(parseIntake(null, label, phrase).quantity, null);
  assert.deepEqual(parseIntake(null, "milk", "I drank 12 ounces of milk."), { quantity: 12, unit: null, meal_type: null });
  assert.equal(parseIntake(null, "milk", "I drank 12 fluid ounces of milk.").unit, "fl oz");
  assert.equal(foodIdentity("7 Up"), "7 Up");
});
