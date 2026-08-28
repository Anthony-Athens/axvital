import { validateRule } from "../rules/validation.ts";
import type { RuleDefinition } from "../rules/types.ts";
import type { NutritionDay, NutritionKey } from "../measurements/observations.ts";

/** Explicit, versioned subset. No subtotal-only, exclusion, cutoff or range inference. */
export const supportedNutritionExposure = {
  version: 1, kind: "numeric", period: "day", operators: ["gte", "lte", "eq"],
  metrics: ["calories", "protein_grams", "carbohydrate_grams", "fat_grams", "fiber_grams"],
} as const;
const metrics: Record<string, NutritionKey> = {calories:"nutrition_calories",protein_grams:"nutrition_protein_grams",carbohydrate_grams:"nutrition_carbohydrate_grams",fat_grams:"nutrition_fat_grams",fiber_grams:"nutrition_fiber_grams"};
export type FrozenNumericTarget = Extract<RuleDefinition, {domain:"nutrition";kind:"numeric"}>;
export function supportedFrozenTarget(value:unknown): {rule:FrozenNumericTarget;key:NutritionKey}|null {
  try {validateRule(value);}catch{return null;}
  const rule=value as RuleDefinition;
  return rule.domain==="nutrition"&&rule.kind==="numeric"&&Object.hasOwn(metrics,rule.metric)?{rule,key:metrics[rule.metric]}:null;
}
export function evaluateFrozenNutritionDay(definition:unknown,day:NutritionDay|undefined,readComplete:boolean):{state:"adherent"|"non-adherent"|"unknown";reason:string} {
  const supported=supportedFrozenTarget(definition);
  if(!supported)return {state:"unknown",reason:"Unsupported frozen nutrition rule."};
  if(!readComplete)return {state:"unknown",reason:"Nutrition evidence could not be read completely."};
  if(!day||day.coverageStatus!=="complete"||!day.fieldComplete||!day.hasItems||day.unknownItemCount!==0||day.subtotal===null||!Number.isFinite(day.subtotal)||day.subtotal<0)return {state:"unknown",reason:"Complete logging and known nutrient values are required; a subtotal alone is insufficient."};
  const {rule}=supported,value=day.subtotal;
  const met=rule.operator==="gte"?value>=rule.value:rule.operator==="lte"?value<=rule.value:value===rule.value;
  return {state:met?"adherent":"non-adherent",reason:met?"Frozen target met on a completely logged day.":"Frozen target not met on a completely logged day."};
}
