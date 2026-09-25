import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFoodCatalog } from "./food-catalog.ts";
import { matchFoodLabel, provisionalFood, resolveFood, type FoodCatalog, type FoodResolution } from "./food-resolution.ts";
import type { VoiceCandidate } from "../voice/schema.ts";

export type FoodInference = (base: FoodResolution, context: string, catalog: FoodCatalog, signal: AbortSignal) => Promise<FoodResolution>;
export async function resolveWithCatalog(label: string, context: string, catalog: FoodCatalog, signal: AbortSignal, infer?: FoodInference) {
  const resolved = resolveFood(label, context, catalog);
  if (resolved.food_id || matchFoodLabel(label, catalog).ambiguous || !infer || signal.aborted) return resolved;
  try { return await infer(resolved, context, catalog, signal); } catch { return resolved; }
}
export async function enrichFoodCandidates(client: SupabaseClient, candidates: VoiceCandidate[], signal: AbortSignal, infer?: FoodInference) {
  if (!candidates.some(candidate => ["food", "fluid"].includes(candidate.event.event_type))) return candidates;
  let catalog: FoodCatalog;
  try { catalog = await loadFoodCatalog(client); }
  catch { return candidates.map(candidate => ["food", "fluid"].includes(candidate.event.event_type) ? { ...candidate, event: { ...candidate.event, food: provisionalFood(candidate.event.title ?? "Food") } } : candidate); }
  let inferenceCount = 0;
  return Promise.all(candidates.map(async candidate => {
    if (!["food", "fluid"].includes(candidate.event.event_type)) return candidate;
    const label = candidate.event.title ?? "Food";
    const deterministic = resolveFood(label, candidate.source_fragment, catalog);
    // A bounded number run concurrently under their provider deadlines.
    const eligible = !deterministic.food_id && inferenceCount++ < 3;
    const food = await resolveWithCatalog(label, candidate.source_fragment, catalog, signal, eligible ? infer : undefined);
    return { ...candidate, event: { ...candidate.event, food } };
  }));
}
