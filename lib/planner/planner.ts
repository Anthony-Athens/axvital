import type { SupabaseClient, User } from "@supabase/supabase-js";
import { buildOccurrenceRows } from "./recurrence";
import type { CreatePlannedActivityInput, OccurrenceStatus, PlannedActivity, PlannedActivityOccurrence, UpdatePlannedActivityInput } from "./types";

async function requireUser(client: SupabaseClient): Promise<User> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("AUTH_REQUIRED");
  return data.user;
}

export async function getPlannedActivitiesForRange(client: SupabaseClient, start: string, end: string) {
  const user = await requireUser(client);
  const { data, error } = await client.from("planned_activities").select("*")
    .eq("user_id", user.id).eq("is_active", true).lte("start_date", end)
    .or(`end_date.is.null,end_date.gte.${start}`);
  if (error) throw error;
  return (data ?? []) as PlannedActivity[];
}

export async function ensureOccurrencesForRange(client: SupabaseClient, start: string, end: string) {
  const user = await requireUser(client);
  const activities = await getPlannedActivitiesForRange(client, start, end);
  const rows = buildOccurrenceRows(activities, user.id, start, end);
  if (rows.length) {
    const { error } = await client.from("planned_activity_occurrences").upsert(rows, { onConflict: "planned_activity_id,scheduled_date", ignoreDuplicates: true });
    if (error) throw error;
  }
  return rows.length;
}

export async function getOccurrencesForRange(client: SupabaseClient, start: string, end: string) {
  const user = await requireUser(client);
  await ensureOccurrencesForRange(client, start, end);
  const { data, error } = await client.from("planned_activity_occurrences")
    .select("*,planned_activity:planned_activities(*)").eq("user_id", user.id)
    .gte("scheduled_date", start).lte("scheduled_date", end)
    .order("scheduled_date").order("scheduled_time", { nullsFirst: false }).order("created_at");
  if (error) throw error;
  return (data ?? []) as PlannedActivityOccurrence[];
}

export function getOccurrencesForDate(client: SupabaseClient, date: string) {
  return getOccurrencesForRange(client, date, date);
}

export async function createPlannedActivity(client: SupabaseClient, input: CreatePlannedActivityInput) {
  const user = await requireUser(client);
  const { data, error } = await client.from("planned_activities").insert({ ...input, user_id: user.id }).select("*").single();
  if (error) throw error;
  return data as PlannedActivity;
}

export async function updatePlannedActivity(client: SupabaseClient, id: string, input: UpdatePlannedActivityInput, futureFrom: string) {
  const user = await requireUser(client);
  const { data, error } = await client.from("planned_activities").update(input).eq("id", id).eq("user_id", user.id).select("*").single();
  if (error) throw error;
  const { error: cleanupError } = await client.from("planned_activity_occurrences").delete()
    .eq("planned_activity_id", id).eq("user_id", user.id).eq("status", "planned").gte("scheduled_date", futureFrom);
  if (cleanupError) throw cleanupError;
  return data as PlannedActivity;
}

export async function deletePlannedActivity(client: SupabaseClient, id: string) {
  const user = await requireUser(client);
  const { error } = await client.from("planned_activities").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw error;
}

export async function updateOccurrenceStatus(client: SupabaseClient, id: string, status: OccurrenceStatus) {
  const user = await requireUser(client);
  const now = new Date().toISOString();
  const timestamps = status === "completed" ? { completed_at: now, skipped_at: null } : status === "skipped" ? { completed_at: null, skipped_at: now } : { completed_at: null, skipped_at: null };
  const { data, error } = await client.from("planned_activity_occurrences").update({ status, ...timestamps })
    .eq("id", id).eq("user_id", user.id).select("*,planned_activity:planned_activities(*)").single();
  if (error) throw error;
  return data as PlannedActivityOccurrence;
}
