import { classificationKeys, type RuleDefinition } from "./types.ts";

export function exactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  return required.every(k => Object.hasOwn(value, k)) && Object.keys(value).every(k => required.includes(k) || optional.includes(k));
}
export function isObject(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
export function isUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}
/** No arbitrary expressions or user-supplied source names. SQL independently enforces this contract. */
export function validateRule(value: unknown): asserts value is RuleDefinition {
  if (!isObject(value) || JSON.stringify(value).length > 2048 || value.version !== 1) throw new Error("INVALID_RULE");
  const base = ["version", "domain", "kind", "metric", "operator", "period"];
  const numeric = typeof value.value === "number" && Number.isFinite(value.value) && value.value >= 0 && value.value <= 1000000;
  let valid = false;
  if (value.domain === "nutrition" && value.period === "day") {
    if (value.kind === "numeric") {
      const units: Record<string, string> = { calories: "kcal", protein_grams: "g", carbohydrate_grams: "g", fat_grams: "g", fiber_grams: "g", alcohol_occurrences: "count" };
      valid = exactKeys(value, [...base, "value", "unit"]) && numeric && units[String(value.metric)] === value.unit && ["gte", "lte", "eq"].includes(String(value.operator));
      if (value.metric === "alcohol_occurrences") valid = valid && Number.isInteger(value.value) && value.operator === "eq" && value.value === 0;
    } else if (value.kind === "exclusion") {
      valid = exactKeys(value, [...base, "classification"]) && value.metric === "food_classification" && value.operator === "excludes" && classificationKeys.includes(value.classification as typeof classificationKeys[number]);
    } else if (value.kind === "cutoff") {
      valid = exactKeys(value, [...base, "local_time", "time_zone"]) && value.metric === "food_time" && value.operator === "not_after" && typeof value.local_time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.local_time) && isTimeZone(value.time_zone);
    }
  } else if (value.domain === "exercise") {
    valid = exactKeys(value, [...base, "value", "unit", "exercise_id"]) && value.kind === "numeric" && value.metric === "exercise_sessions" && value.operator === "gte" && value.period === "week" && value.unit === "count" && numeric && Number.isInteger(value.value) && isUuid(value.exercise_id);
  }
  if (!valid) throw new Error("INVALID_RULE");
}
