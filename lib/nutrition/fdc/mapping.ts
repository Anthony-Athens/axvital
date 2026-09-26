import { scaleNutrition, type Nutrients } from "../nutrition.ts";
import { normalizeServingUnit } from "../food-quantity.ts";

export const dataTypes = ["Foundation", "Survey (FNDDS)", "SR Legacy", "Branded"] as const;
export type DataType = typeof dataTypes[number];
export type Basis = Nutrients & { sugar_grams: number | null; sodium_mg: number | null; caffeine_mg: number | null; alcohol_grams: number | null };
export type ImportedServing = Basis & { key: string; serving_name: string; serving_quantity: number; serving_unit: string; grams_equivalent: number };
export type MappedFood = { external_id: number; data_type: DataType; description: string; source_updated_at: string | null; source_category: string | null; basis: Basis; servings: ImportedServing[]; omitted_portions: number };
type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const label = (value: unknown, max = 300) => typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;

/** Full generic USDA detail records report nutrient values per 100 grams. Missing is never zero. */
export function mapFoodDataCentral(value: unknown, allowBranded = false): MappedFood {
  const food = row(value), description = label(food.description);
  if (!Number.isSafeInteger(food.fdcId) || Number(food.fdcId) <= 0 || !description || !dataTypes.includes(food.dataType as DataType) || (food.dataType === "Branded" && !allowBranded) || !Array.isArray(food.foodNutrients) || food.foodNutrients.length > 500) throw Error("FDC_INVALID_FOOD");
  // Branded foods may report a 100 mL basis. Do not treat that as grams or infer density.
  if (food.dataType === "Branded") throw Error("FDC_BRANDED_REQUIRES_REVIEW");
  const nutrient = (ids: number[], unit: string) => {
    for (const id of ids) {
      const found = food.foodNutrients as unknown[];
      const matches = found.map(row).filter(item => row(item.nutrient).id === id);
      if (matches.length > 1) throw Error("FDC_DUPLICATE_NUTRIENT");
      if (!matches.length) continue;
      if (String(row(matches[0].nutrient).unitName).toLowerCase() !== unit) throw Error("FDC_INVALID_NUTRIENT_UNIT");
      const amount = numeric(matches[0].amount);
      if (amount === null || amount > 100000) throw Error("FDC_INVALID_NUTRIENT");
      return amount;
    }
    return null;
  };
  const basis: Basis = {
    calories: nutrient([2048,2047,1008], "kcal"), protein_grams: nutrient([1003],"g"),
    carbohydrate_grams: nutrient([1005],"g"), fat_grams: nutrient([1004],"g"), fiber_grams: nutrient([1079],"g"),
    sugar_grams: nutrient([2000,1063],"g"), sodium_mg: nutrient([1093],"mg"), caffeine_mg: nutrient([1057],"mg"), alcohol_grams: nutrient([1018],"g"),
  };
  if (basis.calories === null) { const kj = nutrient([1062],"kj"); if (kj !== null) basis.calories = kj / 4.184; }
  const scaled = (grams: number): Basis => ({ ...scaleNutrition(basis, grams/100), ...Object.fromEntries((["sugar_grams","sodium_mg","caffeine_mg","alcohol_grams"] as const).map(key => [key,basis[key]===null?null:basis[key]! * grams/100])) } as Basis);
  const servings: ImportedServing[] = [{ ...basis, key:"100g", serving_name:"100 g", serving_quantity:100, serving_unit:"g", grams_equivalent:100 }];
  const portions = food.foodPortions ?? [];
  if (!Array.isArray(portions) || portions.length > 200) throw Error("FDC_INVALID_PORTIONS");
  let omitted_portions = 0;
  const keys = new Set<string>(["100g"]);
  for (const raw of portions) {
    const p = row(raw), grams = numeric(p.gramWeight);
    const text = label(p.portionDescription) ?? label(p.modifier) ?? label(row(p.measureUnit).name) ?? "";
    let amount = numeric(p.amount), unit = normalizeServingUnit(String(row(p.measureUnit).name ?? ""));
    const named = text.toLowerCase().match(/^(?:(\d+(?:\.\d+)?)\s+)?(cups?|tablespoons?|tbsp|teaspoons?|tsp|slices?|fluid ounces?|fl oz|oz|ounces?|g|grams?|ml|milliliters?)(?=$|\s|,|\()/);
    if (!["cup","tbsp","tsp","slice","fl oz","oz","g","ml"].includes(unit) && named) { unit = normalizeServingUnit(named[2]); amount ??= Number(named[1] ?? 1); }
    // Qualified slices cannot silently become an ordinary slice in voice recipes.
    if (unit==='slice' && /snack|crust not|thin|thick|small|large/i.test(text)) { omitted_portions++; continue; }
    if (/^1 medium or regular slice$/i.test(text)) {unit='slice';amount=1;}
    // Only explicit standard count portions. Other sizes remain gram-only.
    if (/hamburger bun/i.test(description) && /^1 hamburger bun$/i.test(text)) {unit='each';amount=1;}
    if (/^Tortilla,/i.test(description) && /^1 medium$/i.test(text)) {unit='each';amount=1;}
    if (/^eggs?, whole\b/i.test(description) && /^(?:1\s+)?large(?:\s*\([^)]*\))?$/i.test(text)) {unit='each';amount??=1;}
    if (/^Eggs, Grade A, Large, egg whole$/i.test(description) && row(p.measureUnit).name==='egg' && text==='whole without shell')unit='each';
    if (grams === null || grams <= 0 || grams > 10000 || amount === null || amount <= 0 || !["cup","tbsp","tsp","slice","fl oz","oz","g","ml","each"].includes(unit) || !Number.isSafeInteger(p.id)) { omitted_portions++; continue; }
    // Conflicting embedded amounts are not silently reinterpreted.
    if (named?.[1] && Number(named[1]) !== amount) { omitted_portions++; continue; }
    const key = `portion:${p.id}`;
    if (keys.has(key)) throw Error("FDC_DUPLICATE_PORTION"); keys.add(key);
    servings.push({...scaled(grams),key,serving_name:`${amount} ${unit}${text ? ` (${text})` : ""}`.slice(0,160),serving_quantity:amount,serving_unit:unit,grams_equivalent:grams});
  }
  const sourceDate = label(food.modifiedDate) ?? label(food.publicationDate);
  return { external_id:Number(food.fdcId),data_type:food.dataType as DataType,description,source_updated_at:sourceDate && Number.isFinite(Date.parse(sourceDate)) ? new Date(sourceDate).toISOString() : null,source_category:label(row(food.foodCategory).description) ?? label(food.foodCategory),basis,servings,omitted_portions };
}
export function hasMacros(food: MappedFood) { return [food.basis.calories,food.basis.protein_grams,food.basis.carbohydrate_grams,food.basis.fat_grams].every(value=>value!==null); }
