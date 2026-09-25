import { normalizeFoodName } from "./normalization.ts";

export const foodSources = ["library", "explicit", "ai_inferred", "user_confirmed"] as const;
export type FoodSource = typeof foodSources[number];
export const matchMethods = ["exact", "alias", "normalized", "fuzzy", "ai", "provisional"] as const;
export type MatchMethod = typeof matchMethods[number];
export type Category = { id: string; slug: string; name: string };
export type CatalogFood = { id: string; name: string; aliases: string[]; categories: Category[] };
export type CatalogComponent = { parent_food_id: string; component_food_id: string; source: FoodSource; confidence: number | null };
export type FoodCatalog = { foods: CatalogFood[]; components: CatalogComponent[] };
export type FoodComponentDraft = {
  food_id: string | null; label: string; source: FoodSource; confidence: number | null;
  included: boolean; confirmed: boolean; categories: Category[];
};
export type FoodResolution = {
  label: string; food_id: string | null; canonical_name: string | null; method: MatchMethod;
  confirmed: boolean; components: FoodComponentDraft[]; categories: Category[];
};
// Punctuation matching is conservative: commas and hyphens become boundaries, never token deletion.
export const comparisonKey = (value: string) => normalizeFoodName(value).replace(/[‐‑–—-]/g, " ").replace(/[,]/g, " ").replace(/\s+/g, " ").trim();
export function provisionalFood(label: string): FoodResolution {
  return { label, food_id: null, canonical_name: null, method: "provisional", confirmed: false, components: [], categories: [] };
}
function oneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, differences = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++differences > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return differences + (i < a.length || j < b.length ? 1 : 0) <= 1;
}
export function matchFood(label: string, catalog: FoodCatalog): { food: CatalogFood | null; method: MatchMethod; ambiguous: boolean } {
  const key = comparisonKey(label);
  const stages: [MatchMethod, (food: CatalogFood) => boolean][] = [
    ["exact", food => food.name === label.trim()],
    ["alias", food => food.aliases.includes(label.trim())],
    ["normalized", food => [food.name, ...food.aliases].some(name => comparisonKey(name) === key)],
    ["fuzzy", food => {
      const tokens = key.split(" "), target = comparisonKey(food.name).split(" ");
      if (tokens.length !== target.length || tokens.length < 2) return false;
      const changed = tokens.filter((token, index) => token !== target[index]);
      // Only one long token typo, no preparation/brand word removal or short-token guessing.
      return changed.length === 1 && tokens.every((token, index) => token === target[index] || token.length >= 6 && target[index].length >= 6 && oneEdit(token, target[index]));
    }],
  ];
  for (const [method, predicate] of stages) {
    const matches = catalog.foods.filter(predicate);
    if (matches.length) return { food: matches.length === 1 ? matches[0] : null, method: matches.length === 1 ? method : "provisional", ambiguous: matches.length > 1 };
  }
  return { food: null, method: "provisional", ambiguous: false };
}
export function foodCategories(food: FoodResolution): Category[] {
  const categories = food.components.length ? food.components.filter(component => component.included && (component.source !== "ai_inferred" || component.confirmed)).flatMap(component => component.categories) : (food.method === "ai" || food.method === "fuzzy") && !food.confirmed ? [] : food.categories;
  return [...new Map(categories.map(category => [category.id, category])).values()];
}
export function matchFoodLabel(label: string, catalog: FoodCatalog) {
  let match = matchFood(label, catalog);
  if (!match.food && !match.ambiguous) {
    const base = label.replace(/^(?:\d+(?:\.\d+)?|one|two|three|four|five|six)\s+(?:slices?|cups?|pieces?|servings?)\s+(?:of\s+)?/i, "").split(/\s+(?:with|without|no|hold)\s+/i)[0];
    if (base !== label) match = matchFood(base, catalog);
  }
  return match;
}
/** Exactly one level, at most 16 components. No recursive ingredient inference. */
export function resolveFood(label: string, context: string, catalog: FoodCatalog): FoodResolution {
  const match = matchFoodLabel(label, catalog);
  const result = provisionalFood(label);
  let hasLibraryComponents = false;
  if (match.food) {
    result.food_id = match.food.id; result.canonical_name = match.food.name; result.method = match.method;
    result.categories = match.food.categories;
    result.components = catalog.components.filter(link => link.parent_food_id === match.food!.id).slice(0, 16).flatMap(link => {
      const food = catalog.foods.find(food => food.id === link.component_food_id);
      return food ? [{ food_id: food.id, label: food.name, source: link.source, confidence: link.confidence, included: link.source !== "ai_inferred", confirmed: false, categories: food.categories }] : [];
    });
    hasLibraryComponents = result.components.length > 0;
  }
  // Only ingredient clauses count as explicit; the composite's name alone is library knowledge.
  const clauses = [...context.matchAll(/\b(without|with|no|hold)\s+(.+?)(?=\b(?:without|with|no|hold)\s+|[.;]|$)/gi)];
  for (const clause of clauses) {
    const included = clause[1].toLowerCase() === "with";
    for (const part of clause[2].split(/\s+and\s+|,/i).map(part => part.trim()).filter(Boolean)) {
      // Long clauses and event transitions are not reliably ingredient names.
      if (part.length > 160 || /\b(?:I|then|after|before|took|felt|drank|ate|walked)\b/i.test(part)) continue;
      const explicit = matchFood(part, catalog);
      const existing = result.components.find(component => explicit.food ? component.food_id === explicit.food.id : comparisonKey(component.label) === comparisonKey(part));
      const component: FoodComponentDraft = { food_id: explicit.food?.id ?? null, label: explicit.food?.name ?? part, source: "explicit", confidence: null, included, confirmed: false, categories: explicit.food?.categories ?? [] };
      if (existing) Object.assign(existing, component); else if (result.components.length < 16) result.components.push(component);
    }
  }
  // A simple food with additions still includes the named base (bread with cheese remains grains + dairy).
  // Composite categories instead come from selected components, so exclusions remove their exposures.
  if (match.food && !hasLibraryComponents && result.components.length && !result.components.some(component => component.food_id === match.food!.id)) {
    result.components = [{ food_id: match.food.id, label: match.food.name, source: "library" as const, confidence: null, included: true, confirmed: false, categories: match.food.categories }, ...result.components].slice(0, 16);
  }
  return result;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Independent of AI; called again at ingestion. Catalog names/categories are not trusted persistence inputs. */
export function validateFoodResolution(value: FoodResolution): FoodResolution {
  const bad = () => { throw new Error("INVALID_EVENT"); };
  if (!value || typeof value !== "object" || typeof value.label !== "string" || !value.label.trim() || value.label.length > 160 || !matchMethods.includes(value.method) || typeof value.confirmed !== "boolean" || !Array.isArray(value.components) || value.components.length > 16) return bad();
  if (value.food_id !== null && (typeof value.food_id !== "string" || !uuid.test(value.food_id))) return bad();
  if ((value.food_id === null) !== (value.method === "provisional")) return bad();
  const keys = new Set<string>();
  for (const component of value.components) {
    if (!component || typeof component.label !== "string" || !component.label.trim() || component.label.length > 160 || !foodSources.includes(component.source) || typeof component.included !== "boolean" || typeof component.confirmed !== "boolean" || (component.confidence !== null && (typeof component.confidence !== "number" || !Number.isFinite(component.confidence) || component.confidence < 0 || component.confidence > 1))) return bad();
    if (component.food_id !== null && (typeof component.food_id !== "string" || !uuid.test(component.food_id))) return bad();
    const key = component.food_id ?? comparisonKey(component.label);
    if (keys.has(key)) return bad(); keys.add(key);
  }
  return { ...value, categories: [...(value.categories ?? [])], components: value.components.map(component => ({ ...component, categories: [...(component.categories ?? [])] })) };
}
export function foodPersistence(value: FoodResolution) {
  const food = validateFoodResolution(value);
  return { food_id: food.food_id, label: food.label, method: food.method, confirmed: food.confirmed,
    components: food.components.map(({ food_id, label, source, confidence, included, confirmed }) => ({ food_id, label, source, confidence, included, confirmed })) };
}
