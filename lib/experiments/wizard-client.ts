import type { discoverOutcomes } from "./discovery.ts";
import type { DraftV2Input, InterventionInput } from "./v2.ts";
import type { OutcomeInput } from "../measurements/validation.ts";
import type { ReadinessResult } from "../measurements/readiness-policies.ts";
import { dateInZone, shiftDate, calendarDays, isLogicalDate } from "../measurements/time-window.ts";
import { isUuid } from "../rules/validation.ts";
export type Discovery = ReturnType<typeof discoverOutcomes>;
export type Choice = Discovery["outcomes"][number];
export type Target = { id: string; label: string | null; identity: string; available: boolean };
export type TargetPage = { items: Target[]; nextCursor: string | null };
export type SavedExperiment = { id: string; config_revision: number; status: string; current_phase: string; question: string | null };
export type LoadedDraft = { experiment: DraftV2Input & SavedExperiment; interventions: (InterventionInput & { name: string })[]; outcomes: (OutcomeInput & { name: string })[]; targets: Target[] };
export const steps = ["Goal", "Outcome", "Change", "Design", "Review"];
export const interventionChoices = [
  { type: "habit", label: "Habit", kind: "habits", field: "linked_planned_activity_id", href: "/habits" },
  { type: "protocol", label: "Protocol", kind: "protocols", field: "linked_user_protocol_id", href: "/protocols" },
  { type: "nutrition_target", label: "Nutrition target", kind: "target_rules", field: "rule_id", href: "/health/nutrition/goals" },
  { type: "nutrition_pattern", label: "Nutrition pattern", kind: "nutrition_patterns", field: "nutrition_pattern_id", href: "/health/nutrition/goals" },
  { type: "workout", label: "Workout / training", kind: "workout_templates", field: "linked_workout_template_id", href: "/workouts" },
] as const;
export function outcomeChoices(discovery: Discovery, goal: string) { return discovery.outcomes.filter(o => o.group === goal).sort((a,b) => Number(b.primaryPerformancePreference)-Number(a.primaryPerformancePreference)); }
export function targetKind(outcome: Choice | undefined, catalog = false) { return outcome?.targetSelector === "condition" ? "conditions" : outcome?.targetSelector === "exercise" ? "exercises" : outcome?.targetSelector === "symptom" ? catalog ? "catalog_symptoms" : "symptoms" : null; }
export function chooseOutcome(choice: Choice): OutcomeInput { return { registry_key: choice.registryKey, registry_version: choice.registryVersion, outcome_role: "primary", aggregation_method: choice.recommendedAggregation, expected_direction: "unknown", source_config: {} }; }
export function targetSelected(choice: Choice | undefined, outcome?: OutcomeInput) { return !!choice?.enabled && !!outcome && (choice.targetSelector === "none" || choice.targetSelector === "condition" && !!outcome.user_condition_id || choice.targetSelector === "exercise" && !!outcome.exercise_id || choice.targetSelector === "symptom" && !!(outcome.user_symptom_id || outcome.symptom_id)); }
export function datePlan(timeZone: string, baselineDays: number, duration: number, now = new Date()) {
  const today = dateInZone(now, timeZone);
  return { baseline_start_date: shiftDate(today,-baselineDays), baseline_end_date: shiftDate(today,-1), intervention_start_date: today, intervention_end_date: shiftDate(today,duration-1) };
}
export function designError(input: DraftV2Input): string | null {
  if (!input.analysis_timezone) return "Choose an analysis timezone.";
  let today: string;try { today = dateInZone(new Date(), input.analysis_timezone); } catch { return "Enter a valid timezone, such as America/New_York."; }
  if (input.baseline_mode === "prospective") return "This saved draft uses a future baseline. Choose historical comparison or no baseline before starting.";
  if (!isLogicalDate(input.intervention_start_date) || !isLogicalDate(input.intervention_end_date)) return "Choose the experiment dates.";
  const duration = calendarDays(input.intervention_start_date, shiftDate(input.intervention_end_date,1));
  if (duration < 1 || duration > 366) return "The experiment must last between 1 and 366 days.";
  if (input.intervention_start_date !== today) return "To start now, set the experiment start date to today in your analysis timezone.";
  if (input.baseline_mode === "historical") {
    if (!isLogicalDate(input.baseline_start_date) || !isLogicalDate(input.baseline_end_date)) return "Choose the historical comparison dates.";
    const span = calendarDays(input.baseline_start_date, shiftDate(input.baseline_end_date,1));
    if (span < 1 || span > 366 || input.baseline_end_date >= today) return "Use 1–366 historical days ending before today.";
  } else if (input.baseline_mode !== "none") return "Choose a baseline design.";
  return null;
}
export function questionPreview(intervention: string | null, outcome: string | null, target: string | null) { return intervention && outcome ? `Does ${intervention} appear associated with a change in ${outcome.toLowerCase()}${target ? ` for ${target}` : ""}?` : "Choose a measurement and a change to build your question."; }
export function restoreDraft(data: LoadedDraft): DraftV2Input {
  const e = data.experiment;
  const clean = (value: object, keys: string[]) => Object.fromEntries(keys.filter(k => (value as Record<string, unknown>)[k] != null).map(k => [k, (value as Record<string, unknown>)[k]]));
  const intervention = data.interventions[0];
  return { ...clean(e, ["name","hypothesis","question","question_is_custom","analysis_timezone","baseline_mode","baseline_start_date","baseline_end_date","intervention_start_date","intervention_end_date"]),
    name: e.name, intervention: intervention ? clean(intervention, ["intervention_type", ...interventionChoices.map(i => i.field)]) as InterventionInput : null,
    outcomes: data.outcomes.map(o => clean(o,["registry_key","registry_version","outcome_role","aggregation_method","expected_direction","source_config","user_condition_id","symptom_id","user_symptom_id","exercise_id","success_criterion"]) as OutcomeInput) };
}
const messages: Record<string,string> = {
  AUTH_REQUIRED: "Please sign in again to continue.", PREMIUM_REQUIRED: "Premium is required to check a baseline, save or start. You can still explore and review your draft.",
  INVALID_ORIGIN: "This request could not be verified. Reload AXVital and try again.", INVALID_REQUEST: "Please check your selections and try again.", INVALID_CONFIGURATION: "Please review the measurement, change and dates before saving.",
  TARGET_NOT_FOUND: "A selected item is no longer available. Choose it again or select another item.", EXPERIMENT_NOT_FOUND: "This draft is no longer available. Check your experiments for its current status.",
  REVISION_CONFLICT: "Your experiment changed elsewhere. Reload the latest version before continuing.", EXPERIMENT_CONFIGURATION_INCOMPLETE: "Choose a measurement, its target and one change before starting.",
  START_DATE_MUST_BE_TODAY: "Set the start date to today in your analysis timezone, then save again.", PROSPECTIVE_RUNTIME_UNAVAILABLE: "Future-baseline starts are not available yet. Review the experiment design.",
  RATE_LIMITED: "Too many requests. Wait about a minute before trying again.", TEMPORARILY_UNAVAILABLE: "AXVital is temporarily unavailable. Please try again shortly.",
  BODY_TOO_LARGE: "This draft is too large. Shorten its text before saving.", CONFIGURATION_TOO_LARGE: "The selected plan is too large for an experiment. Choose a smaller plan.",
  EMPTY_PROTOCOL: "This protocol needs activities. Configure it in Protocols first.", EMPTY_PATTERN: "This nutrition pattern needs rules. Configure it first.", EMPTY_WORKOUT_TEMPLATE: "This workout needs exercises. Configure it first.",
  STARTED_CONFIGURATION_IMMUTABLE: "This experiment has already started. Open its status page to review it.",
  MUTATION_UNCERTAIN: "The request may have succeeded. Check Your experiments before trying again; another new-draft request could create a duplicate.",
};
export function errorMessage(code: string) { return messages[code] ?? "We couldn’t complete this request. Please try again."; }
export class WizardError extends Error { code: string; uncertain: boolean; constructor(code: string, uncertain = false) { super(errorMessage(code));this.code=code;this.uncertain=uncertain; } }
export async function wizardRequest<T>(path: string, body?: unknown, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<T> {
  let response: Response;
  try { response = await fetcher(`/api/experiments/v2/${path}`, { method: body === undefined ? "GET" : "POST", cache: "no-store", credentials: "same-origin", ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}), signal: signal ?? AbortSignal.timeout(20000) }); }
  catch { throw new WizardError("TEMPORARILY_UNAVAILABLE", body !== undefined); }
  let data;try { data = await response.json(); } catch { throw new WizardError("TEMPORARILY_UNAVAILABLE", body !== undefined); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new WizardError("TEMPORARILY_UNAVAILABLE", body !== undefined);
  if (path === "baseline-readiness" && response.status === 503 && data.contractVersion === 1 && ["failed","truncated"].includes(data.queryCompleteness)) return data as T;
  if (!response.ok) throw new WizardError(typeof data.error === "string" ? data.error : "TEMPORARILY_UNAVAILABLE", response.status >= 500 && body !== undefined);
  return data as T;
}
/** Only submit coordination and revisions, never domain/entitlement/readiness logic. */
export class DraftSession {
  id: string | null = null; revision = 0; busy = false; blocked = false; saved = ""; started = false;
  private send: typeof wizardRequest;
  constructor(send: typeof wizardRequest = wizardRequest) { this.send=send; }
  restore(data: LoadedDraft, input: DraftV2Input) { this.id = data.experiment.id;this.revision = data.experiment.config_revision;this.saved = JSON.stringify(input);this.blocked = false;this.started=false; }
  isSaved(input: DraftV2Input) { return !!this.id && this.saved === JSON.stringify(input); }
  async save(input: DraftV2Input) {
    if (this.busy || this.blocked || this.started) throw new WizardError("MUTATION_UNCERTAIN");
    this.busy = true;
    try {
      const result = await this.send<{ experiment: SavedExperiment }>("draft", { id: this.id, revision: this.revision, input });
      if (!isUuid(result?.experiment?.id) || (this.id && result.experiment.id!==this.id) || result.experiment.config_revision!==this.revision+1 || result.experiment.status!=="draft") throw new WizardError("TEMPORARILY_UNAVAILABLE", true);
      this.id = result.experiment.id;this.revision = result.experiment.config_revision;this.saved = JSON.stringify(input);return result.experiment;
    } catch (e) { if (!(e instanceof WizardError) || e.uncertain || e.code === "REVISION_CONFLICT") this.blocked = true;throw e instanceof WizardError?e:new WizardError("MUTATION_UNCERTAIN",true); }
    finally { this.busy = false; }
  }
  async start(input: DraftV2Input) {
    if (this.busy || this.blocked || this.started || !this.isSaved(input)) throw new WizardError("REVISION_CONFLICT");
    this.busy = true;
    try { const result=(await this.send<{ experiment: SavedExperiment }>("start", { id: this.id, revision: this.revision }))?.experiment;
      if (!result || result.id!==this.id || result.config_revision!==this.revision || !result.status || !result.current_phase) throw new WizardError("MUTATION_UNCERTAIN",true);
      this.started=true;return result; }
    catch (e) { if (!(e instanceof WizardError) || e.uncertain || e.code === "REVISION_CONFLICT") this.blocked = true;throw e instanceof WizardError?e:new WizardError("MUTATION_UNCERTAIN",true); }
    finally { this.busy = false; }
  }
}
export function readinessKey(input: DraftV2Input) { return JSON.stringify({outcome:input.outcomes?.find(o=>o.outcome_role==="primary"),timeZone:input.analysis_timezone,start:input.baseline_start_date,end:input.baseline_end_date,mode:input.baseline_mode}); }
export function startDestination(result: SavedExperiment) { return `/experiments/${result.id}?started=1`; }
export function readinessPresentation(r: ReadinessResult) {
  if (r.queryCompleteness !== "complete") return { title: "Baseline check unavailable", facts: ["The data could not be fully read. This is a technical issue, not a lack of history."], warnings: [] };
  const title = r.registryKey === "body_weight" && r.classification === null ? "Historical weight data unavailable" : r.classification === "good" ? "Good baseline data" : r.classification === "limited" ? "Limited baseline data" : "Not enough baseline data yet";
  const facts = r.workout ? [`${r.workout.eligibleSetCount} eligible sets · ${r.workout.distinctSessionCount} sessions · ${r.workout.distinctDateCount} dates`, `Latest Estimated 1RM: ${r.workout.latestValue ?? "Not available"} ${r.unit}`, `Best Estimated 1RM: ${r.workout.bestValue ?? "Not available"} ${r.unit}`]
    : r.nutrition ? [`${r.nutrition.qualifyingCompleteDays} complete logging and nutrient days of ${r.nutrition.requestedDays}`, `${r.nutrition.fieldIncompleteDays} nutrient-incomplete days · ${r.nutrition.partialDays} partial logging days · ${r.nutrition.unknownCoverageDays} unknown logging days`, `Qualifying logging coverage: ${r.coverage.percentage ?? "Unknown"}%`]
    : r.recordedTotal != null ? [`${r.recordedTotal} recorded ${r.target.kind === "condition" ? "episodes" : "events or occurrences"}`] : [`${r.observationCount} observations across ${r.distinctDays} tracked days`];
  const warnings: string[] = [];
  if (r.warnings.includes("WEIGHT_UNVERIFIED_RECORDS_EXCLUDED")) warnings.push("Some weight records have unverified units or invalid values, so they cannot safely be used for an experiment.");
  if (r.registryKey === "body_weight" && r.classification !== "good") warnings.push("Keep tracking your weight with explicit units for a few more days to establish a baseline.");
  if (r.warnings.some(w => w.includes("SURVEILLANCE_DENOMINATOR"))) warnings.push("Recorded counts do not prove that no episodes or symptoms occurred during untracked periods.");
  if (r.nutrition) warnings.push("Missing entries and unknown nutrients are not zero intake. Logged totals and logging coverage are not dietary compliance.");
  if (r.workout) warnings.push("Estimated 1RM is an estimate from eligible logged sets, not a measured true 1RM.");
  if (r.missingness.censored) warnings.push(`${r.missingness.censored} unresolved or incomplete records could not provide a duration.`);
  if (r.classification !== "good") warnings.push("You may continue with limited history; comparisons will need extra care.");
  warnings.push("This is a preview of currently recorded data, not medical confidence or proof of cause and effect.");
  return { title, facts, warnings };
}
