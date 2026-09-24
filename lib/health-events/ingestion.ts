import type { SupabaseClient } from "@supabase/supabase-js";
import type { HealthEventRow, HealthEventInputMethod } from "../types.ts";
import { isCalendarDate } from "../timeline/dates.ts";

export type HealthEventInput = Omit<HealthEventRow, "id" | "created_at" | "input_method"> & {
  input_method?: HealthEventInputMethod;
};
export class HealthEventIngestionError extends Error {
  readonly code: "INVALID_EVENT" | "AUTH_REQUIRED" | "PERSISTENCE_FAILED";
  constructor(code: HealthEventIngestionError["code"]) {
    super(code);
    this.name = "HealthEventIngestionError";
    this.code = code;
  }
}
const textFields = ["title", "description", "amount", "dose", "duration", "intensity", "notes", "supplement_name", "dose_unit", "exercise_type", "distance_unit"] as const;
const numberFields = ["severity", "calories", "protein_g", "carbs_g", "fat_g", "dose_amount", "duration_minutes", "distance"] as const;
const methods = ["manual", "voice", "integration", "import", "system"];
const allowed = new Set(["user_id", "event_date", "event_time", "event_type", "input_method", "tags", ...textFields, ...numberFields]);
function validate(input: HealthEventInput): HealthEventInput {
  const invalid = () => { throw new HealthEventIngestionError("INVALID_EVENT"); };
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid();
  if (Object.keys(input).some(key => !allowed.has(key))) return invalid();
  if (typeof input.user_id !== "string" || !input.user_id || !isCalendarDate(input.event_date)) return invalid();
  if (typeof input.event_time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(input.event_time)) return invalid();
  if (!["food", "fluid", "supplement", "exercise", "symptom", "medication", "note"].includes(input.event_type)) return invalid();
  if (input.input_method !== undefined && !methods.includes(input.input_method)) return invalid();
  for (const field of textFields) if (input[field] != null && typeof input[field] !== "string") return invalid();
  for (const field of numberFields) if (input[field] != null && (typeof input[field] !== "number" || !Number.isFinite(input[field]))) return invalid();
  if (input.tags != null && (!Array.isArray(input.tags) || input.tags.some(tag => typeof tag !== "string"))) return invalid();
  return { ...input, ...(input.tags ? { tags: [...input.tags] } : {}), input_method: input.input_method ?? "manual" };
}

/** Application-domain boundary, using the caller's authenticated client, never admin.
 * RLS is the authority. One PostgREST INSERT makes the entire batch atomic.
 * Transport failure can leave commit status unknown; do not automatically retry.
 */
export async function ingestHealthEvents(client: SupabaseClient, inputs: readonly HealthEventInput[]): Promise<void> {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new HealthEventIngestionError("INVALID_EVENT");
  const rows = inputs.map(validate);
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user || rows.some(row => row.user_id !== data.user!.id)) throw new HealthEventIngestionError("AUTH_REQUIRED");
  } catch { throw new HealthEventIngestionError("AUTH_REQUIRED"); }
  try {
    const { error } = await client.from("health_events").insert(rows);
    if (error) throw new HealthEventIngestionError("PERSISTENCE_FAILED");
  } catch { throw new HealthEventIngestionError("PERSISTENCE_FAILED"); }
}

export async function ingestHealthEvent(client: SupabaseClient, input: HealthEventInput): Promise<void> {
  return ingestHealthEvents(client, [input]);
}
