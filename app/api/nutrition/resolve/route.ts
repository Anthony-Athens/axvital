import { createClient } from "@/lib/supabase/server";
import { guardWithClient } from "@/lib/api/boundary";
import { ApiError } from "@/lib/api/validation";
import { loadFoodCatalog } from "@/lib/nutrition/food-catalog";
import { resolveWithCatalog } from "@/lib/nutrition/food-service";
import { inferFood } from "@/lib/nutrition/food-ai";

export const runtime = "nodejs";
export const POST = guardWithClient("http/nutrition/resolve", async (request, { client }) => {
  let body;
  try { body = await request.json(); } catch { throw new ApiError(400, "INVALID_REQUEST"); }
  const { label, context } = body;
  if (typeof label !== "string" || !label.trim() || label.length > 160 || typeof context !== "string" || context.length > 2000) throw new ApiError(400, "INVALID_REQUEST");
  const food = await resolveWithCatalog(label, context, await loadFoodCatalog(client), request.signal, inferFood);
  return Response.json({ food });
}, createClient);
