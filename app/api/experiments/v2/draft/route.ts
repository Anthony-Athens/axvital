import { createClient } from "@/lib/supabase/server";
import { experimentApi } from "@/lib/experiments/api";
export const GET = experimentApi("draft", createClient);
export const POST = experimentApi("draft", createClient);
