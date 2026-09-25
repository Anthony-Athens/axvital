import type { Serving, Nutrients } from "./nutrition.ts";
import { scaleNutrition } from "./nutrition.ts";
import type { FoodCatalog, FoodResolution } from "./food-resolution.ts";
import { matchFoodLabel, resolveFood } from "./food-resolution.ts";

export type NutritionDraft = {
  servings: Serving[]; serving_id: string | null; quantity: number | null; unit: string | null;
  meal_type: string | null; accept_incomplete: boolean; reference_confirmed: boolean;
};
const numbers: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, quarter: 0.25 };
const units: Record<string, string> = { item: "each", items: "each", count: "each", each: "each", egg: "each", eggs: "each", slice: "slice", slices: "slice", g: "g", gram: "g", grams: "g", kg: "kg", kilogram: "kg", kilograms: "kg", oz: "oz", ounce: "oz", ounces: "oz", lb: "lb", pound: "lb", pounds: "lb", cup: "cup", cups: "cup", tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp", ml: "ml", milliliter: "ml", milliliters: "ml", l: "l", liter: "l", liters: "l", scoop: "scoop", scoops: "scoop", serving: "serving", servings: "serving", "fl oz": "fl oz", "fluid ounces": "fl oz", "fluid ounce": "fl oz" };
export const normalizeServingUnit = (unit: string) => units[unit.trim().toLowerCase()] ?? unit.trim().toLowerCase();
const quantityToken = "(?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:\\.\\d+)?|(?:one|two|three|four|five|six|seven|eight|nine|ten)(?: and a (?:half|quarter))?|half(?: a)?|quarter(?: of a)?|an|a)";
function prefix(value: string) {
  if (/^7\s*up\b/i.test(value.trim())) return null;
  const match = value.trim().match(new RegExp(`^(${quantityToken})(?:\\s+(.+))?$`, "i"));
  if (!match) return null;
  const number = match[1].toLowerCase();
  let quantity: number;
  if (number.includes(" and a ")) { const [whole, fraction] = number.split(" and a "); quantity = numbers[whole] + numbers[fraction]; }
  else if (/^\d+ \d+\//.test(number)) { const [whole, fraction] = number.split(" "); const [a, b] = fraction.split("/"); quantity = Number(whole) + Number(a) / Number(b); }
  else if (number.includes("/")) { const [a, b] = number.split("/"); quantity = Number(a) / Number(b); }
  else quantity = numbers[number.split(" ")[0]] ?? Number(number);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) return null;
  const tail = (match[2] ?? "").trim();
  const key = Object.keys(units).sort((a, b) => b.length - a.length).find(key => tail.toLowerCase() === key || tail.toLowerCase().startsWith(key + " "));
  // Egg is an identity and a count noun, not a removable measurement unit.
  const identity = key && !["egg", "eggs"].includes(key) ? tail.slice(key.length).replace(/^\s*(?:of\s+)?/i, "") : tail;
  return { quantity, unit: key ? units[key] : null, identity };
}
export function foodIdentity(label: string) { return prefix(label)?.identity || label; }
export function parseIntake(amount: string | null | undefined, label: string, fragment = "") {
  const identity = foodIdentity(label);
  const escaped = identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const unitPattern = Object.keys(units).sort((a,b) => b.length-a.length).join("|");
  const attached = fragment.match(new RegExp(`\\b(${quantityToken}\\s+(?:(?:${unitPattern}|[a-z]+)\\s+(?:of\\s+)?)?${escaped})(?=[.,!?\\s]|$)`, "i"))?.[1];
  const parsed = prefix(amount?.trim() || attached || label);
  if (parsed && !parsed.unit && parsed.identity && parsed.identity.toLowerCase() !== identity.toLowerCase()) parsed.unit = parsed.identity.split(/\s+/)[0].toLowerCase();
  const meal_type = fragment.match(/\b(?:for|at)\s+(breakfast|lunch|dinner|snack)\b/i)?.[1].toLowerCase() ?? null;
  // Bare ounces in a drink are ambiguous between weight and fluid ounces.
  const ambiguous = parsed?.unit === "oz" && /\b(?:drank|drink|drinking)\b/i.test(fragment);
  return { quantity: parsed?.quantity ?? null, unit: ambiguous ? null : parsed?.unit ?? null, meal_type };
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
export function nutritionDraft(food: FoodResolution, servings: Serving[], amount?: string | null, fragment = "", structured?: ReturnType<typeof parseIntake>): NutritionDraft {
  const intake = { ...(structured ?? parseIntake(amount, food.label, fragment)) };
  const options = servings.filter(serving => serving.food_id === food.food_id);
  if (intake.quantity !== null && intake.unit === null && options.some(serving => normalizeServingUnit(serving.serving_unit) === "each")) intake.unit = "each";
  const ordered = [...options].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.display_order - b.display_order);
  const direct = ordered.find(serving => intake.unit && normalizeServingUnit(serving.serving_unit) === intake.unit);
  const selected = direct ?? ordered.find(serving => servingMultiplier(serving, intake.quantity, intake.unit) !== null);
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
  label = foodIdentity(label);
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
