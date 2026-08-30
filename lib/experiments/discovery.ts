import { outcomeRegistry, WORKOUT_PERFORMANCE_PRIMARY_OUTCOME, type MeasurementDefinition } from "../measurements/registry.ts";
import { readinessPolicies } from "../measurements/readiness-policies.ts";
export const goalGroups = ["Lose Weight / Improve Body Composition", "Improve Sleep", "Improve Fitness / Performance", "Improve Nutrition", "Manage a Condition or Symptoms", "Improve Mood / Energy", "Other"] as const;
const analyzableOutcomes=new Set(["body_weight","energy_score","mood_score","sleep_quality_score","nutrition_calories","nutrition_protein_grams","nutrition_carbohydrate_grams","nutrition_fat_grams","nutrition_fiber_grams","nutrition_caffeine_mg","nutrition_alcohol_grams"]);
function group(d: MeasurementDefinition) {
  if (d.key === "body_weight") return goalGroups[0];
  if (d.key === "sleep_quality_score") return goalGroups[1];
  if (d.target === "exercise") return goalGroups[2];
  if (d.sourceAdapter === "nutrition") return goalGroups[3];
  if (d.target === "condition" || d.target === "symptom") return goalGroups[4];
  if (d.key === "energy_score" || d.key === "mood_score") return goalGroups[5];
  return goalGroups[6];
}
export function discoverOutcomes() {
  return { registryVersion: 1, goalGroups, baselineModes: ["historical", "none"], prospective: { storageSupported: true, runtimeAvailable: false }, outcomes: outcomeRegistry.filter(d=>!outcomeRegistry.some(newer=>newer.key===d.key&&newer.version>d.version)).map(d => {
    const policy = readinessPolicies[d.key as keyof typeof readinessPolicies];
    return { registryKey: d.key, registryVersion: d.version, label: d.label, group: group(d), description: d.limitations,
      unit: d.unit, grain: d.grain, scale: d.scale, aggregations: d.aggregations, recommendedAggregation: d.aggregations[0],
      targetSelector: d.target, symptomIdentities: d.target === "symptom" ? ["user_symptom_id", "symptom_id"] : undefined,
      enabled: d.enabled, disabledReason: d.enabled ? null : d.disabledReason,
      readinessAvailable: d.enabled && !!policy, analysisAvailable:d.enabled&&analyzableOutcomes.has(d.key), readinessPolicyVersion: d.enabled && policy ? policy.policyVersion : null,
      readinessUnavailableReason: d.enabled && !policy ? "READINESS_NOT_IMPLEMENTED" : !d.enabled ? "OUTCOME_UNAVAILABLE" : null,
      recommendedWindowDays: policy?.defaultWindowDays ?? null, primaryPerformancePreference: d.key === WORKOUT_PERFORMANCE_PRIMARY_OUTCOME,
      baselineModes: d.enabled ? ["historical", "none"] : [],
    };
  }) };
}
