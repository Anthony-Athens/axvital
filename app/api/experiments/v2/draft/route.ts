import { createClient } from "@/lib/supabase/server";
import { experimentApi } from "@/lib/experiments/api";
import { scheduleAnalytics } from "@/lib/telemetry/server";
export const GET = experimentApi("draft", createClient);
const save = experimentApi("draft", createClient);
export async function POST(request: Request) {
  const response = await save(request);
  if (response.status === 201) scheduleAnalytics(request, "Experiment Created");
  return response;
}
