import type { FoodResolution } from "./food-resolution.ts";
import { normalizeServingUnit, servingMultiplier } from "./food-quantity.ts";
import { nutritionDraft, type NutritionDraft } from "./voice-nutrition.ts";
import { scaleNutrition, sumNutrition, type Serving } from "./nutrition.ts";

/** Quantities describe one reference recipe. Event copies never write to the catalog. */
export function enrichRecipe(food: FoodResolution, servings: Serving[]): FoodResolution {
  return { ...food, components: food.components.map(component => {
    const quantity = component.nutrition?.quantity ?? null, unit = component.nutrition?.unit ?? null;
    const draft = nutritionDraft({ ...food, label: component.label, food_id: component.food_id, components: [] }, servings, null, "", { quantity, unit, meal_type: null });
    return { ...component, nutrition: { quantity: draft.quantity, unit: draft.unit, servings: draft.servings, serving_id: draft.serving_id } };
  }) };
}

export function recipePreview(food: FoodResolution | undefined, draft: NutritionDraft | undefined) {
  if (!food || !draft?.recipe_confirmed || !food.components.length) return null;
  if (["ai", "fuzzy"].includes(food.method) && !food.confirmed) return null;
  // Unmapped meals use an explicitly reviewed single recipe; known templates retain their unit.
  const unit = draft.recipe_unit ?? food.recipe_unit ?? "serving";
  if (draft.quantity === null || !Number.isFinite(draft.quantity) || draft.quantity <= 0 || draft.quantity > 10000 || normalizeServingUnit(draft.unit ?? "") !== unit) return null;
  const included = food.components.filter(component => component.included);
  if (!included.length) return null;
  const items = [];
  for (const component of included) {
    if (!component.food_id || (component.source === "ai_inferred" && !component.confirmed)) return null;
    const n = component.nutrition;
    const serving = n?.servings.find(serving => serving.id === n.serving_id && serving.food_id === component.food_id);
    if (!n || !serving) return null;
    const perRecipe = servingMultiplier(serving, n.quantity, n.unit);
    if (perRecipe === null || !Number.isFinite(perRecipe) || perRecipe <= 0) return null;
    const multiplier = perRecipe * draft.quantity;
    if (multiplier > 100000) return null;
    const nutrients = scaleNutrition(serving, multiplier);
    if ([nutrients.calories, nutrients.protein_grams, nutrients.carbohydrate_grams, nutrients.fat_grams].some(value => value == null || !Number.isFinite(value))) return null;
    items.push({ food_id: component.food_id, serving_id: serving.id, multiplier, nutrients });
  }
  return { items, nutrients: sumNutrition(items.map(item => item.nutrients)) };
}
