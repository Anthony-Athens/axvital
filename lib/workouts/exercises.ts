import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { EQUIPMENT_OPTIONS, EXERCISE_CATEGORIES, MOVEMENT_PATTERNS, TRACKING_TYPES, isMetadataValue, normalizeExerciseName, normalizeMetadataValue } from "./exercise-metadata.ts";
import type { Exercise, ExerciseCategory, ExerciseEquipment, ExerciseTrackingType, MovementPattern } from "./types.ts";

export type ExerciseFilters = { category?: ExerciseCategory; equipment?: ExerciseEquipment; movement_pattern?: MovementPattern; primary_muscle_group?: string; default_tracking_type?: ExerciseTrackingType };
export type CreateExerciseInput = { name: string; description?: string | null; category: string; movement_pattern?: string | null; primary_muscle_group?: string | null; secondary_muscle_groups?: string[] | null; equipment?: string | null; default_tracking_type: string; aliases?: string[] };

export class ExerciseDuplicateError extends Error {
  readonly existing: Exercise;
  constructor(existing: Exercise) { super(`Exercise already exists: ${existing.name}`); this.name = "ExerciseDuplicateError"; this.existing = existing; }
}

async function requireUserId(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("AUTH_REQUIRED");
  return data.user.id;
}

function logDatabaseError(context: string, error: PostgrestError) {
  if (process.env.NODE_ENV === "development") console.error(`[exercises] ${context}`, { message: error.message, details: error.details, hint: error.hint, code: error.code });
}

const optionalText = (value?: string | null) => value?.trim() || null;

export function normalizeCreateExerciseInput(input: CreateExerciseInput) {
  const name = input.name.trim();
  const category = normalizeMetadataValue(input.category);
  const movement = normalizeMetadataValue(input.movement_pattern);
  const equipment = normalizeMetadataValue(input.equipment);
  const tracking = normalizeMetadataValue(input.default_tracking_type);
  if (!name) throw new Error("Exercise name is required.");
  if (!isMetadataValue(EXERCISE_CATEGORIES, category)) throw new Error("Choose a valid category.");
  if (movement && !isMetadataValue(MOVEMENT_PATTERNS, movement)) throw new Error("Choose a valid movement pattern.");
  if (equipment && !isMetadataValue(EQUIPMENT_OPTIONS, equipment)) throw new Error("Choose valid equipment.");
  if (!isMetadataValue(TRACKING_TYPES, tracking)) throw new Error("Choose a valid tracking type.");
  return {
    name,
    normalized_name: normalizeExerciseName(name),
    aliases: (input.aliases ?? []).map((alias) => alias.trim()).filter(Boolean),
    description: optionalText(input.description), category, movement_pattern: movement, equipment,
    primary_muscle_group: normalizeMetadataValue(input.primary_muscle_group),
    secondary_muscle_groups: (input.secondary_muscle_groups ?? []).map(normalizeMetadataValue).filter((value): value is string => Boolean(value)),
    default_tracking_type: tracking,
  };
}

export function exerciseMatchesSearch(exercise: Exercise, search: string) {
  const query = normalizeExerciseName(search);
  return !query || normalizeExerciseName(exercise.name).includes(query) || exercise.aliases.some((alias) => normalizeExerciseName(alias).includes(query));
}

export async function searchExercises(client: SupabaseClient, search = "", filters: ExerciseFilters = {}) {
  const userId = await requireUserId(client);
  let query = client.from("exercises").select("*").or(`user_id.eq.${userId},user_id.is.null`).eq("is_archived", false).order("name").limit(300);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.equipment) query = query.eq("equipment", filters.equipment);
  if (filters.movement_pattern) query = query.eq("movement_pattern", filters.movement_pattern);
  if (filters.primary_muscle_group) query = query.eq("primary_muscle_group", normalizeMetadataValue(filters.primary_muscle_group));
  if (filters.default_tracking_type) query = query.eq("default_tracking_type", filters.default_tracking_type);
  const { data, error } = await query;
  if (error) { logDatabaseError("search", error); throw new Error("We couldn’t load the exercise library."); }
  return ((data ?? []) as Exercise[]).filter((exercise) => exerciseMatchesSearch(exercise, search));
}

export async function findSimilarExercises(client: SupabaseClient, name: string) {
  const normalized = normalizeExerciseName(name);
  const all = await searchExercises(client);
  return all.filter((exercise) => {
    const candidate = normalizeExerciseName(exercise.name);
    return candidate === normalized || (normalized.length >= 4 && (candidate.includes(normalized) || normalized.includes(candidate)));
  }).slice(0, 5);
}

export async function createExercise(client: SupabaseClient, input: CreateExerciseInput) {
  const userId = await requireUserId(client);
  const payload = normalizeCreateExerciseInput(input);
  const duplicate = (await searchExercises(client)).find((exercise) => exercise.normalized_name === payload.normalized_name || normalizeExerciseName(exercise.name) === payload.normalized_name);
  if (duplicate) throw new ExerciseDuplicateError(duplicate);
  const { data, error } = await client.from("exercises").insert({ ...payload, user_id: userId }).select("*").single();
  if (error) { logDatabaseError("create", error); throw new Error("We couldn’t save this exercise."); }
  return data as Exercise;
}

export async function updateExercise(client: SupabaseClient, id: string, input: Partial<Exercise>) {
  const userId = await requireUserId(client);
  const { data, error } = await client.from("exercises").update(input).eq("id", id).eq("user_id", userId).select("*").single();
  if (error) { logDatabaseError("update", error); throw new Error("We couldn’t update this exercise."); }
  return data as Exercise;
}

export async function archiveExercise(client: SupabaseClient, id: string, archived = true) { return updateExercise(client, id, { is_archived: archived }); }
