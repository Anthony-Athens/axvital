import {createClient} from "@/lib/supabase/server";
import {resultsApi} from "@/lib/experiments/results-api";
export const runtime="nodejs";
export const maxDuration=60;
export const GET=resultsApi("revisions",createClient);
