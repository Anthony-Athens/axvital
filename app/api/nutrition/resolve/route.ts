import { enrichRecipe } from "@/lib/nutrition/recipes";
import { createClient } from "@/lib/supabase/server";
import { guardWithClient } from "@/lib/api/boundary";
import { ApiError } from "@/lib/api/validation";
import { loadFoodCatalog } from "@/lib/nutrition/food-catalog";
import { loadNutritionServings, resolveWithCatalog } from "@/lib/nutrition/food-service";
import { nutritionDraft, resolveNutritionFood, foodIdentity, parseIntake } from "@/lib/nutrition/voice-nutrition";
import { inferFood } from "@/lib/nutrition/food-ai";

export const runtime = "nodejs";
export const POST = guardWithClient("http/nutrition/resolve", async (request, { client }) => {
  let body;
  try { body = await request.json(); } catch { throw new ApiError(400, "INVALID_REQUEST"); }
  const { label, context, amount } = body;
  if (typeof label !== "string" || !label.trim() || label.length > 160 || typeof context !== "string" || context.length > 2000) throw new ApiError(400, "INVALID_REQUEST");
  if (amount !== undefined && amount !== null && (typeof amount !== "string" || amount.length > 160)) throw new ApiError(400, "INVALID_REQUEST");
  const [catalog, servings] = await Promise.all([loadFoodCatalog(client), loadNutritionServings(client)]);
  const identity = foodIdentity(label);
  const intake = parseIntake(amount, label, context);
  const deterministic = resolveNutritionFood(identity, context, catalog, servings);
  const food = enrichRecipe(deterministic.food_id ? deterministic : await resolveWithCatalog(identity, context, catalog, request.signal, inferFood), servings);
  return Response.json({ food, nutrition: nutritionDraft(food, servings, amount, context, intake) });
}, createClient);
