import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readObservations, type SourceRequest } from "../measurements/sources/index.ts";
import { evaluateReadiness } from "../measurements/readiness-policies.ts";

/** Use the existing cookie-authenticated server client. Does not persist results
 * or call experiment authoring RPCs. Clock injection is server/test-only.
 */
export async function getBaselineReadiness(client: SupabaseClient, request: SourceRequest, clock: () => Date = () => new Date()) {
  return evaluateReadiness(await readObservations(client, request, clock));
}
