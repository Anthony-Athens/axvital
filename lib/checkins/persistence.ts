import type { SupabaseClient } from "@supabase/supabase-js";
import { selectedCalendarDate } from "../timeline/dates.ts";

export const answerFields = { energy: "energy_score", mood: "mood_score", sleep: "sleep_quality", exercise: "exercise_level", nutrition: "nutrition_quality", stress: "stress_level", alcohol: "alcohol" } as const;
type Value = string | number | boolean | null;
export type CheckinRecord = { id: string; user_id: string; checkin_date: string } & Record<string, Value>;
export type CheckinDraft = { answers: Record<string, string>; weight: string };
export function draftFromRecord(row: CheckinRecord | null): CheckinDraft {
  const answers: Record<string, string> = {};
  for (const [key, field] of Object.entries(answerFields)) {
    const value = row?.[field];
    if (value !== null && value !== undefined) answers[key] = key === "alcohol" ? (value ? "Yes" : "No") : String(value);
  }
  return { answers, weight: row?.weight == null ? "" : String(row.weight) };
}
export function checkinPatch(draft: CheckinDraft, baseline: CheckinRecord | null) {
  const original = draftFromRecord(baseline), patch: Record<string, Value> = {};
  const allowed: Record<string, string[]> = { sleep: ["Poor", "Average", "Good", "Great"], exercise: ["None", "No Workout", "Light", "Moderate", "Intense"], nutrition: ["Poor", "Average", "Good", "Excellent"], stress: ["Low", "Medium", "High"], alcohol: ["No", "Yes"] };
  for (const [key, field] of Object.entries(answerFields)) {
    const value = draft.answers[key] ?? "";
    if (value === (original.answers[key] ?? "")) continue;
    if (value && (key === "energy" || key === "mood" ? !/^(10|[1-9])$/.test(value) : !allowed[key].includes(value))) throw new Error("INVALID_ANSWER");
    patch[field] = !value ? null : key === "alcohol" ? value === "Yes" : key === "energy" || key === "mood" ? Number(value) : value;
  }
  if (draft.weight !== original.weight) {
    const weight = draft.weight.trim() ? Number(draft.weight) : null;
    if (weight !== null && (!Number.isFinite(weight) || weight <= 0 || weight > 2000)) throw new Error("INVALID_WEIGHT");
    patch.weight = weight;
  }
  return patch;
}
async function owner(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("AUTH_REQUIRED");
  return data.user.id;
}
export async function loadCheckin(client: SupabaseClient, date: string) {
  if (!selectedCalendarDate(date)) throw new Error("INVALID_DATE");
  const userId = await owner(client);
  const { data, error } = await client.from("daily_checkins").select("*").eq("user_id", userId).eq("checkin_date", date).maybeSingle();
  if (error) throw new Error("LOAD_FAILED");
  return { userId, row: data as CheckinRecord | null };
}
/** Patch changed fields only and detect competing edits to those fields. */
export async function saveCheckin(client: SupabaseClient, date: string, userId: string, baseline: CheckinRecord | null, draft: CheckinDraft) {
  if (!selectedCalendarDate(date)) throw new Error("INVALID_DATE");
  if (await owner(client) !== userId) throw new Error("AUTH_REQUIRED");
  if (baseline && (baseline.user_id !== userId || baseline.checkin_date !== date)) throw new Error("WRONG_RECORD");
  const patch = checkinPatch(draft, baseline);
  if (!Object.keys(patch).length) {
    if (!baseline) throw new Error("EMPTY_CHECKIN");
    const current = await loadCheckin(client, date);
    if (!current.row) throw new Error("SAVE_CONFLICT");
    return current.row;
  }
  let query;
  if (baseline) {
    query = client.from("daily_checkins").update(patch).eq("id", baseline.id).eq("user_id", userId).eq("checkin_date", date);
    for (const field of Object.keys(patch)) query = baseline[field] == null ? query.is(field, null) : query.eq(field, baseline[field]);
  } else {
    const empty = Object.fromEntries(Object.values(answerFields).map(field => [field, null]));
    query = client.from("daily_checkins").insert({ ...empty, weight: null, ...patch, user_id: userId, checkin_date: date });
  }
  const { data, error } = await query.select("*").single();
  if (error || !data) throw new Error("SAVE_CONFLICT");
  return data as CheckinRecord;
}
