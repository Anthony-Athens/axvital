import {createClient} from "@/lib/supabase/server";
import {nutritionGoalsApi} from "@/lib/nutrition/goals-api";
export const GET=nutritionGoalsApi(createClient);
export const POST=nutritionGoalsApi(createClient);
