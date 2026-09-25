import { createClient } from "@/lib/supabase/server";
import { voiceParseApi } from "@/lib/voice/api";
import { processVoice } from "@/lib/voice/provider";
import { enrichFoodCandidates } from "@/lib/nutrition/food-service";
import { inferFood } from "@/lib/nutrition/food-ai";

export const runtime = "nodejs";
export const maxDuration = 90;
export const POST = voiceParseApi(createClient, processVoice, (client, candidates, signal) => enrichFoodCandidates(client, candidates, signal, inferFood));
