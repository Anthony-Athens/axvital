import type { SupabaseClient } from "@supabase/supabase-js";
import { isCalendarDate, localDateString } from "../timeline/dates.ts";

export type RecentActivity = {
  id: string;
  sourceType: string;
  sourceId: string;
  category: string;
  title: string;
  detail: string | null;
  occurredAt: string | null;
  logicalDate?: string;
  href: string;
  occurrenceId?: string;
};
export type RecentActivityResult = { items: RecentActivity[]; failedSources: string[] };
const LIMIT = 40;
const validTime = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

/** Date-only observations keep their calendar day and never acquire an invented clock. */
export function activityTimestamp(occurred: unknown, created?: unknown) {
  return validTime(occurred) ? occurred : validTime(created) ? created : null;
}
export function normalizeRecentActivity(items: RecentActivity[], limit = 12): RecentActivity[] {
  const workoutOccurrences = new Set(items.filter(x => x.sourceType === "workout_session" && x.occurrenceId).map(x => x.occurrenceId));
  const unique = new Map<string, RecentActivity>();
  for (const item of items) {
    if (item.sourceType === "planned_activity_occurrence" && workoutOccurrences.has(item.sourceId)) continue;
    // Episode start and resolution are distinct lifecycle events, not duplicate records.
    const key = `${item.sourceType}:${item.sourceId}:${item.sourceType === "condition_episode" ? item.id.split(":").at(-1) : ""}`;
    const previous = unique.get(key);
    if (!previous || (Date.parse(item.occurredAt ?? "") || 0) > (Date.parse(previous.occurredAt ?? "") || 0)) unique.set(key, item);
  }
  const day = (item: RecentActivity) => item.logicalDate ?? (item.occurredAt ? localDateString(new Date(item.occurredAt)) : "");
  return [...unique.values()].sort((a, b) => {
    const dateOrder = day(b).localeCompare(day(a));
    if (dateOrder) return dateOrder;
    // Untimed records follow timed records on the same local day.
    const timeOrder = (b.occurredAt ? Date.parse(b.occurredAt) : 0) - (a.occurredAt ? Date.parse(a.occurredAt) : 0);
    return timeOrder || a.id.localeCompare(b.id);
  }).slice(0, limit);
}

type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const words = (value: string) => value.replaceAll("_", " ");
const join = (...values: (string | null)[]) => values.filter(Boolean).join(" · ") || null;

/** Presentation-only adapter. No derived health interpretation or cross-source text matching. */
export function recentActivityFromRow(source: string, row: Row): RecentActivity[] {
  const id = String(row.id);
  const item: RecentActivity = { id: `${source}:${id}`, sourceId: id, sourceType: source, category: "Health event", title: "Logged health event", detail: null, occurredAt: null, href: "/today#optional-events" };
  if (source === "health_event") {
    const type = text(row.event_type) ?? "other";
    const labels: Record<string, string> = { exercise: "Exercise", fluid: "Fluid", supplement: "Supplement", medication: "Medication", symptom: "Symptom", food: "Food", meal: "Meal", note: "Note", weight: "Weight" };
    item.category = labels[type] ?? "Health event";
    const name = text(row.title) ?? text(row.supplement_name) ?? text(row.exercise_type) ?? text(row.description) ?? text(row.notes) ?? item.category.toLowerCase();
    item.title = `${type === "supplement" || type === "medication" ? "Took" : "Logged"} ${name}`;
    item.detail = join(text(row.amount), number(row.dose_amount) !== null ? `${row.dose_amount} ${text(row.dose_unit) ?? ""}`.trim() : text(row.dose), number(row.duration_minutes) !== null ? `${row.duration_minutes} min` : null, number(row.severity) !== null ? `Severity ${row.severity}` : null);
    if (isCalendarDate(row.event_date)) {
      item.logicalDate = row.event_date;
      item.occurredAt = text(row.event_time) ? activityTimestamp(`${row.event_date}T${row.event_time}`, row.created_at) : null;
      item.href = `/today?date=${row.event_date}#optional-events`;
    } else item.occurredAt = activityTimestamp(null, row.created_at);
  } else if (source === "nutrition_entry") {
    const items = Array.isArray(row.items) ? row.items.map(record) : [];
    item.category = "Nutrition";
    item.title = `Logged ${text(row.meal_type) ?? text(row.title) ?? text(items[0]?.source_name) ?? "food"}`;
    item.detail = text(row.meal_type) ? text(row.title) ?? text(items[0]?.source_name) : null;
    item.occurredAt = activityTimestamp(row.consumed_at, row.created_at);
    item.href = "/health/nutrition";
  } else if (source === "symptom_event") {
    item.category = "Symptom";
    item.title = `Logged ${text(record(row.symptom).name) ?? text(row.custom_symptom_name) ?? "symptom"}`;
    item.detail = number(row.severity) !== null ? `Severity ${row.severity}` : null;
    item.occurredAt = activityTimestamp(row.started_at, row.created_at);
    item.href = "/health/symptoms/history";
  } else if (source === "workout_session") {
    item.category = "Workout";
    const status = text(row.status);
    item.title = `${status === "completed" ? "Completed" : status === "abandoned" ? "Ended" : "Started"} ${text(row.name) ?? "workout"}`;
    item.detail = join(status === "abandoned" ? "Workout abandoned" : status === "in_progress" ? "In progress" : null, number(row.duration_seconds) !== null ? `${Math.round(Number(row.duration_seconds) / 60)} min` : null);
    item.occurredAt = activityTimestamp(status === "completed" || status === "abandoned" ? row.ended_at : row.started_at, activityTimestamp(row.started_at, row.created_at));
    item.occurrenceId = text(row.planned_activity_occurrence_id) ?? undefined;
    item.href = `/workouts/sessions/${id}${status === "completed" ? "/summary" : ""}`;
  } else if (source === "planned_activity_occurrence") {
    const activity = record(row.planned_activity), protocol = text(activity.user_protocol_id);
    // A workout's planner record is never an independent habit/protocol completion.
    if (activity.activity_type === "workout" || (!protocol && activity.activity_type !== "habit") || !["completed", "skipped"].includes(String(row.status))) return [];
    item.category = protocol ? "Protocol" : "Habit";
    item.title = `${row.status === "completed" ? "Completed" : "Skipped"} ${text(activity.title) ?? "routine"}`;
    item.detail = join(text(record(activity.user_protocol).name), number(row.actual_value) !== null ? `${row.actual_value} ${text(activity.target_unit) ?? ""}`.trim() : null);
    item.occurredAt = activityTimestamp(row.status === "completed" ? row.completed_at : row.skipped_at);
    if (!item.occurredAt && isCalendarDate(row.scheduled_date)) item.logicalDate = row.scheduled_date;
    item.href = protocol ? `/protocols/${protocol}` : text(activity.id) ? `/habits/${activity.id}` : "/habits";
  } else if (source === "daily_checkin") {
    if (!isCalendarDate(row.checkin_date)) return [];
    item.category = "Check-in";
    item.title = "Daily Check-In";
    item.logicalDate = row.checkin_date;
    item.href = `/today?date=${row.checkin_date}#daily-checkin`;
  } else if (source === "condition_episode") {
    const condition = record(row.user_condition), catalog = record(condition.condition);
    const name = text(catalog.name) ?? text(condition.custom_condition_name) ?? "Condition";
    item.category = "Episode";
    item.href = `/health/episodes/${id}`;
    const phase = row.activity_phase === "resolved" ? "resolved" : "started";
    item.id += `:${phase}`;
    item.title = `${text(row.title) ?? `${name} ${text(catalog.preferred_episode_label) ?? "episode"}`} ${phase}`;
    item.occurredAt = activityTimestamp(phase === "resolved" ? row.ended_at : row.started_at, row.created_at);
    item.detail = number(row.overall_severity) !== null ? `Severity ${row.overall_severity}` : null;
  } else if (source === "experiment_phase_event") {
    item.category = "Experiment";
    item.title = `${text(record(row.experiment).name) ?? "Experiment"}: ${words(text(row.event_type) ?? "updated")}`;
    item.occurredAt = activityTimestamp(row.occurred_at);
    item.href = text(record(row.experiment).id) ? `/experiments/${record(row.experiment).id}` : "/experiments";
  } else return [];
  return item.occurredAt || item.logicalDate ? [item] : [];
}

/** Fixed query count, recent 14-day window, 40 rows per time branch; no per-row requests. */
export async function loadRecentActivity(client: SupabaseClient, range: { start: string; end: string; startDate: string; endDate: string }): Promise<RecentActivityResult> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("AUTH_REQUIRED");
  const user = data.user.id;
  const timed = (table: string, select: string, field: string) => client.from(table).select(select).eq("user_id", user).gte(field, range.start).lt(field, range.end).order(field, { ascending: false }).limit(LIMIT);
  const dated = (table: string, select: string, field: string) => client.from(table).select(select).eq("user_id", user).gte(field, range.startDate).lte(field, range.endDate).order(field, { ascending: false }).limit(LIMIT);
  const routineSelect = "id,status,scheduled_date,completed_at,skipped_at,actual_value,planned_activity:planned_activities!inner(id,title,activity_type,user_protocol_id,target_unit,user_protocol:user_protocols(name))";
  const workoutSelect = "id,name,status,started_at,ended_at,created_at,duration_seconds,planned_activity_occurrence_id";
  const episodeSelect = "id,title,started_at,ended_at,created_at,overall_severity,user_condition:user_conditions(custom_condition_name,condition:conditions(name,preferred_episode_label))";
  const sources = [
    { name: "health_event", query: dated("health_events", "id,event_date,event_time,event_type,title,description,notes,amount,dose,supplement_name,dose_amount,dose_unit,exercise_type,duration_minutes,severity,created_at", "event_date").order("event_time", { ascending: false, nullsFirst: false }) },
    { name: "nutrition_entry", query: timed("nutrition_entries", "id,title,meal_type,consumed_at,created_at,items:nutrition_entry_items(source_name)", "consumed_at").is("deleted_at", null) },
    { name: "symptom_event", query: timed("user_symptom_events", "id,started_at,created_at,severity,custom_symptom_name,symptom:symptoms(name)", "started_at").is("deleted_at", null) },
    { name: "workout_session", query: timed("workout_sessions", workoutSelect, "ended_at") },
    { name: "workout_session", query: timed("workout_sessions", workoutSelect, "started_at").is("ended_at", null) },
    { name: "planned_activity_occurrence", query: timed("planned_activity_occurrences", routineSelect, "completed_at").eq("status", "completed").neq("planned_activity.activity_type", "workout") },
    { name: "planned_activity_occurrence", query: timed("planned_activity_occurrences", routineSelect, "skipped_at").eq("status", "skipped").neq("planned_activity.activity_type", "workout") },
    { name: "planned_activity_occurrence", query: dated("planned_activity_occurrences", routineSelect, "scheduled_date").in("status", ["completed", "skipped"]).is("completed_at", null).is("skipped_at", null).neq("planned_activity.activity_type", "workout") },
    { name: "daily_checkin", query: dated("daily_checkins", "id,checkin_date", "checkin_date") },
    { name: "condition_episode", phase: "started", query: timed("condition_episodes", episodeSelect, "started_at").is("archived_at", null) },
    { name: "condition_episode", phase: "resolved", query: timed("condition_episodes", episodeSelect, "ended_at").is("archived_at", null) },
    { name: "experiment_phase_event", query: timed("experiment_phase_events", "id,event_type,occurred_at,experiment:experiments(id,name)", "occurred_at").in("event_type", ["baseline_started", "intervention_started", "paused", "resumed", "ended_early", "completed"]) },
  ];
  const results = await Promise.allSettled(sources.map(async source => {
    const result = await source.query;
    if (result.error) throw new Error("SOURCE_UNAVAILABLE");
    return (result.data ?? []).flatMap(row => recentActivityFromRow(source.name, { ...record(row), activity_phase: source.phase }));
  }));
  const items: RecentActivity[] = [], failedSources = new Set<string>();
  results.forEach((result, i) => { if (result.status === "fulfilled") items.push(...result.value); else failedSources.add(sources[i].name); });
  return { items: normalizeRecentActivity(items), failedSources: [...failedSources] };
}
