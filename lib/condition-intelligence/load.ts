import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY, PRE_EPISODE_LOOKBACK_DAYS, rangeStart, type Activity, type Episode } from "./model.ts";

// One paginated query per physical source, not per episode or display category.
// Explicit owner filters supplement existing RLS. Never use a service-role client.
export async function loadIntelligence(client: SupabaseClient, userId: string, conditionId: string, now = Date.now()) {
  const start = rangeStart(now), activityStart = start - PRE_EPISODE_LOOKBACK_DAYS * DAY;
  const sources = [
    { table: "health_events", columns: "id,event_date,event_time,event_type", date: "event_date", category: "Health event", dateOnly: true },
    { table: "daily_checkins", columns: "id,checkin_date", date: "checkin_date", category: "Check-in", dateOnly: true },
    { table: "nutrition_entries", columns: "id,consumed_at", date: "consumed_at", category: "Nutrition", deleted: true },
    { table: "workout_sessions", columns: "id,started_at", date: "started_at", category: "Workout" },
    { table: "user_symptom_events", columns: "id,started_at", date: "started_at", category: "Symptom", deleted: true },
  ];
  const category: Record<string, string> = { food: "Nutrition", fluid: "Fluid", supplement: "Supplement", exercise: "Exercise", symptom: "Symptom", medication: "Medication", note: "Note" };
  const failed: string[] = [];
  const events: Activity[] = [];
  await Promise.all(sources.map(async source => {
    const collected: Activity[] = [];
    // A visible completeness notice replaces silent truncation above 10,000 rows/source.
    for (let offset = 0; offset <= 10000; offset += 500) {
      let query = client.from(source.table).select(source.columns).eq("user_id", userId)
        .gte(source.date, new Date(activityStart).toISOString().slice(0, source.dateOnly ? 10 : 24))
        .lte(source.date, new Date(now).toISOString().slice(0, source.dateOnly ? 10 : 24))
        .order(source.date).order("id").range(offset, offset + 499);
      if (source.deleted) query = query.is("deleted_at", null);
      const { data, error } = await query;
      if (error || (offset === 10000 && data?.length)) { failed.push(source.category); return; }
      for (const row of (data ?? []) as unknown as Record<string, string>[]) {
        const dateOnly = Boolean(source.dateOnly && !row.event_time);
        const stamp = source.dateOnly ? `${row[source.date]}T${row.event_time || "00:00:00"}Z` : row[source.date];
        const at = Date.parse(stamp);
        if (Number.isFinite(at) && at <= now) collected.push({ id: `${source.table}:${row.id}`, at, category: category[row.event_type] ?? source.category, dateOnly });
      }
      if ((data?.length ?? 0) < 500) break;
    }
    events.push(...collected);
  }));
  const episodes: Episode[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("condition_episodes").select("id,started_at,ended_at,overall_severity,status")
      .eq("user_id", userId).eq("user_condition_id", conditionId).is("archived_at", null)
      .gte("started_at", new Date(start).toISOString()).lte("started_at", new Date(now).toISOString())
      .order("started_at").order("id").range(offset, offset + 499);
    if (error) throw new Error("Episode history could not be loaded. Please try again.");
    episodes.push(...(data ?? []).map(row => ({ id: row.id, start: Date.parse(row.started_at), end: row.status === "resolved" && row.ended_at ? Date.parse(row.ended_at) : null, severity: row.overall_severity })));
    if ((data?.length ?? 0) < 500) break;
  }
  return { episodes, healthEvents: events, unavailable: failed, now, start };
}
