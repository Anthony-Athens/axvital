import { recipePreview } from "./recipes.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reviewedInputs, type VoiceCandidate } from "../voice/schema.ts";
import { foodPersistence, provisionalFood } from "./food-resolution.ts";
import { nutritionPreview } from "./voice-nutrition.ts";

/** Browser-local reviewed time, same conversion used by the manual datetime-local nutrition form. */
export function consumedAt(date: string, time: string) {
  const instant = new Date(`${date}T${time}`);
  if (!Number.isFinite(instant.getTime())) throw Error("INVALID_EVENT");
  const [year, month, day] = date.split("-").map(Number), [hour, minute] = time.split(":").map(Number);
  if (instant.getFullYear() !== year || instant.getMonth() + 1 !== month || instant.getDate() !== day || instant.getHours() !== hour || instant.getMinutes() !== minute) throw Error("INVALID_EVENT");
  return instant.toISOString();
}
export function voiceNutritionRows(candidates: VoiceCandidate[], userId: string) {
  const events = reviewedInputs(candidates.map(candidate => candidate.event), userId);
  return events.map((event, index) => {
    if (!["food", "fluid"].includes(event.event_type)) return { kind: "health", event };
    const draft = candidates[index].nutrition, food = event.food ?? provisionalFood(event.title!);
    const preview = nutritionPreview(food, draft);
    const recipe = preview ? null : recipePreview(food, draft);
    if (!preview && !recipe && !draft?.accept_incomplete) throw Error("NUTRITION_REVIEW_REQUIRED");
    if (draft?.meal_type && !["breakfast", "lunch", "dinner", "snack", "other"].includes(draft.meal_type)) throw Error("INVALID_EVENT");
    return { kind: "nutrition", food: foodPersistence(food), nutrition: {
      status: preview || recipe ? "recorded" : "incomplete",
      ...(recipe ? { recipe: recipe.items.map(({ food_id, serving_id, multiplier }) => ({ food_id, serving_id, multiplier })), recipe_confirmed: true } : {}), serving_id: preview?.serving.id ?? null, multiplier: preview?.multiplier ?? null,
      reference_confirmed: draft?.reference_confirmed ?? false, accept_incomplete: draft?.accept_incomplete ?? false,
      consumed_at: consumedAt(event.event_date, event.event_time), meal_type: draft?.meal_type ?? null,
      stated_amount: draft?.quantity != null ? `${draft.quantity} ${draft.unit ?? ""}`.trim() : event.amount ?? null,
      notes: event.notes ?? null, tags: event.tags ?? [], event_type: event.event_type,
    } };
  });
}
/** Shared nutrition transaction boundary; the RPC delegates snapshots to manual log_food_atomic
 * and non-food events to canonical health ingestion. Request ID is retained across uncertain retries. */
export async function logVoiceNutrition(client: SupabaseClient, candidates: VoiceCandidate[], userId: string, requestId: string) {
  const rows = voiceNutritionRows(candidates, userId);
  const { data, error: authError } = await client.auth.getUser();
  if (authError || data.user?.id !== userId) throw Error("AUTH_REQUIRED");
  try {
    const { error } = await client.rpc("ingest_voice_nutrition", { request_id: requestId, rows });
    if (error?.message.includes("VOICE_RETRY_CHANGED")) throw Error("VOICE_RETRY_CHANGED");
    if (error) throw Error("PERSISTENCE_FAILED");
  } catch (error) {
    if (error instanceof Error && error.message === "VOICE_RETRY_CHANGED") throw error;
    throw Error("PERSISTENCE_FAILED");
  }
}

/** Manual composite logging uses the same reviewed payload and snapshot transaction. */
export async function logManualRecipe(client: SupabaseClient, candidate: VoiceCandidate, userId: string, requestId: string) {
  const rows = voiceNutritionRows([candidate], userId);
  const { error } = await client.rpc("ingest_manual_nutrition", { request_id: requestId, rows });
  if (error) throw Error(error.message.includes("VOICE_RETRY_CHANGED") ? "Saved content changed. Reload before logging another meal." : "Unable to save this meal. Retry without changing the reviewed recipe.");
}
