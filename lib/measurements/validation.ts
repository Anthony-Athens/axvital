import { exactKeys, isObject, isUuid } from "../rules/validation.ts";
import { measurement } from "./registry.ts";
export type SuccessCriterion =
  | { version: 1; kind: "change"; basis: "absolute" | "percent"; direction: "increase" | "decrease"; operator: "gte"; amount: number; unit: string }
  | { version: 1; kind: "target_value"; operator: "lte" | "gte" | "eq"; value: number; unit: string };
export type OutcomeInput = { registry_key: string; registry_version: 1|2; outcome_role: "primary" | "secondary"; aggregation_method: string; expected_direction: "increase" | "decrease" | "maintain" | "unknown"; source_config: Record<string, never>; user_condition_id?: string; symptom_id?: string; user_symptom_id?: string; exercise_id?: string; success_criterion?: SuccessCriterion };
export function validateOutcome(value: unknown): asserts value is OutcomeInput {
  if (!isObject(value) || !exactKeys(value, ["registry_key", "registry_version", "outcome_role", "aggregation_method", "expected_direction", "source_config"], ["user_condition_id", "symptom_id", "user_symptom_id", "exercise_id", "success_criterion"])) throw new Error("INVALID_OUTCOME");
  const def = measurement(String(value.registry_key), Number(value.registry_version));
  if (![1,2].includes(Number(value.registry_version)) || typeof value.registry_version !== "number" || typeof value.registry_key !== "string") throw new Error("INVALID_OUTCOME");
  if (!def?.enabled || !["primary", "secondary"].includes(String(value.outcome_role)) || !def.aggregations.includes(String(value.aggregation_method)) || !def.direction.includes(value.expected_direction as typeof def.direction[number]) || !isObject(value.source_config) || Object.keys(value.source_config).length) throw new Error("INVALID_OUTCOME");
  for (const key of ["user_condition_id", "symptom_id", "user_symptom_id", "exercise_id"]) if (key in value && !isUuid(value[key])) throw new Error("INVALID_TARGET");
  const symptomCount = Number("symptom_id" in value) + Number("user_symptom_id" in value);
  if (def.target === "none" && (symptomCount || value.user_condition_id || value.exercise_id) || def.target === "condition" && (!value.user_condition_id || symptomCount || value.exercise_id) || def.target === "exercise" && (!value.exercise_id || symptomCount || value.user_condition_id) || def.target === "symptom" && (symptomCount !== 1 || value.exercise_id)) throw new Error("INVALID_TARGET");
  if (value.success_criterion !== undefined) {
    const c = value.success_criterion;
    if (value.outcome_role !== "primary" || !isObject(c) || c.version !== 1) throw new Error("INVALID_CRITERION");
    if (c.kind === "change") {
      if (!exactKeys(c, ["version", "kind", "basis", "direction", "operator", "amount", "unit"]) || !["absolute", "percent"].includes(String(c.basis)) || !["increase", "decrease"].includes(String(c.direction)) || c.operator !== "gte" || typeof c.amount !== "number" || !Number.isFinite(c.amount) || c.amount < 0 || c.amount > 1000000 || def.scale === "ordinal" || c.basis === "percent" && def.scale !== "ratio" || c.unit !== (c.basis === "percent" ? "%" : def.unit)) throw new Error("INVALID_CRITERION");
    } else if (c.kind === "target_value") {
      if (!exactKeys(c, ["version", "kind", "operator", "value", "unit"]) || !["lte", "gte", "eq"].includes(String(c.operator)) || typeof c.value !== "number" || !Number.isFinite(c.value) || c.value < 0 || c.value > 1000000 || c.unit !== def.unit || (def.scale === "rating" && (c.value < 1 || c.value > 10)) || (def.scale === "ordinal" && (!Number.isInteger(c.value) || c.value > 4 || c.value < (def.unit === "ordinal_4" ? 1 : 0)))) throw new Error("INVALID_CRITERION");
    } else throw new Error("INVALID_CRITERION");
  }
}
