import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateHabitProgress, reopenProgressFields } from "./progress";
import { ensureOccurrencesForRange, getOccurrencesForRange } from "../planner/planner";
import type { PlannedActivity, PlannedActivityOccurrence } from "../planner/types";

async function userId(client: SupabaseClient) { const { data, error } = await client.auth.getUser(); if (error || !data.user) throw new Error("AUTH_REQUIRED"); return data.user.id; }

export async function getHabits(client: SupabaseClient, filter: "active" | "paused" | "all" = "active") {
  const user = await userId(client); let query = client.from("planned_activities").select("*").eq("user_id", user).eq("activity_type", "habit");
  if (filter !== "all") query = query.eq("is_active", filter === "active");
  const { data, error } = await query.order("sort_order", { nullsFirst: false }).order("scheduled_time", { nullsFirst: false }).order("title"); if (error) throw error; return (data ?? []) as PlannedActivity[];
}
export async function getHabitsForDate(client: SupabaseClient, date: string) { return (await getOccurrencesForRange(client, date, date)).filter((row) => row.planned_activity?.activity_type === "habit"); }
export async function getHabitOccurrencesForRange(client: SupabaseClient, start: string, end: string, habitId?: string) { const user = await userId(client); await ensureOccurrencesForRange(client, start, end); let query = client.from("planned_activity_occurrences").select("*,planned_activity:planned_activities(*)").eq("user_id", user).gte("scheduled_date", start).lte("scheduled_date", end).order("scheduled_date"); if (habitId) query = query.eq("planned_activity_id", habitId); const { data, error } = await query; if (error) throw error; return ((data ?? []) as PlannedActivityOccurrence[]).filter((row) => row.planned_activity?.activity_type === "habit"); }

export async function updateHabitProgress(client: SupabaseClient, occurrenceId: string, actualValue: number | null, note: string | null, explicitlyComplete = false) {
  const user = await userId(client); const { data: occurrence, error: readError } = await client.from("planned_activity_occurrences").select("*,planned_activity:planned_activities(*)").eq("id", occurrenceId).eq("user_id", user).single(); if (readError) throw readError;
  const typed = occurrence as PlannedActivityOccurrence; if (!typed.planned_activity || typed.planned_activity.activity_type !== "habit") throw new Error("HABIT_NOT_FOUND");
  const progress = calculateHabitProgress(typed.planned_activity, actualValue, explicitlyComplete); const now = new Date().toISOString();
  const update = { actual_value: actualValue, completion_note: note, completion_percentage: progress.completionPercentage, status: progress.status, completed_at: progress.status === "completed" ? now : null, skipped_at: null, first_completed_at: progress.status === "completed" ? (typed.first_completed_at ?? now) : typed.first_completed_at, last_updated_at: now };
  const { data, error } = await client.from("planned_activity_occurrences").update(update).eq("id", occurrenceId).eq("user_id", user).select("*,planned_activity:planned_activities(*)").single(); if (error) throw error; return data as PlannedActivityOccurrence;
}

export const completeHabitOccurrence = (client: SupabaseClient, id: string, value: number | null = null, note: string | null = null) => updateHabitProgress(client, id, value, note, true);
export async function skipHabitOccurrence(client: SupabaseClient, id: string) { const user = await userId(client); const now = new Date().toISOString(); const { data, error } = await client.from("planned_activity_occurrences").update({ status: "skipped", completed_at: null, skipped_at: now, last_updated_at: now }).eq("id", id).eq("user_id", user).select("*,planned_activity:planned_activities(*)").single(); if (error) throw error; return data as PlannedActivityOccurrence; }
export async function reopenHabitOccurrence(client: SupabaseClient, id: string) { const user = await userId(client); const { data: current, error: readError } = await client.from("planned_activity_occurrences").select("first_completed_at").eq("id", id).eq("user_id", user).single(); if (readError) throw readError; const { data, error } = await client.from("planned_activity_occurrences").update(reopenProgressFields(current.first_completed_at, new Date().toISOString())).eq("id", id).eq("user_id", user).select("*,planned_activity:planned_activities(*)").single(); if (error) throw error; return data as PlannedActivityOccurrence; }

export async function setHabitActive(client: SupabaseClient, id: string, active: boolean, date: string) { const user = await userId(client); const now = new Date().toISOString(); const values = active ? { is_active: true, reactivated_at: now, recurrence_active_from: date } : { is_active: false, paused_at: now }; const { data, error } = await client.from("planned_activities").update(values).eq("id", id).eq("user_id", user).eq("activity_type", "habit").select("*").single(); if (error) throw error; if (!active) { const { error: cleanup } = await client.from("planned_activity_occurrences").delete().eq("planned_activity_id", id).eq("user_id", user).eq("status", "planned").gte("scheduled_date", date); if (cleanup) throw cleanup; } return data as PlannedActivity; }
