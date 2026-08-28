import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exactKeys, isObject } from "../../rules/validation.ts";
import { validateOutcome, type OutcomeInput } from "../validation.ts";
import { measurement } from "../registry.ts";
import { estimated1rmEpleyV1, type EpleySet, type EpleyExercise } from "../estimated-1rm.ts";
import { historicalWindow, isLogicalDate, dateInZone, shiftDate } from "../time-window.ts";
import type { SourceResult, SupportedKey, Observation } from "../observations.ts";
import { nutritionFields, readNutrition, readEpisodes, readSymptoms } from "./domain-readers.ts";
import { readinessPolicies } from "../readiness-policies.ts";

export const SOURCE_ROW_LIMIT = 1000;
const adapters: Record<SupportedKey, SourceResult["sourceDomain"]> = {
  energy_score: "checkins", mood_score: "checkins", sleep_quality_score: "checkins", exercise_estimated_1rm: "workouts",
  nutrition_calories: "nutrition", nutrition_protein_grams: "nutrition", nutrition_carbohydrate_grams: "nutrition", nutrition_fat_grams: "nutrition", nutrition_fiber_grams: "nutrition", nutrition_caffeine_mg: "nutrition", nutrition_alcohol_grams: "nutrition",
  condition_episode_frequency: "episodes", condition_episode_duration_hours: "episodes", condition_episode_peak_severity: "episodes", condition_episode_impact: "episodes",
  symptom_event_frequency: "symptoms", symptom_occurrence_count: "symptoms", symptom_severity: "symptoms", symptom_duration_minutes: "symptoms",
};
export type SourceRequest = { outcome: OutcomeInput; timeZone: string; startDate?: string; endDateExclusive?: string };
type Checkin = { id: string; user_id: string; checkin_date: string; energy_score: number | null; mood_score: number | null; sleep_quality: string | null };
type WorkoutRow = EpleySet & { id: string; set_number: number; completed_at: string | null;
  session: { id: string; user_id: string; session_date: string; started_at: string };
  exercise: EpleyExercise & { group_order: number; exercise_order: number } };
const sleepCategories = ["Poor", "Average", "Good", "Great"];
function exclude(result: SourceResult, reason: string) {
  result.counts.excluded++;result.exclusions[reason] = (result.exclusions[reason] ?? 0) + 1;
}
function inWindow(date: string, result: SourceResult) { return isLogicalDate(date) && date >= result.window.startDate && date < result.window.endDateExclusive; }

/** Only server code supplies the authenticated cookie client and optional clock.
 * Request data cannot supply owner, cutoff, SQL, columns or formula. No writes.
 */
export async function readObservations(client: SupabaseClient, request: SourceRequest, clock: () => Date = () => new Date()): Promise<SourceResult> {
  const auth = await client.auth.getUser().catch(() => { throw new Error("AUTH_REQUIRED"); });
  if (auth.error || !auth.data.user) throw new Error("AUTH_REQUIRED");
  const userId = auth.data.user.id;
  if (!isObject(request) || !exactKeys(request, ["outcome", "timeZone"], ["startDate", "endDateExclusive"])) throw new Error("INVALID_REQUEST");
  if ((request.startDate !== undefined && typeof request.startDate !== "string") || (request.endDateExclusive !== undefined && typeof request.endDateExclusive !== "string")) throw new Error("INVALID_WINDOW");
  validateOutcome(request.outcome);
  const outcome = request.outcome;
  if (outcome.registry_version !== 1 || !Object.hasOwn(adapters, outcome.registry_key)) throw new Error("UNSUPPORTED_SOURCE");
  const key = outcome.registry_key as SupportedKey, definition = measurement(key, 1)!;
  const evaluatedAt = clock();
  const defaults = request.startDate === undefined && request.endDateExclusive === undefined;
  const end = defaults ? dateInZone(evaluatedAt, request.timeZone) : request.endDateExclusive;
  const window = historicalWindow(request.timeZone, evaluatedAt, defaults ? shiftDate(end!, -readinessPolicies[key].defaultWindowDays) : request.startDate, end);
  const result: SourceResult = { contractVersion: 1, registryKey: key, registryVersion: 1, adapterVersion: 1,
    sourceDomain: adapters[key], target: outcome.exercise_id ? { kind: "exercise", exerciseId: outcome.exercise_id }
      : adapters[key] === "symptoms" ? { kind: "symptom", ...(outcome.symptom_id ? { symptomId: outcome.symptom_id } : { userSymptomId: outcome.user_symptom_id }), ...(outcome.user_condition_id ? { conditionId: outcome.user_condition_id } : {}) }
      : outcome.user_condition_id ? { kind: "condition", conditionId: outcome.user_condition_id } : { kind: "none" },
    grain: definition.grain, unit: definition.unit, aggregation: outcome.aggregation_method, window, observations: [], observationCount: 0,
    queryCompleteness: "complete", counts: { sourceRows: 0, nullValues: 0, excluded: 0, censored: 0, absentDays: null }, exclusions: {},
    warnings: [], temporalLimitations: ["CURRENT_RECORD_RETROSPECTIVE", "MUTABLE_HISTORY_NOT_RECONSTRUCTED"] };
  if (window.effectiveEndAtExclusive !== window.endAtExclusive) result.warnings.push("PARTIAL_CURRENT_DAY");
  const signal = AbortSignal.timeout(10000);
  try {
    if (Object.hasOwn(nutritionFields, key)) await readNutrition(client, userId, result, signal);
    else if (adapters[key] === "episodes") await readEpisodes(client, userId, outcome, result, signal);
    else if (adapters[key] === "symptoms") await readSymptoms(client, userId, outcome, result, signal);
    else if (adapters[key] === "checkins") {
      const response = await client.from("daily_checkins").select("id,user_id,checkin_date,energy_score,mood_score,sleep_quality", { count: "exact" })
        .eq("user_id", userId).gte("checkin_date", window.startDate).lt("checkin_date", window.endDateExclusive)
        .order("checkin_date").order("id").limit(SOURCE_ROW_LIMIT).abortSignal(signal);
      if (response.error || response.data === null) throw new Error("SOURCE_READ_FAILED");
      checkCompleteness(result, response.count, response.data.length);
      const dates = new Set<string>();
      for (const row of response.data as Checkin[]) {
        if (row.user_id !== userId || !inWindow(row.checkin_date, result)) { exclude(result, "INVALID_OWNER_OR_DATE");continue; }
        if (dates.has(row.checkin_date)) throw new Error("DUPLICATE_LOGICAL_DATE");
        dates.add(row.checkin_date);
        const value = key === "energy_score" ? row.energy_score : key === "mood_score" ? row.mood_score : row.sleep_quality;
        if (value == null) { result.counts.nullValues++;continue; }
        if (key === "sleep_quality_score") {
          const rank = sleepCategories.indexOf(String(value));
          if (rank < 0) { exclude(result, "INVALID_ORDINAL");continue; }
          result.observations.push({ sourceId: row.id, logicalDate: row.checkin_date, precision: "date", eligibility: "eligible", value: { kind: "ordinal", value: rank + 1, category: sleepCategories[rank] } });
        } else if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10) {
          result.observations.push({ sourceId: row.id, logicalDate: row.checkin_date, precision: "date", eligibility: "eligible", value: { kind: "numeric", value } });
        } else exclude(result, "INVALID_SCORE");
      }
      if (result.queryCompleteness === "complete") result.counts.absentDays = window.expectedDays - dates.size;
    } else {
      const target = await client.from("exercises").select("id,user_id").eq("id", outcome.exercise_id!).limit(1).abortSignal(signal).maybeSingle();
      if (target.error) throw new Error("SOURCE_READ_FAILED");
      if (!target.data || target.data.id !== outcome.exercise_id || (target.data.user_id !== null && target.data.user_id !== userId)) throw new Error("TARGET_NOT_FOUND");
      const response = await client.from("workout_session_sets").select(
        "id,user_id,workout_session_id,workout_session_exercise_id,set_number,set_type,status,actual_weight,actual_reps,completed_at,session:workout_sessions!workout_session_sets_workout_session_id_fkey!inner(id,user_id,session_date,started_at),exercise:workout_session_exercises!workout_session_sets_workout_session_exercise_id_fkey!inner(id,user_id,workout_session_id,exercise_id,tracking_type,group_order,exercise_order)", { count: "exact" })
        .eq("user_id", userId).eq("session.user_id", userId).eq("exercise.user_id", userId).eq("exercise.exercise_id", outcome.exercise_id!)
        .gte("session.session_date", window.startDate).lt("session.session_date", window.endDateExclusive)
        .order("id").limit(SOURCE_ROW_LIMIT).abortSignal(signal);
      if (response.error || response.data === null) throw new Error("SOURCE_READ_FAILED");
      checkCompleteness(result, response.count, response.data.length);
      const seen = new Set<string>();
      for (const row of response.data as unknown as WorkoutRow[]) {
        if (seen.has(row.id)) throw new Error("DUPLICATE_SOURCE_RECORD");
        seen.add(row.id);
        const session = row.session, exercise = row.exercise;
        if (!session || !exercise || session.user_id !== userId || row.user_id !== userId || exercise.user_id !== userId
          || session.id !== row.workout_session_id || exercise.workout_session_id !== session.id || exercise.id !== row.workout_session_exercise_id
          || exercise.exercise_id !== outcome.exercise_id || !inWindow(session.session_date, result)
          || !Number.isFinite(Date.parse(session.started_at)) || !Number.isInteger(exercise.group_order) || !Number.isInteger(exercise.exercise_order) || !Number.isInteger(row.set_number)) { exclude(result, "INVALID_PARENT_CHAIN");continue; }
        if (row.completed_at !== null && (!Number.isFinite(Date.parse(row.completed_at)) || Date.parse(row.completed_at) >= Date.parse(window.evaluatedAt))) {
          result.counts.censored++;continue;
        }
        if (row.status !== "completed" || row.set_type !== "working" || exercise.tracking_type !== "weight_reps") { exclude(result, "INELIGIBLE_SET");continue; }
        if (row.actual_weight == null || row.actual_reps == null) { result.counts.nullValues++;continue; }
        const value = estimated1rmEpleyV1(row, exercise, { userId, exerciseId: outcome.exercise_id! });
        if (value === null) { exclude(result, "INVALID_ACTUAL_VALUES");continue; }
        if (row.completed_at === null && !result.warnings.includes("COMPLETION_TIME_UNKNOWN")) result.warnings.push("COMPLETION_TIME_UNKNOWN");
        result.observations.push({ sourceId: row.id, logicalDate: session.session_date, precision: "date", eligibility: "eligible", value: { kind: "numeric", value },
          workout: { sessionId: session.id, sessionStartedAt: session.started_at, groupOrder: exercise.group_order, exerciseOrder: exercise.exercise_order, setNumber: row.set_number, completedAt: row.completed_at, actualWeight: row.actual_weight, actualReps: row.actual_reps } });
      }
      result.warnings.push("APP_LB_CONVENTION_NO_ROW_UNIT_PROVENANCE", "ESTIMATE_NOT_MEASURED_1RM", "LOGGED_IMPLEMENT_LOAD_UNCHANGED");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "TARGET_NOT_FOUND") throw error;
    result.queryCompleteness = "failed";result.observations = [];result.counts.absentDays = null;result.warnings.push("SOURCE_READ_FAILED");
  }
  result.observations.sort(compareObservations);result.observationCount = result.observations.length;
  return result;
}
function checkCompleteness(result: SourceResult, count: number | null, length: number) {
  result.counts.sourceRows = length;
  if (count === null || length >= SOURCE_ROW_LIMIT || count !== length) { result.queryCompleteness = "truncated";result.warnings.push("SOURCE_TRUNCATED"); }
}
/** Logical date, then persisted session order, exercise/set order and stable ID.
 * Tie breaks are deterministic ordering, not fabricated observation times.
 */
export function compareObservations(a: Observation, b: Observation) {
  return a.logicalDate.localeCompare(b.logicalDate) || (a.occurredAt && b.occurredAt ? Date.parse(a.occurredAt) - Date.parse(b.occurredAt) : 0) || (a.workout && b.workout ? Date.parse(a.workout.sessionStartedAt) - Date.parse(b.workout.sessionStartedAt) : 0)
    || (a.workout?.sessionId ?? "").localeCompare(b.workout?.sessionId ?? "") || (a.workout?.groupOrder ?? 0) - (b.workout?.groupOrder ?? 0) || (a.workout?.exerciseOrder ?? 0) - (b.workout?.exerciseOrder ?? 0)
    || (a.workout?.setNumber ?? 0) - (b.workout?.setNumber ?? 0) || a.sourceId.localeCompare(b.sourceId);
}
