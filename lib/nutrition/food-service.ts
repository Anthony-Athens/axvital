import { enrichRecipe } from "./recipes.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFoodCatalog } from "./food-catalog.ts";
import { matchFoodLabel, provisionalFood, resolveFood, type FoodCatalog, type FoodResolution } from "./food-resolution.ts";
import type { VoiceCandidate } from "../voice/schema.ts";
import type { Serving } from "./nutrition.ts";
import { nutritionDraft, resolveNutritionFood, foodIdentity, parseIntake } from "./voice-nutrition.ts";

export async function loadNutritionServings(client: SupabaseClient): Promise<Serving[]> {
  const { data, error } = await client.from("food_servings").select("*").limit(1001);
  if (error || !data || data.length >= 1000) throw new Error("FOOD_CATALOG_UNAVAILABLE");
  return (data as Serving[]).filter(serving => !serving.source_retired);
}

export type FoodInference = (base: FoodResolution, context: string, catalog: FoodCatalog, signal: AbortSignal) => Promise<FoodResolution>;
export async function resolveWithCatalog(label: string, context: string, catalog: FoodCatalog, signal: AbortSignal, infer?: FoodInference) {
  const resolved = resolveFood(label, context, catalog);
  if (resolved.food_id || matchFoodLabel(label, catalog).ambiguous || !infer || signal.aborted) return resolved;
  try { return await infer(resolved, context, catalog, signal); } catch { return resolved; }
}
export async function enrichFoodCandidates(client: SupabaseClient, candidates: VoiceCandidate[], signal: AbortSignal, infer?: FoodInference) {
  if (!candidates.some(candidate => ["food", "fluid"].includes(candidate.event.event_type))) return candidates;
  let catalog: FoodCatalog, servings: Serving[];
  try { [catalog, servings] = await Promise.all([loadFoodCatalog(client), loadNutritionServings(client)]); }
  catch { return candidates.map(candidate => {
    if (!["food", "fluid"].includes(candidate.event.event_type)) return candidate;
    const food = provisionalFood(candidate.event.title ?? "Food");
    return { ...candidate, event: { ...candidate.event, food }, nutrition: nutritionDraft(food, [], candidate.event.amount, candidate.source_fragment, candidate.intake) };
  }); }
  let inferenceCount = 0;
  return Promise.all(candidates.map(async candidate => {
    if (!["food", "fluid"].includes(candidate.event.event_type)) return candidate;
    const label = foodIdentity(candidate.event.title ?? "Food");
    const intake = candidate.intake ?? parseIntake(candidate.event.amount, candidate.event.title ?? "Food", candidate.source_fragment);
    const deterministic = resolveNutritionFood(label, candidate.source_fragment, catalog, servings);
    // A bounded number run concurrently under their provider deadlines.
    const eligible = !deterministic.food_id && inferenceCount++ < 3;
    const food = enrichRecipe(deterministic.food_id ? deterministic : await resolveWithCatalog(label, candidate.source_fragment, catalog, signal, eligible ? infer : undefined), servings);
    return { ...candidate, event: { ...candidate.event, food }, nutrition: nutritionDraft(food, servings, candidate.event.amount, candidate.source_fragment, intake) };
  }));
}
