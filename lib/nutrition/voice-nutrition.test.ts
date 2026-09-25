import test from "node:test";
import assert from "node:assert/strict";
import { parseIntake, servingMultiplier, nutritionDraft, nutritionPreview, resolveNutritionFood } from "./voice-nutrition.ts";
import { provisionalFood, type FoodCatalog } from "./food-resolution.ts";
import { scaleNutrition, type Serving } from "./nutrition.ts";
import { voiceNutritionRows } from "./ingestion.ts";
import type { VoiceCandidate } from "../voice/schema.ts";

const id = "00000000-0000-4000-8000-000000000001", servingId = "00000000-0000-4000-8000-000000000002";
const egg: Serving = { id: servingId, food_id: id, serving_name: "1 large", serving_quantity: 1, serving_unit: "each", grams_equivalent: 50, is_default: true, display_order: 0, calories: 72, protein_grams: 6.3, carbohydrate_grams: 0.4, fat_grams: 4.8 };
const catalog: FoodCatalog = { foods: [{ id, name: "Egg", aliases: ["eggs", "whole egg"], categories: [] }], components: [] };
test("spoken quantities and existing servings produce the same manual and voice macros", () => {
  const food = resolveNutritionFood("eggs", "I had three eggs for breakfast", catalog, [egg]);
  const draft = nutritionDraft(food, [egg], "three eggs", "I had three eggs for breakfast");
  assert.equal(draft.quantity, 3); assert.equal(draft.unit, "each"); assert.equal(draft.meal_type, "breakfast");
  assert.deepEqual(nutritionPreview(food, draft)?.nutrients, scaleNutrition(egg, 3));
  assert.equal(nutritionPreview(food, draft)?.nutrients.calories, 216);
  const chicken = { ...egg, serving_quantity: 4, serving_unit: "oz", grams_equivalent: 113, calories: 187 };
  assert.equal(servingMultiplier(chicken, 6, "ounces"), 1.5);
  assert.equal(servingMultiplier(chicken, 226, "grams"), 2);
  const yogurt = { ...egg, serving_quantity: 1, serving_unit: "cup", grams_equivalent: 227, calories: 130 };
  assert.equal(servingMultiplier(yogurt, 1, "cup"), 1);
  assert.equal(servingMultiplier(yogurt, 8, "fl oz"), 1);
  assert.equal(servingMultiplier(yogurt, 1, "bowl"), null);
  assert.equal(servingMultiplier(egg, null, "each"), null);
  assert.equal(parseIntake(null, "chicken", "I ate chicken then took 5 grams creatine").quantity, null);
  assert.equal(parseIntake("one cup", "Greek yogurt").unit, "cup");
  assert.equal(parseIntake("six ounces", "chicken breast").quantity, 6);
});
test("serving-backed resolution takes priority, keeps mapped metadata and never fabricates a serving", () => {
  const taxonomy = { id: "00000000-0000-4000-8000-000000000003", name: "Whole egg", aliases: [], categories: [] };
  const combined = { ...catalog, foods: [taxonomy, ...catalog.foods] };
  assert.equal(resolveNutritionFood("Whole egg", "Whole egg", combined, [egg]).food_id, id);
  const duplicateName = { ...catalog, foods: [{ ...taxonomy, name: "Egg" }, ...catalog.foods] };
  assert.equal(resolveNutritionFood("Egg", "Egg", duplicateName, [egg]).food_id, id, "serving-backed identity survives duplicate taxonomy names");
  assert.equal(resolveNutritionFood("  EGG ", "EGG", catalog, [egg]).food_id, id);
  const missing = resolveNutritionFood("Unlisted stew", "Unlisted stew", catalog, [egg]);
  assert.equal(missing.method, "provisional"); assert.equal(nutritionDraft(missing, [egg]).servings.length, 0);
  const mapped = resolveNutritionFood("Whole egg", "Whole egg", { ...catalog, foods: [taxonomy] }, [egg]);
  assert.equal(mapped.food_id, taxonomy.id); assert.equal(nutritionDraft(mapped, [egg], "one").serving_id, null);
  const pizzaCatalog = { ...catalog, foods: [{ ...catalog.foods[0], name: "Pepperoni Pizza", aliases: [] }] };
  assert.equal(resolveNutritionFood("Pepperonni Pizza", "Pepperonni Pizza", pizzaCatalog, [egg]).method, "fuzzy");
  const ambiguous = { ...catalog, foods: [...catalog.foods, { ...catalog.foods[0], id: servingId }] };
  assert.equal(resolveNutritionFood("eggs", "eggs", ambiguous, [egg, { ...egg, food_id: servingId }]).method, "provisional");
});

test("known reference composites use stored macros; taxonomy-only composites and explicit extras stay incomplete", () => {
  for (const name of ["Pepperoni Pizza", "Turkey Sandwich", "Turkey Sandwich with mayo", "Cheeseburger with no cheese"]) {
    const food = provisionalFood(name);
    assert.equal(nutritionPreview(food, nutritionDraft(food, [], "one")), null);
  }
  const known = { ...provisionalFood("Pepperoni Pizza"), food_id: id, method: "exact" as const };
  // Synthetic reference serving proves reuse, not a nutritional estimate for real pizza.
  const reference = { ...egg, serving_unit: "slice", serving_name: "Reference slice", calories: 200 };
  assert.equal(nutritionPreview(known, nutritionDraft(known, [reference], "two slices"))?.nutrients.calories, 400);
});
test("composite changes keep macros incomplete unless reference nutrition is explicitly accepted", () => {
  const food = { ...provisionalFood("Cheeseburger"), food_id: id, method: "exact" as const, components: [{ food_id: null, label: "Cheese", source: "explicit" as const, confidence: null, included: false, confirmed: false, categories: [] }] };
  const draft = nutritionDraft(food, [egg], "one");
  assert.equal(nutritionPreview(food, draft), null);
  assert.equal(nutritionPreview(food, { ...draft, reference_confirmed: true })?.nutrients.calories, 72);
  assert.equal(nutritionPreview({ ...food, food_id: null, method: "provisional" }, { ...draft, reference_confirmed: true }), null);
});
test("mixed voice partition retains food metadata and non-food fields without a generic food event", () => {
  const food = resolveNutritionFood("eggs", "two eggs", catalog, [egg]);
  const candidates: VoiceCandidate[] = [{ event: { event_type: "food", title: "eggs", food, amount: "two eggs", event_date: "2026-09-25", event_time: "12:00", tags: [] }, nutrition: nutritionDraft(food, [egg], "two eggs"), source_fragment: "two eggs", time_note: "Review", requires_review: true }, ...(["supplement", "symptom"] as const).map(event_type => ({ event: { event_type, title: event_type === "supplement" ? "creatine" : "knee hurts", event_date: "2026-09-25", event_time: "12:00", ...(event_type === "supplement" ? { dose_amount: 5, dose_unit: "grams" } : {}) }, source_fragment: "Review", time_note: "Review", requires_review: true as const }))];
  const rows = voiceNutritionRows(candidates, "owner");
  assert.deepEqual(rows.map(row => row.kind), ["nutrition", "health", "health"]);
  assert.equal(rows[0].nutrition?.multiplier, 2); assert.equal(rows[1].event?.input_method, "voice"); assert.equal(rows[1].event?.dose, "5 grams");
  assert.equal(rows[0].event, undefined);
  assert.throws(() => voiceNutritionRows([{ ...candidates[0], nutrition: undefined }], "owner"), /NUTRITION_REVIEW_REQUIRED/);
  const incomplete = voiceNutritionRows([{ ...candidates[0], nutrition: { ...candidates[0].nutrition!, quantity: null, accept_incomplete: true } }], "owner");
  assert.equal(incomplete[0].nutrition?.status, "incomplete"); assert.equal(incomplete[0].nutrition?.multiplier, null);
});
