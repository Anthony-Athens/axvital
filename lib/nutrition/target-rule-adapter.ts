import type { RuleDefinition } from "../rules/types.ts";
import { validateRule } from "../rules/validation.ts";
/** Rule is canonical. Existing target dates/priority/activation remain separate metadata. */
export function nutritionTargetProjection(definition: RuleDefinition) {
  validateRule(definition);
  const metrics: Record<string, string> = { calories: "calories", protein_grams: "protein", carbohydrate_grams: "carbohydrates", fat_grams: "fat", fiber_grams: "fiber" };
  if (definition.domain !== "nutrition" || definition.kind !== "numeric" || !metrics[definition.metric]) throw new Error("RULE_HAS_NO_LEGACY_PROJECTION");
  return { target_type: metrics[definition.metric], target_value: definition.value, unit: definition.unit };
}
