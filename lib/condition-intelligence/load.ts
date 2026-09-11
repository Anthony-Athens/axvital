import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY, PRE_EPISODE_LOOKBACK_DAYS, calendarDay, localRangeStart, type Activity, type Episode } from "./model.ts";
import { compareAssociations } from "./associations.ts";
import { dateInZone, localDateBoundary } from "../measurements/time-window.ts";

// One paginated query per physical source, not per episode or display category.
// Explicit owner filters supplement existing RLS. Never use a service-role client.
export async function loadIntelligence(client: SupabaseClient, userId: string, conditionId: string, now = Date.now(), timeZone = "UTC") {
  const start = localRangeStart(now, timeZone);
  const activityStartDate = new Date(calendarDay(start, timeZone) - PRE_EPISODE_LOOKBACK_DAYS * DAY).toISOString().slice(0, 10);
  const activityStart = localDateBoundary(activityStartDate, timeZone), today = dateInZone(new Date(now), timeZone);
  const sources = [
    { table: "health_events", columns: "id,event_date,event_time,event_type", date: "event_date", category: "Health event", dateOnly: true },
    { table: "daily_checkins", columns: "id,checkin_date,sleep_quality,stress_level,energy_score,exercise_level", date: "checkin_date", category: "Check-in", dateOnly: true },
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
        .gte(source.date, source.dateOnly ? activityStartDate : activityStart)
        .lte(source.date, source.dateOnly ? today : new Date(now).toISOString())
        .order(source.date).order("id").range(offset, offset + 499);
      if (source.deleted) query = query.is("deleted_at", null);
      const { data, error } = await query;
      if (error || (offset === 10000 && data?.length)) { failed.push(source.category); return; }
      for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        const dateOnly = Boolean(source.dateOnly && !row.event_time);
        const stamp = source.dateOnly ? localDateBoundary(String(row[source.date]), timeZone) : String(row[source.date]);
        const at = Date.parse(stamp);
        if (Number.isFinite(at) && at <= now) collected.push({ id: `${source.table}:${row.id}`, at, category: category[String(row.event_type)] ?? source.category, dateOnly,
          ...(source.dateOnly ? { logicalDate: String(row[source.date]) } : {}),
          ...(source.table === "daily_checkins" ? { checkin: { sleepQuality: row.sleep_quality, stress: row.stress_level, energy: row.energy_score, exercise: row.exercise_level } } : {}),
        });
      }
      if ((data?.length ?? 0) < 500) break;
    }
    events.push(...collected);
  }));
  const episodes: Episode[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("condition_episodes").select("id,started_at,ended_at,overall_severity,status")
      .eq("user_id", userId).eq("user_condition_id", conditionId).is("archived_at", null)
      // Include episodes intersecting the visible period, including older ongoing episodes.
      .or(`started_at.gte.${new Date(start).toISOString()},ended_at.gte.${new Date(start).toISOString()},status.eq.ongoing,ended_at.is.null`).lte("started_at", new Date(now).toISOString())
      .order("started_at").order("id").range(offset, offset + 499);
    if (error) throw new Error("Episode history could not be loaded. Please try again.");
    episodes.push(...(data ?? []).map(row => ({ id: row.id, start: Date.parse(row.started_at), end: row.status === "resolved" && row.ended_at ? Date.parse(row.ended_at) : null, severity: row.overall_severity })));
    if ((data?.length ?? 0) < 500) break;
  }
  const associations = compareAssociations(episodes, events, start, now, !failed.includes("Check-in"), timeZone);
  return { episodes, healthEvents: events, associations, unavailable: failed, now, start, timeZone };
}
