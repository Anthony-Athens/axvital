import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "../api/validation.ts";
import { exactKeys, isObject, isUuid } from "../rules/validation.ts";
export const targetKinds = ["conditions", "symptoms", "catalog_symptoms", "exercises", "habits", "protocols", "nutrition_patterns", "target_rules", "workout_templates"] as const;
export type DiscoveryKind = typeof targetKinds[number];
export type PublicTarget = { id: string; label: string; identity: string; available: boolean };
export const targetKindByField: Record<string, DiscoveryKind> = { user_condition_id: "conditions", user_symptom_id: "symptoms", symptom_id: "catalog_symptoms", exercise_id: "exercises", linked_planned_activity_id: "habits", linked_user_protocol_id: "protocols", nutrition_pattern_id: "nutrition_patterns", rule_id: "target_rules", linked_workout_template_id: "workout_templates" };
export async function targetRows(client: SupabaseClient, kind: DiscoveryKind, search = "", after: string | null = null, limit = 20, selected: string[] | null = null): Promise<PublicTarget[]> {
  const { data, error } = await client.rpc("discover_experiment_targets_v1", { target_kind: kind, search_text: search, after_id: after, page_size: limit, selected_ids: selected }).abortSignal(AbortSignal.timeout(10000));
  if (error || !Array.isArray(data) || data.length > limit + 1) throw new ApiError(503, "TEMPORARILY_UNAVAILABLE");
  const ids = new Set<string>();
  return data.map(row => {
    if (!isUuid(row.id) || typeof row.label !== "string" || typeof row.available !== "boolean" || targetKindByField[row.identity] !== kind || ids.has(row.id) || (selected && !selected.includes(row.id))) throw new ApiError(503, "TEMPORARILY_UNAVAILABLE");
    ids.add(row.id);
    return { id: row.id, label: row.label, identity: row.identity, available: row.available };
  });
}
export async function discoverTargets(client: SupabaseClient, params: URLSearchParams) {
  const kind = params.get("kind") as DiscoveryKind, search = (params.get("search") ?? "").trim();
  const rawLimit = params.get("limit"), limit = rawLimit === null ? 20 : Number(rawLimit);
  if (!targetKinds.includes(kind) || search.length > 100 || !Number.isInteger(limit) || limit < 1 || limit > 50 || (rawLimit !== null && !/^\d{1,2}$/.test(rawLimit))) throw new ApiError(400, "INVALID_REQUEST");
  let after: string | null = null;
  if (params.has("cursor")) {
    try {
      const raw = params.get("cursor")!;
      if (raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
      const cursor: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
      if (!isObject(cursor) || !exactKeys(cursor, ["kind", "search", "id"]) || cursor.kind !== kind || cursor.search !== search || !isUuid(cursor.id)) throw new Error();
      after = cursor.id;
    } catch { throw new ApiError(400, "INVALID_CURSOR"); }
  }
  const rows = await targetRows(client, kind, search, after, limit), hasMore = rows.length > limit, items = rows.slice(0, limit);
  return { kind, items, nextCursor: hasMore ? Buffer.from(JSON.stringify({ kind, search, id: items.at(-1)!.id })).toString("base64url") : null };
}
