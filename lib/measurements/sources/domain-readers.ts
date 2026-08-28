import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NutritionDay, NutritionKey, SourceResult } from "../observations.ts";
import type { OutcomeInput } from "../validation.ts";
import { dateInZone, shiftDate } from "../time-window.ts";

export const nutritionFields = { nutrition_calories: "calories", nutrition_protein_grams: "protein_grams", nutrition_carbohydrate_grams: "carbohydrate_grams", nutrition_fat_grams: "fat_grams", nutrition_fiber_grams: "fiber_grams", nutrition_caffeine_mg: "caffeine_mg", nutrition_alcohol_grams: "alcohol_grams" } as const;
const CAP = 1000;
type Row = Record<string, unknown>;
function truncated(r: SourceResult) { r.queryCompleteness = "truncated";if (!r.warnings.includes("SOURCE_TRUNCATED")) r.warnings.push("SOURCE_TRUNCATED"); }
function bounded(r: SourceResult, response: { data: unknown; error: unknown; count?: number | null }): Row[] {
  if (response.error || !Array.isArray(response.data)) throw new Error("SOURCE_READ_FAILED");
  if (response.data.length > CAP) throw new Error("INVALID_SOURCE_SIZE");
  if (response.data.length >= CAP || response.count == null || response.count !== response.data.length) truncated(r);
  return response.data as Row[];
}
function exclude(r: SourceResult, reason: string) { r.counts.excluded++;r.exclusions[reason] = (r.exclusions[reason] ?? 0) + 1; }
function instant(value: unknown) { return typeof value === "string" ? Date.parse(value) : NaN; }
function inWindow(value: unknown, r: SourceResult) { const t = instant(value);return Number.isFinite(t) && t >= Date.parse(r.window.startAt) && t < Date.parse(r.window.effectiveEndAtExclusive); }
function point(r: SourceResult, row: Row, value: number, category?: string) {
  const at = new Date(instant(row.started_at)).toISOString();
  r.observations.push({ sourceId: String(row.id), logicalDate: dateInZone(new Date(at), r.window.timeZone), precision: "timestamp", occurredAt: at, eligibility: "eligible", value: category === undefined ? { kind: "numeric", value } : { kind: "ordinal", value, category } });
}
function known(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
async function target(client: SupabaseClient, table: "user_conditions" | "user_symptoms" | "symptoms", id: string, owner: string, signal: AbortSignal) {
  let q = client.from(table).select(table === "symptoms" ? "id" : "id,user_id").eq("id", id);
  if (table !== "symptoms") q = q.eq("user_id", owner);
  const response = await q.limit(1).abortSignal(signal).maybeSingle();
  if (response.error) throw new Error("SOURCE_READ_FAILED");
  const row = response.data as unknown as Row | null;
  if (!row || row.id !== id || (table !== "symptoms" && row.user_id !== owner)) throw new Error("TARGET_NOT_FOUND");
}

export async function readNutrition(client: SupabaseClient, owner: string, r: SourceResult, signal: AbortSignal) {
  const response = await client.rpc("read_nutrition_observations_v1", { start_date: r.window.startDate, end_date_exclusive: r.window.endDateExclusive, analysis_timezone: r.window.timeZone, evaluation_cutoff: r.window.evaluatedAt }).abortSignal(signal);
  const data = response.data as { version: number; entries: Row[]; items: Row[]; coverage: Row[]; truncated: boolean } | null;
  if (response.error || !data || data.version !== 1 || !Array.isArray(data.entries) || !Array.isArray(data.items) || !Array.isArray(data.coverage) || typeof data.truncated !== "boolean") throw new Error("SOURCE_READ_FAILED");
  if (data.truncated || data.entries.length >= CAP || data.items.length >= CAP) truncated(r);
  if (data.entries.length > CAP || data.items.length > CAP || data.coverage.length > 366) throw new Error("INVALID_SOURCE_SIZE");
  const days = new Map<string, NutritionDay>();
  for (let date = r.window.startDate; date < r.window.endDateExclusive; date = shiftDate(date, 1)) days.set(date, { logicalDate: date, entryCount: 0, knownItemCount: 0, unknownItemCount: 0, hasItems: false, fieldComplete: false, coverageStatus: "unknown", subtotal: null });
  const entries = new Map<string, NutritionDay>();
  for (const e of data.entries) {
    if (e.user_id !== owner || !inWindow(e.consumed_at, r)) throw new Error("INVALID_PARENT_CHAIN");
    const day = days.get(dateInZone(new Date(String(e.consumed_at)), r.window.timeZone));
    if (!day || entries.has(String(e.id))) throw new Error("INVALID_SOURCE_DATA");
    day.entryCount++;entries.set(String(e.id), day);
  }
  const ids = new Set<string>(), itemsPerEntry = new Map<string, number>();
  const field = nutritionFields[r.registryKey as NutritionKey];
  if (!field) throw new Error("UNSUPPORTED_SOURCE");
  for (const item of data.items) {
    const entryId = String(item.nutrition_entry_id), day = entries.get(entryId);
    if (!day || ids.has(String(item.id))) throw new Error("INVALID_PARENT_CHAIN");
    ids.add(String(item.id));itemsPerEntry.set(entryId, (itemsPerEntry.get(entryId) ?? 0) + 1);day.hasItems = true;
    const value = item[field];
    if (value == null) { day.unknownItemCount++;r.counts.nullValues++; }
    else if (!known(value) || value < 0) { day.unknownItemCount++;exclude(r, "INVALID_NUTRIENT"); }
    else { day.knownItemCount++;day.subtotal = (day.subtotal ?? 0) + value;if (!Number.isFinite(day.subtotal)) throw new Error("INVALID_NUTRIENT_TOTAL"); }
  }
  const emptyEntries = new Set<NutritionDay>();
  for (const [id, day] of entries) if (!itemsPerEntry.has(id)) emptyEntries.add(day);
  const coverageDates = new Set<string>();
  for (const c of data.coverage) {
    const day = days.get(String(c.local_date));
    if (!day || c.time_zone !== r.window.timeZone || coverageDates.has(String(c.local_date)) || !["complete", "partial", "unknown"].includes(String(c.coverage_status))) throw new Error("INVALID_COVERAGE");
    coverageDates.add(String(c.local_date));day.coverageStatus = c.coverage_status as NutritionDay["coverageStatus"];
  }
  for (const day of days.values()) {
    day.fieldComplete = day.hasItems && day.unknownItemCount === 0 && !emptyEntries.has(day);
    if (day.subtotal !== null) r.observations.push({ sourceId: day.logicalDate, logicalDate: day.logicalDate, precision: "date", eligibility: "eligible", value: { kind: "numeric", value: day.subtotal } });
  }
  r.nutritionDays = [...days.values()];r.counts.sourceRows = data.items.length;
  if (r.queryCompleteness === "complete") r.counts.absentDays = [...days.values()].filter(d => !d.entryCount).length;
  r.warnings.push("LOGGED_SUBTOTAL_NOT_TOTAL_INTAKE", "LOGGING_COVERAGE_NOT_DIETARY_ADHERENCE");
}

export async function readEpisodes(client: SupabaseClient, owner: string, outcome: OutcomeInput, r: SourceResult, signal: AbortSignal) {
  await target(client, "user_conditions", outcome.user_condition_id!, owner, signal);
  const rows = bounded(r, await client.from("condition_episodes").select("id,user_id,user_condition_id,started_at,ended_at,status,archived_at", { count: "exact" })
    .eq("user_id", owner).eq("user_condition_id", outcome.user_condition_id!).is("archived_at", null).gte("started_at", r.window.startAt).lt("started_at", r.window.effectiveEndAtExclusive).order("started_at").order("id").limit(CAP).abortSignal(signal));
  const episodes = new Map<string, Row>();r.counts.sourceRows = rows.length;
  for (const row of rows) {
    if (row.user_id !== owner || row.user_condition_id !== outcome.user_condition_id || row.archived_at !== null || row.status === "archived" || !inWindow(row.started_at, r)) { exclude(r, "INVALID_EPISODE");continue; }
    if (episodes.has(String(row.id))) throw new Error("DUPLICATE_SOURCE_RECORD");episodes.set(String(row.id), row);
  }
  if (r.registryKey === "condition_episode_frequency") {
    for (const row of episodes.values()) point(r, row, 1);
    r.warnings.push("NO_CONDITION_SURVEILLANCE_DENOMINATOR");return;
  }
  const updates = new Map<string, Row[]>(), ids = [...episodes.keys()], updateIds = new Set<string>();let read = 0;
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const response = await client.from("episode_updates").select("id,user_id,condition_episode_id,recorded_at,created_at,overall_severity,functional_impact,status", { count: "exact" })
      .eq("user_id", owner).in("condition_episode_id", batch).lt("recorded_at", r.window.evaluatedAt).order("recorded_at").order("id").limit(CAP - read).abortSignal(signal);
    const page = bounded(r, response);read += page.length;
    for (const update of page) {
      if (updateIds.has(String(update.id))) throw new Error("DUPLICATE_SOURCE_RECORD");updateIds.add(String(update.id));
      const ep = episodes.get(String(update.condition_episode_id));
      if (!ep || !batch.includes(String(update.condition_episode_id)) || update.user_id !== owner || !Number.isFinite(instant(update.recorded_at)) || instant(update.recorded_at) < instant(ep.started_at) || instant(update.recorded_at) >= Date.parse(r.window.evaluatedAt)) { exclude(r, "INVALID_EPISODE_UPDATE");continue; }
      const list = updates.get(String(ep.id)) ?? [];list.push(update);updates.set(String(ep.id), list);
    }
    if (read >= CAP) { truncated(r);break; }
  }
  const impact = ["none", "mild", "moderate", "significant", "severe"];
  for (const ep of episodes.values()) {
    const history = (updates.get(String(ep.id)) ?? []).sort((a, b) => instant(a.recorded_at) - instant(b.recorded_at) || (instant(a.created_at) - instant(b.created_at) || 0) || String(a.id).localeCompare(String(b.id)));
    const latest = history.at(-1);
    if (r.registryKey === "condition_episode_duration_hours") {
      const status = history.filter(h => h.status != null).at(-1);
      const end = instant(ep.ended_at);
      if (ep.status !== "resolved" || status?.status !== "resolved" || !Number.isFinite(end) || end < instant(ep.started_at) || end >= Date.parse(r.window.evaluatedAt) || end !== instant(status.recorded_at)) { r.counts.censored++;continue; }
      point(r, ep, (end - instant(ep.started_at)) / 3600000);
    } else if (r.registryKey === "condition_episode_peak_severity") {
      const values = history.flatMap(h => {
        if (h.overall_severity == null) return [];
        if (known(h.overall_severity) && Number.isInteger(h.overall_severity) && h.overall_severity >= 1 && h.overall_severity <= 10) return [h.overall_severity];
        exclude(r, "INVALID_EPISODE_SEVERITY");return [];
      });
      if (values.length) point(r, ep, Math.max(...values));else if (!history.length || history.some(h => h.overall_severity == null)) r.counts.nullValues++;
    } else {
      const rank = impact.indexOf(String(latest?.functional_impact));
      if (rank >= 0) point(r, ep, rank, impact[rank]);else if (latest?.functional_impact == null) r.counts.nullValues++;else exclude(r, "INVALID_EPISODE_IMPACT");
    }
  }
  if (r.counts.censored) r.warnings.push("OPEN_REOPENED_OR_INCONSISTENT_EPISODES_CENSORED");
  r.temporalLimitations.push("EPISODE_UPDATES_MUTABLE_AND_BACKDATABLE", "MULTI_QUERY_CURRENT_RECORD_READ");
}

export async function readSymptoms(client: SupabaseClient, owner: string, outcome: OutcomeInput, r: SourceResult, signal: AbortSignal) {
  if (outcome.user_symptom_id) { await target(client, "user_symptoms", outcome.user_symptom_id, owner, signal);r.warnings.push("UNLINKED_DURABLE_HISTORY_NOT_MATCHED"); }
  else await target(client, "symptoms", outcome.symptom_id!, owner, signal);
  if (outcome.user_condition_id) await target(client, "user_conditions", outcome.user_condition_id, owner, signal);
  let query = client.from("user_symptom_events").select("id,user_id,symptom_id,user_symptom_id,started_at,ended_at,resolved,severity,occurrence_count,deleted_at", { count: "exact" })
    .eq("user_id", owner).is("deleted_at", null).gte("started_at", r.window.startAt).lt("started_at", r.window.effectiveEndAtExclusive);
  query = outcome.user_symptom_id ? query.eq("user_symptom_id", outcome.user_symptom_id) : query.eq("symptom_id", outcome.symptom_id!);
  const rows = bounded(r, await query.order("started_at").order("id").limit(CAP).abortSignal(signal));r.counts.sourceRows = rows.length;
  const events = new Map<string, Row>();
  for (const row of rows) {
    if (row.user_id !== owner || row.deleted_at !== null || !inWindow(row.started_at, r) || (outcome.user_symptom_id ? row.user_symptom_id !== outcome.user_symptom_id : row.symptom_id !== outcome.symptom_id)) { exclude(r, "INVALID_SYMPTOM_IDENTITY");continue; }
    if (events.has(String(row.id))) throw new Error("DUPLICATE_SOURCE_RECORD");events.set(String(row.id), row);
  }
  const linked = new Set<string>();
  if (outcome.user_condition_id) {
    const ids = [...events.keys()];let read = 0;
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100);
      const links = bounded(r, await client.from("symptom_event_conditions").select("symptom_event_id,user_condition_id", { count: "exact" }).eq("user_condition_id", outcome.user_condition_id).in("symptom_event_id", batch).order("id").limit(CAP - read).abortSignal(signal));
      read += links.length;
      for (const link of links) if (link.user_condition_id === outcome.user_condition_id && batch.includes(String(link.symptom_event_id))) linked.add(String(link.symptom_event_id));else exclude(r, "INVALID_CONDITION_LINK");
      if (read >= CAP) { truncated(r);break; }
    }
    r.temporalLimitations.push("MULTI_QUERY_CURRENT_RECORD_READ");
  }
  for (const row of events.values()) {
    if (outcome.user_condition_id && !linked.has(String(row.id))) { exclude(r, "OUTSIDE_CONDITION_SCOPE");continue; }
    if (r.registryKey === "symptom_event_frequency") point(r, row, 1);
    else if (r.registryKey === "symptom_duration_minutes") {
      const end = instant(row.ended_at);
      if (!Number.isFinite(end) || end < instant(row.started_at) || end >= Date.parse(r.window.evaluatedAt) || row.resolved === false) { r.counts.censored++;continue; }
      point(r, row, (end - instant(row.started_at)) / 60000);
    } else {
      const value = r.registryKey === "symptom_severity" ? row.severity : row.occurrence_count;
      if (value == null) r.counts.nullValues++;
      else if (!known(value) || !Number.isInteger(value) || value < 1 || (r.registryKey === "symptom_severity" && value > 10)) exclude(r, "INVALID_SYMPTOM_VALUE");
      else point(r, row, value);
    }
  }
  r.warnings.push("NO_SYMPTOM_SURVEILLANCE_DENOMINATOR");
  if (r.counts.censored) r.warnings.push("UNRESOLVED_OR_INVALID_SYMPTOM_DURATION");
}
