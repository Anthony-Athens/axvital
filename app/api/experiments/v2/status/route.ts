import { createClient } from "@/lib/supabase/server";
import { experimentApi } from "@/lib/experiments/api";
export const GET=experimentApi("status",createClient);
