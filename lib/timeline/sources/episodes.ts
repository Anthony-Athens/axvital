import { durationHours } from "../../episodes/episodes.ts";
import type { TimelineEvent, TimelineSource } from "../types.ts";
type EpisodeRow = { id:string;title:string|null;started_at:string;ended_at:string|null;overall_severity:number|null;functional_impact:string|null;user_condition?:{custom_condition_name:string|null;condition?:{name:string;preferred_episode_label:string|null}|null}|null;symptom_links?:Array<{id:string}> };
export const getEpisodeEvents: TimelineSource = async ({ client, userId, start, end }) => {
  const { data, error } = await client.from("condition_episodes").select("id,title,started_at,ended_at,status,overall_severity,functional_impact,user_condition:user_conditions(custom_condition_name,condition:conditions(name,preferred_episode_label)),symptom_links:episode_symptom_links(id)").eq("user_id", userId).is("archived_at", null).or(`and(started_at.gte.${start},started_at.lt.${end}),and(ended_at.gte.${start},ended_at.lt.${end})`);
  if (error) throw error;
  const events: TimelineEvent[] = [];
  for (const row of (data ?? []) as unknown as EpisodeRow[]) {
    const name = row.user_condition?.condition?.name ?? row.user_condition?.custom_condition_name ?? "Condition", label = row.user_condition?.condition?.preferred_episode_label ?? "Episode", count = row.symptom_links?.length ?? 0;
    if (row.started_at >= start && row.started_at < end) events.push({ id: `condition_episode:${row.id}:started`, sourceId: row.id, sourceType: "condition_episode", eventType: "episode", occurredAt: row.started_at, endedAt: null, title: row.title ?? `${name} ${label} Started`, subtitle: `${row.overall_severity ? `Severity ${row.overall_severity} · ` : ""}${count} symptoms linked`, description: null, status: "ongoing", metadata: { condition: name, episodeLabel: label, symptomCount: count, severity: row.overall_severity, functionalImpact: row.functional_impact }, editable: false, deletable: false, detailHref: `/health/episodes/${row.id}`, editHref: null });
    if (row.ended_at && row.ended_at >= start && row.ended_at < end) events.push({ id: `condition_episode:${row.id}:resolved`, sourceId: row.id, sourceType: "condition_episode", eventType: "episode", occurredAt: row.ended_at, endedAt: null, title: `${name} ${label} Resolved`, subtitle: `Duration ${durationHours(row).toFixed(1)} hr`, description: null, status: "resolved", metadata: { condition: name, episodeLabel: label, symptomCount: count, durationHours: Number(durationHours(row).toFixed(1)) }, editable: false, deletable: false, detailHref: `/health/episodes/${row.id}`, editHref: null });
  }
  return events;
};
