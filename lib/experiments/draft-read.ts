import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "../api/validation.ts";
import { targetKindByField, targetRows, type DiscoveryKind } from "./targets.ts";
export const experimentFields = "id,name,hypothesis,question,question_is_custom,model_version,status,current_phase,config_revision,analysis_timezone,baseline_mode,baseline_start_date,baseline_end_date,intervention_start_date,intervention_end_date";
const interventionFields = "intervention_type,name,linked_planned_activity_id,linked_user_protocol_id,linked_workout_template_id,rule_id,nutrition_pattern_id";
const outcomeFields = "name,registry_key,registry_version,outcome_role,aggregation_method,expected_direction,source_config,user_condition_id,symptom_id,user_symptom_id,exercise_id,success_criterion";
type Row = Record<string, unknown>;
export function publicExperiment(row: Row) { return Object.fromEntries(experimentFields.split(",").map(key => [key, row[key]])); }
export async function ownedExperiment(client: SupabaseClient, owner: string, id: string) {
  const { data, error } = await client.from("experiments").select(experimentFields).eq("user_id", owner).eq("id", id).eq("model_version", 2).limit(1).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
  if (error) throw new ApiError(503, "TEMPORARILY_UNAVAILABLE");
  if (!data) throw new ApiError(404, "EXPERIMENT_NOT_FOUND");
  return data as unknown as Row;
}
export async function loadDraft(client: SupabaseClient, owner: string, id: string) {
  const { data, error } = await client.from("experiments").select(`${experimentFields},interventions:experiment_interventions(${interventionFields}),outcomes:experiment_outcomes(${outcomeFields})`)
    .eq("user_id", owner).eq("id", id).eq("model_version", 2).eq("status", "draft")
    .limit(2, { referencedTable: "experiment_interventions" }).limit(5, { referencedTable: "experiment_outcomes" }).limit(1).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
  if (error) throw new ApiError(503, "TEMPORARILY_UNAVAILABLE");
  if (!data) throw new ApiError(404, "EXPERIMENT_NOT_FOUND");
  const row = data as unknown as Row, interventions = row.interventions as Row[], outcomes = row.outcomes as Row[];
  if (!Array.isArray(interventions) || !Array.isArray(outcomes) || interventions.length > 1 || outcomes.length > 4) throw new ApiError(409, "EXPERIMENT_CONFIGURATION_INCOMPLETE");
  const project = (value: Row, fields: string) => Object.fromEntries(fields.split(",").map(key => [key, value[key]]));
  const configurations = [...interventions, ...outcomes], references = new Map<DiscoveryKind, Set<string>>();
  for (const config of configurations) for (const [field, kind] of Object.entries(targetKindByField)) if (typeof config[field] === "string") {
    const ids = references.get(kind) ?? new Set<string>(); ids.add(config[field]); references.set(kind, ids);
  }
  const targets = (await Promise.all([...references].map(async ([kind, ids]) => {
    const found = await targetRows(client, kind, "", null, 10, [...ids]);
    return [...ids].map(id => ({ kind, ...(found.find(t => t.id === id) ?? { id, label: null, available: false }) }));
  }))).flat();
  return { experiment: publicExperiment(row), interventions: interventions.map(i => project(i, interventionFields)), outcomes: outcomes.map(o => project(o, outcomeFields)), targets,
    prospectiveRuntimeAvailable: false, readinessIsPreview: true };
}
