import type { Serving, Nutrients } from "./nutrition.ts";
import { scaleNutrition } from "./nutrition.ts";
import type { FoodCatalog, FoodResolution } from "./food-resolution.ts";
import { matchFoodLabel, resolveFood } from "./food-resolution.ts";

export type NutritionDraft = {
  servings: Serving[]; serving_id: string | null; quantity: number | null; unit: string | null;
  recipe_confirmed?: boolean; recipe_edited?: boolean; recipe_unit?: string | null;
  meal_type: string | null; accept_incomplete: boolean; reference_confirmed: boolean;
};
import { parseIntake, foodIdentity, normalizeServingUnit, servingMultiplier } from "./food-quantity.ts";
export { parseIntake, foodIdentity, normalizeServingUnit, servingMultiplier } from "./food-quantity.ts";
export function nutritionDraft(food: FoodResolution, servings: Serving[], amount?: string | null, fragment = "", structured?: ReturnType<typeof parseIntake>): NutritionDraft {
  const intake = { ...(structured ?? parseIntake(amount, food.label, fragment)) };
  const options = servings.filter(serving => serving.food_id === food.food_id);
  if (intake.quantity !== null && intake.unit === null && (food.recipe_unit === "each" || options.some(serving => normalizeServingUnit(serving.serving_unit) === "each"))) intake.unit = "each";
  const ordered = [...options].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.display_order - b.display_order);
  const direct = ordered.find(serving => intake.unit && normalizeServingUnit(serving.serving_unit) === intake.unit);
  const selected = direct ?? ordered.find(serving => servingMultiplier(serving, intake.quantity, intake.unit) !== null);
  return { ...intake, recipe_unit: food.recipe_unit ?? null, recipe_confirmed: false, servings: options, serving_id: selected?.id ?? null, accept_incomplete: false, reference_confirmed: false };
}
export function nutritionPreview(food: FoodResolution | undefined, draft: NutritionDraft | undefined): { nutrients: Nutrients; multiplier: number; serving: Serving } | null {
  if (!food || !draft || !food.food_id || draft.recipe_confirmed) return null;
  if ((food.method === "ai" || food.method === "fuzzy") && !food.confirmed) return null;
  // A modified recipe cannot inherit the unmodified reference macros without explicit user review.
  const modified = draft.recipe_edited || food.components.some(component => !component.included || component.source === "user_confirmed" || component.source === "explicit" || component.source === "ai_inferred");
  if (modified && !draft.reference_confirmed) return null;
  const serving = draft.servings.find(serving => serving.id === draft.serving_id && serving.food_id === food.food_id);
  if (!serving) return null;
  const multiplier = servingMultiplier(serving, draft.quantity, draft.unit);
  if (multiplier === null || multiplier <= 0 || !Number.isFinite(multiplier)) return null;
  return { nutrients: scaleNutrition(serving, multiplier), multiplier, serving };
}
export function resolveNutritionFood(label: string, context: string, catalog: FoodCatalog, servings: Serving[]) {
  label = foodIdentity(label);
  const ids = new Set([...servings.map(serving => serving.food_id), ...catalog.foods.filter(food => food.recipe_unit).map(food => food.id)]);
  const nutritionCatalog = { ...catalog, foods: catalog.foods.filter(food => ids.has(food.id)) };
  const matched = matchFoodLabel(label, nutritionCatalog);
  // Preserve the full catalog for component enrichment after choosing the serving-backed parent.
  if (matched.food) {
    return resolveFood(label, context, catalog, matched);
  }
  if (matched.ambiguous) return resolveFood(label, context, nutritionCatalog);
  return resolveFood(label, context, catalog);
}
