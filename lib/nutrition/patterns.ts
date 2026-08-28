import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassificationKey } from "../rules/types.ts";
import { nutritionPatternTemplates, patternRules } from "./pattern-templates.ts";
export async function createPatternFromTemplate(client: SupabaseClient, key: string, name: string, reviewed: { carbohydrateCeiling?: number; exclusions?: ClassificationKey[] }) {
  const template = nutritionPatternTemplates.find(t => t.key === key);
  if (!template) throw new Error("UNKNOWN_PATTERN_TEMPLATE");
  const definitions = patternRules(key, reviewed);
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error("AUTH_REQUIRED");
  const { data, error } = await client.rpc("create_nutrition_pattern", { input: { name, template_key: key, template_version: template.version, rules: definitions.map((definition, index) => ({ name: `${template.label} requirement ${index + 1}`, definition })) } });
  if (error) throw new Error("PATTERN_CREATE_FAILED");
  return data;
}
