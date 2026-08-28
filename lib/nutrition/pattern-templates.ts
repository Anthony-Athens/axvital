import type { RuleDefinition, ClassificationKey } from "../rules/types.ts";
import { validateRule } from "../rules/validation.ts";
export const nutritionPatternTemplates = [
  { key: "ketogenic", version: 1, label: "Ketogenic", note: "Configure a total-carbohydrate ceiling. This does not establish ketosis.", configurable: "carbohydrate_ceiling" },
  { key: "low_carb", version: 1, label: "Low Carb", note: "Choose your carbohydrate ceiling; no universal definition is implied.", configurable: "carbohydrate_ceiling" },
  { key: "vegan", version: 1, label: "Vegan", note: "Review animal-derived exclusion; unclassified ingredients remain unknown.", configurable: "exclusions" },
  { key: "vegetarian", version: 1, label: "Vegetarian", note: "Review meat/fish exclusions and your dairy/egg preferences.", configurable: "exclusions" },
  { key: "carnivore", version: 1, label: "Carnivore", note: "Review plant-derived exclusions and beverage/seasoning exceptions; no medical definition.", configurable: "exclusions" },
  { key: "dairy_free", version: 1, label: "Dairy Free", note: "Dairy-derived exclusion, not lactose-free or allergy/cross-contact certification.", configurable: "exclusions" },
] as const;
export function patternRules(key: string, options: { carbohydrateCeiling?: number; exclusions?: ClassificationKey[] }): RuleDefinition[] {
  const template = nutritionPatternTemplates.find(item => item.key === key);
  if (!template) throw new Error("UNKNOWN_PATTERN_TEMPLATE");
  const rules: RuleDefinition[] = template.configurable === "carbohydrate_ceiling"
    ? [{ version: 1, domain: "nutrition", kind: "numeric", metric: "carbohydrate_grams", operator: "lte", value: options.carbohydrateCeiling as number, unit: "g", period: "day" }]
    : (options.exclusions ?? []).map(classification => ({ version: 1, domain: "nutrition", kind: "exclusion", metric: "food_classification", operator: "excludes", classification, period: "day" }));
  if (!rules.length || rules.length > 20) throw new Error("REVIEW_PATTERN_RULES");
  rules.forEach(validateRule);
  return rules;
}
