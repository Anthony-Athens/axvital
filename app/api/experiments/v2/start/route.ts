import { createClient } from "@/lib/supabase/server";
import { experimentApi } from "@/lib/experiments/api";
export const POST = experimentApi("start", createClient);
