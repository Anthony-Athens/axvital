import type { SupabaseClient } from "@supabase/supabase-js";
export function assertDevelopment(environment = process.env.NODE_ENV) {
  if (environment !== "development") throw new Error("Demo tools are development-only.");
}
export async function insertDemoCheckins(client: SupabaseClient, rows: { user_id: string; checkin_date: string }[]) {
  assertDevelopment();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || rows.some(row => row.user_id !== auth.user!.id)) throw new Error("AUTH_REQUIRED");
  if (!rows.length) return;
  const { data, error } = await client.from("daily_checkins").select("id").eq("user_id", auth.user.id).in("checkin_date", rows.map(row => row.checkin_date)).limit(1);
  if (error) throw new Error("Could not check demo date collisions.");
  if (data?.length) throw new Error("Demo seed stopped: a check-in already exists on these dates. Use a fresh test account.");
  // Unique owner/date constraint also catches races after the preflight. No upsert or delete.
  const result = await client.from("daily_checkins").insert(rows);
  if (result.error) throw new Error("Demo seed failed without replacing existing check-ins.");
}
