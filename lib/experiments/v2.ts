import type { SupabaseClient } from "@supabase/supabase-js";
import { isCalendarDate } from "../timeline/dates.ts";
import { exactKeys, isObject, isTimeZone, isUuid } from "../rules/validation.ts";
import { validateOutcome, type OutcomeInput } from "../measurements/validation.ts";
import type { Experiment } from "./experiments.ts";
import { experimentError } from "./api-errors.ts";

export type InterventionInput =
  | { intervention_type: "habit"; linked_planned_activity_id: string }
  | { intervention_type: "protocol"; linked_user_protocol_id: string }
  | { intervention_type: "workout"; linked_workout_template_id: string }
  | { intervention_type: "nutrition_target"; rule_id: string }
  | { intervention_type: "nutrition_pattern"; nutrition_pattern_id: string };
export type DraftV2Input = {
  name: string; hypothesis?: string; question?: string; question_is_custom?: boolean;
  analysis_timezone?: string | null; baseline_mode?: "historical" | "prospective" | "none" | null;
  baseline_start_date?: string | null; baseline_end_date?: string | null; intervention_start_date?: string | null; intervention_end_date?: string | null;
  intervention?: InterventionInput | null; outcomes?: OutcomeInput[];
};
export type ExperimentV2 = Experiment & { model_version: 2; config_revision: number; question: string | null; question_is_custom: boolean; analysis_timezone: string | null; baseline_mode: "historical" | "prospective" | "none" | null };
export function generateQuestion(interventionName: string | null, outcomeLabel: string | null, targetLabel: string | null = null): string | null {
  return interventionName && outcomeLabel ? `Does ${interventionName} appear associated with a change in ${outcomeLabel.toLowerCase()}${targetLabel ? ` for ${targetLabel}` : ""}?` : null;
}
export function validateV2Draft(input: unknown): asserts input is DraftV2Input {
  if (!isObject(input) || !exactKeys(input, ["name"], ["hypothesis", "question", "question_is_custom", "analysis_timezone", "baseline_mode", "baseline_start_date", "baseline_end_date", "intervention_start_date", "intervention_end_date", "intervention", "outcomes"]) || new TextEncoder().encode(JSON.stringify(input)).length > 16384 || typeof input.name !== "string" || input.name.trim().length < 2 || input.name.trim().length > 120) throw new Error("INVALID_DRAFT");
  if (input.hypothesis !== undefined && (typeof input.hypothesis !== "string" || input.hypothesis.trim().length < 10 || input.hypothesis.trim().length > 500)) throw new Error("INVALID_HYPOTHESIS");
  if (input.question_is_custom !== undefined && typeof input.question_is_custom !== "boolean") throw new Error("INVALID_QUESTION");
  if (input.question !== undefined && (typeof input.question !== "string" || input.question.length > 500)) throw new Error("INVALID_QUESTION");
  if (input.question_is_custom && (typeof input.question !== "string" || input.question.trim().length < 10)) throw new Error("INVALID_QUESTION");
  if (input.analysis_timezone != null && !isTimeZone(input.analysis_timezone)) throw new Error("INVALID_TIME_ZONE");
  if (input.baseline_mode != null && !["historical", "prospective", "none"].includes(String(input.baseline_mode))) throw new Error("INVALID_BASELINE_MODE");
  for (const key of ["baseline_start_date", "baseline_end_date", "intervention_start_date", "intervention_end_date"]) if (input[key] != null && !isCalendarDate(input[key])) throw new Error("INVALID_DATE");
  if (input.intervention != null) {
    const i = input.intervention;
    const fields: Record<string, string> = { habit: "linked_planned_activity_id", protocol: "linked_user_protocol_id", workout: "linked_workout_template_id", nutrition_target: "rule_id", nutrition_pattern: "nutrition_pattern_id" };
    if (!isObject(i) || !fields[String(i.intervention_type)] || !exactKeys(i, ["intervention_type", fields[String(i.intervention_type)]]) || !isUuid(i[fields[String(i.intervention_type)]])) throw new Error("INVALID_INTERVENTION");
  }
  if (input.outcomes !== undefined) {
    if (!Array.isArray(input.outcomes) || input.outcomes.length > 4) throw new Error("INVALID_OUTCOMES");
    input.outcomes.forEach(validateOutcome);
    if (input.outcomes.filter(o => o.outcome_role === "primary").length > 1) throw new Error("INVALID_OUTCOMES");
  }
}
async function owner(client: SupabaseClient) { const { data, error } = await client.auth.getUser(); if (error || !data.user) throw new Error("AUTH_REQUIRED"); }
export async function saveV2Draft(client: SupabaseClient, input: DraftV2Input, id: string | null = null, revision = 0): Promise<ExperimentV2> {
  validateV2Draft(input); await owner(client);
  if (id !== null && !isUuid(id) || !Number.isInteger(revision) || revision < 0) throw new Error("INVALID_REVISION");
  const { data, error } = await client.rpc("save_experiment_v2", { target_id: id, expected_revision: revision, input });
  if (error) throw experimentError(error, true);
  return data as ExperimentV2;
}
export async function startV2Experiment(client: SupabaseClient, id: string, revision: number): Promise<ExperimentV2> {
  await owner(client); if (!isUuid(id) || !Number.isInteger(revision) || revision < 1) throw new Error("INVALID_REVISION");
  const { data, error } = await client.rpc("start_experiment_v2", { target_id: id, expected_revision: revision });
  if (error) throw experimentError(error, true);
  return data as ExperimentV2;
}
