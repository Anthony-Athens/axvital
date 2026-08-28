import type { SupabaseClient } from "@supabase/supabase-js";
import type { RuleDefinition, TargetRule } from "./types.ts";
import { validateRule } from "./validation.ts";
export async function saveRule(client: SupabaseClient, name: string, definition: RuleDefinition, existing?: { id: string; revision: number }): Promise<TargetRule> {
  validateRule(definition);
  if (name.trim().length < 2 || name.trim().length > 120) throw new Error("INVALID_RULE_NAME");
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error("AUTH_REQUIRED");
  const values = { name: name.trim(), definition, exercise_id: definition.domain === "exercise" ? definition.exercise_id : null };
  const query = existing ? client.from("target_rules").update(values).eq("id", existing.id).eq("revision", existing.revision).eq("user_id", auth.user.id) : client.from("target_rules").insert({ ...values, user_id: auth.user.id });
  const { data, error } = await query.select().single();
  if (error || !data) throw new Error("RULE_SAVE_CONFLICT");
  return data as TargetRule;
}
