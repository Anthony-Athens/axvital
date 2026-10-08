import type { TimelineSource } from "../types.ts";
import { configurationLabel, type Config } from "../../cognitive/model.ts";

/** Presentation only: never a workout, habit, health event, or correlation input. */
export const getCognitiveEvents: TimelineSource = async ({ client, userId, start, end }) => {
  const { data, error } = await client.from("cognitive_sessions").select("id,config,ended_at,elapsed_ms")
    .eq("user_id", userId).gte("ended_at", start).lt("ended_at", end).order("ended_at").limit(1000).abortSignal(AbortSignal.timeout(10000));
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: `cognitive_session:${row.id}`, sourceId: row.id, sourceType: "cognitive_session", eventType: "cognitive_training" as const,
    occurredAt: row.ended_at, endedAt: row.ended_at, title: "Completed Cognitive Training",
    subtitle: configurationLabel(row.config as Config), description: null, status: "completed",
    metadata: { durationMinutes: Number(row.elapsed_ms) / 60000 }, editable: false, deletable: false,
    detailHref: `/cognitive-training/results/${row.id}`, editHref: null,
  }));
};
