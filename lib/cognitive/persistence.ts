import type { SupabaseClient } from "@supabase/supabase-js";
import { validateCompletion, type Completion, type Config, type Session } from "./model.ts";

export async function saveSession(client: SupabaseClient, completion: Completion) {
  const validated = validateCompletion(completion);
  // Send only validated raw inputs: the database independently recomputes metrics.
  const { data, error } = await client.rpc("save_cognitive_session_v1", { p_session: {
    id: validated.id, config: validated.config, startedAt: validated.startedAt, elapsedMs: validated.elapsedMs,
    scoringVersion: validated.scoringVersion, generatorVersion: validated.generatorVersion,
    answers: validated.answers.map(({ a, b, operator, answer, atMs }) => ({ a, b, operator, answer, atMs })),
  } }).abortSignal(AbortSignal.timeout(15000));
  if (error || data !== completion.id) throw new Error("Unable to save this result. Your result is still available here. Retry saving.");
  return validated;
}
type Row = { id: string; config: Config; started_at: string; ended_at: string; elapsed_ms: number; answers?: Completion["answers"]; scoring_version: string; generator_version: string; answered: number; correct: number; accuracy: number; qpm: number; score: number };
export function sessionFromRow(row: Row): Session {
  return { id: row.id, config: row.config, startedAt: row.started_at, endedAt: row.ended_at, elapsedMs: row.elapsed_ms, answers: row.answers ?? [], scoringVersion: row.scoring_version, generatorVersion: row.generator_version, answered: row.answered, correct: row.correct, accuracy: Number(row.accuracy), qpm: Number(row.qpm), score: Number(row.score) };
}
const columns = "id,config,started_at,ended_at,elapsed_ms,scoring_version,generator_version,answered,correct,accuracy,qpm,score";
export type Filters = { mode: string; difficulty: string; operation: string };
async function userId(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Please sign in to view Cognitive Training.");
  return data.user.id;
}
export async function listSessions(client: SupabaseClient, filters: Filters, offset = 0, limit = 100) {
  const user = await userId(client);
  let query = client.from("cognitive_sessions").select(columns).eq("user_id", user).order("ended_at", { ascending: false }).order("id", { ascending: false });
  for (const key of ["mode", "difficulty", "operation"] as const) if (filters[key]) query = query.eq(`config->>${key}`, filters[key]);
  const { data, error } = await query.range(offset, offset + limit).abortSignal(AbortSignal.timeout(15000));
  if (error) throw new Error("Unable to load results. Please try again.");
  const rows = (data ?? []) as Row[];
  return { sessions: rows.slice(0, limit).map(sessionFromRow), more: rows.length > limit };
}
export async function getSession(client: SupabaseClient, id: string) {
  const user = await userId(client);
  const { data, error } = await client.from("cognitive_sessions").select(`${columns},answers`).eq("id", id).eq("user_id", user).abortSignal(AbortSignal.timeout(15000)).maybeSingle();
  if (error || !data) throw new Error("This result is unavailable or could not be loaded.");
  return sessionFromRow(data as Row);
}
