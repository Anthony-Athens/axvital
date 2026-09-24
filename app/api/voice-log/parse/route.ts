import { createClient } from "@/lib/supabase/server";
import { voiceParseApi } from "@/lib/voice/api";
import { processVoice } from "@/lib/voice/provider";

export const runtime = "nodejs";
export const maxDuration = 90;
export const POST = voiceParseApi(createClient, processVoice);
