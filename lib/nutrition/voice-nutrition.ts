import type { Serving, Nutrients } from "./nutrition.ts";
import { scaleNutrition } from "./nutrition.ts";
import type { FoodCatalog, FoodResolution } from "./food-resolution.ts";
import { matchFoodLabel, resolveFood } from "./food-resolution.ts";

export type NutritionDraft = {
  servings: Serving[]; serving_id: string | null; quantity: number | null; unit: string | null;
  meal_type: string | null; accept_incomplete: boolean; reference_confirmed: boolean;
};
const numbers: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, quarter: 0.25 };
const units: Record<string, string> = { each: "each", egg: "each", eggs: "each", slice: "slice", slices: "slice", g: "g", gram: "g", grams: "g", kg: "kg", kilogram: "kg", kilograms: "kg", oz: "oz", ounce: "oz", ounces: "oz", lb: "lb", pound: "lb", pounds: "lb", cup: "cup", cups: "cup", tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp", ml: "ml", milliliter: "ml", milliliters: "ml", l: "l", liter: "l", liters: "l", scoop: "scoop", scoops: "scoop", serving: "serving", servings: "serving", "fl oz": "fl oz", "fluid ounces": "fl oz", "fluid ounce": "fl oz" };
export const normalizeServingUnit = (unit: string) => units[unit.trim().toLowerCase()] ?? unit.trim().toLowerCase();
export function parseIntake(amount: string | null | undefined, label: string, fragment = "") {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const token = "(?:\\d+(?:\\.\\d+)?|\\d+/\\d+|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|a|an)";
  // A missing amount can only use a number immediately attached to this food's name.
  const raw = amount?.trim() || fragment.match(new RegExp(`\\b(${token}\\s+${escaped})\\b`, "i"))?.[1] || "";
  const match = raw.match(new RegExp(`^(${token})(?:\\s+(.+))?$`, "i"));
  let quantity: number | null = null, unit: string | null = null;
  if (match) {
    const first = match[1].toLowerCase();
    quantity = numbers[first] ?? (first.includes("/") ? Number(first.split("/")[0]) / Number(first.split("/")[1]) : Number(first));
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) quantity = null;
    const tail = (match[2] ?? "").toLowerCase().replace(/^of\s+/, "");
    const known = Object.keys(units).sort((a, b) => b.length - a.length).find(key => tail === key || tail.startsWith(key + " "));
    unit = known ? units[known] : tail && tail !== label.toLowerCase() ? tail.split(/\s+/)[0] : null;
  }
  const meal_type = fragment.match(/\b(?:for|at)\s+(breakfast|lunch|dinner|snack)\b/i)?.[1].toLowerCase() ?? null;
  return { quantity, unit, meal_type };
}
const mass: Record<string, number> = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 };
const volume: Record<string, number> = { ml: 1, l: 1000, "fl oz": 29.5735295625, cup: 236.5882365, tbsp: 14.78676478125, tsp: 4.92892159375 };
/** Direct units win; weight conversions use the catalog's gram equivalent. Never guess density. */
export function servingMultiplier(serving: Serving, quantity: number | null, unit: string | null): number | null {
  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0 || quantity > 10000 || !unit) return null;
  const from = normalizeServingUnit(unit), to = normalizeServingUnit(serving.serving_unit);
  if (from === to) return quantity / serving.serving_quantity;
  if (mass[from] && serving.grams_equivalent) return quantity * mass[from] / serving.grams_equivalent;
  if (mass[from] && mass[to]) return quantity * mass[from] / (serving.serving_quantity * mass[to]);
  if (volume[from] && volume[to]) return quantity * volume[from] / (serving.serving_quantity * volume[to]);
  return null;
}
export function nutritionDraft(food: FoodResolution, servings: Serving[], amount?: string | null, fragment = ""): NutritionDraft {
  const intake = parseIntake(amount, food.label, fragment);
  const options = servings.filter(serving => serving.food_id === food.food_id);
  if (intake.quantity !== null && intake.unit === null && options.some(serving => normalizeServingUnit(serving.serving_unit) === "each")) intake.unit = "each";
  const ordered = [...options].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.display_order - b.display_order);
  const direct = ordered.find(serving => intake.unit && normalizeServingUnit(serving.serving_unit) === intake.unit);
  const selected = direct ?? ordered.find(serving => servingMultiplier(serving, intake.quantity, intake.unit) !== null) ?? ordered[0];
  return { ...intake, servings: options, serving_id: selected?.id ?? null, accept_incomplete: false, reference_confirmed: false };
}
export function nutritionPreview(food: FoodResolution | undefined, draft: NutritionDraft | undefined): { nutrients: Nutrients; multiplier: number; serving: Serving } | null {
  if (!food || !draft || !food.food_id) return null;
  if ((food.method === "ai" || food.method === "fuzzy") && !food.confirmed) return null;
  // A modified recipe cannot inherit the unmodified reference macros without explicit user review.
  const modified = food.components.some(component => !component.included || component.source === "user_confirmed" || component.source === "explicit" || component.source === "ai_inferred");
  if (modified && !draft.reference_confirmed) return null;
  const serving = draft.servings.find(serving => serving.id === draft.serving_id && serving.food_id === food.food_id);
  if (!serving) return null;
  const multiplier = servingMultiplier(serving, draft.quantity, draft.unit);
  if (multiplier === null || multiplier <= 0 || !Number.isFinite(multiplier)) return null;
  return { nutrients: scaleNutrition(serving, multiplier), multiplier, serving };
}
export function resolveNutritionFood(label: string, context: string, catalog: FoodCatalog, servings: Serving[]) {
  const ids = new Set(servings.map(serving => serving.food_id));
  const nutritionCatalog = { ...catalog, foods: catalog.foods.filter(food => ids.has(food.id)) };
  const matched = matchFoodLabel(label, nutritionCatalog);
  // Preserve the full catalog for component enrichment after choosing the serving-backed parent.
  if (matched.food) {
    return resolveFood(label, context, catalog, matched);
  }
  if (matched.ambiguous) return resolveFood(label, context, nutritionCatalog);
  return resolveFood(label, context, catalog);
}
