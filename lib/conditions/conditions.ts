import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogCondition, ConditionCategory, ConditionInput, ConditionStatus, UserCondition } from "./types";

const USER_CONDITION_SELECT = "*,condition:conditions(*,category:condition_categories(slug,name))";
export const editableStatuses = ["active", "monitoring", "remission", "resolved"] as const;

async function currentUserId(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("AUTH_REQUIRED");
  return data.user.id;
}

export function conditionDisplayName(item: UserCondition) {
  return item.condition?.name ?? item.custom_condition_name ?? "Condition";
}

export function filterCatalog(catalog: CatalogCondition[], categoryId: string, search: string) {
  const query = search.trim().toLocaleLowerCase();
  return catalog.filter((condition) => {
    if (categoryId && condition.category_id !== categoryId) return false;
    if (!query) return true;
    return [condition.name, condition.short_name, condition.category?.name, ...condition.common_aliases]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(query));
  });
}

export function validateConditionInput(input: ConditionInput, currentYear = new Date().getUTCFullYear()) {
  const customName = input.customName?.trim() || null;
  if ((!input.conditionId && !customName) || (input.conditionId && customName)) return "Choose a catalog condition or enter one custom condition.";
  if (customName && (customName.length < 2 || customName.length > 120)) return "Custom condition names must be between 2 and 120 characters.";
  if (!editableStatuses.includes(input.status)) return "Choose a valid condition status.";
  if (input.notes && input.notes.length > 2000) return "Notes must be 2,000 characters or fewer.";
  if (input.diagnosedYear && (input.diagnosedYear < 1900 || input.diagnosedYear > currentYear)) return `Diagnosis year must be between 1900 and ${currentYear}.`;
  if (input.diagnosedOn) {
    const date = new Date(`${input.diagnosedOn}T00:00:00Z`);
    if (Number.isNaN(date.valueOf()) || input.diagnosedOn < "1900-01-01" || input.diagnosedOn > new Date().toISOString().slice(0, 10)) return "Diagnosis date must be a valid date that is not in the future.";
    if (input.diagnosedYear && date.getUTCFullYear() !== input.diagnosedYear) return "Diagnosis date and year must refer to the same year.";
  }
  return null;
}

export async function getConditionCatalog(client: SupabaseClient) {
  const [categoriesResult, conditionsResult] = await Promise.all([
    client.from("condition_categories").select("id,slug,name,description,display_order").order("display_order").order("name"),
    client.from("conditions").select("id,category_id,slug,name,short_name,description,common_aliases,is_featured,display_order,category:condition_categories(slug,name)").order("is_featured", { ascending: false }).order("display_order").order("name"),
  ]);
  if (categoriesResult.error || conditionsResult.error) throw new Error("CATALOG_LOAD_FAILED");
  return { categories: (categoriesResult.data ?? []) as unknown as ConditionCategory[], catalog: (conditionsResult.data ?? []) as unknown as CatalogCondition[] };
}

export async function getUserConditions(client: SupabaseClient) {
  const userId = await currentUserId(client);
  const { data, error } = await client.from("user_conditions").select(USER_CONDITION_SELECT).eq("user_id", userId).order("is_primary", { ascending: false }).order("updated_at", { ascending: false });
  if (error) throw new Error("CONDITIONS_LOAD_FAILED");
  return (data ?? []) as unknown as UserCondition[];
}

export async function getUserCondition(client: SupabaseClient, id: string) {
  const userId = await currentUserId(client);
  const { data, error } = await client.from("user_conditions").select(USER_CONDITION_SELECT).eq("id", id).eq("user_id", userId).single();
  if (error) throw new Error("CONDITION_NOT_FOUND");
  return data as unknown as UserCondition;
}

function payload(input: ConditionInput, userId?: string) {
  const validation = validateConditionInput(input);
  if (validation) throw new Error(validation);
  return {
    ...(userId ? { user_id: userId } : {}), condition_id: input.conditionId || null,
    custom_condition_name: input.customName?.trim() || null, status: input.status,
    diagnosed_on: input.diagnosedOn || null, diagnosed_year: input.diagnosedOn ? new Date(`${input.diagnosedOn}T00:00:00Z`).getUTCFullYear() : input.diagnosedYear || null,
    is_primary: false, notes: input.notes?.trim() || null,
  };
}

function friendlyMutationError(error: { code?: string } | null, fallback: string) {
  if (error?.code === "23505") return new Error("You are already tracking this condition. Restore its archived record instead.");
  return new Error(fallback);
}

export async function addUserCondition(client: SupabaseClient, input: ConditionInput) {
  const userId = await currentUserId(client);
  const { data, error } = await client.from("user_conditions").insert(payload(input, userId)).select(USER_CONDITION_SELECT).single();
  if (error) throw friendlyMutationError(error, "We couldn’t add this condition.");
  if (input.isPrimary) await setPrimaryCondition(client, data.id);
  return data as unknown as UserCondition;
}

export async function updateUserCondition(client: SupabaseClient, id: string, input: ConditionInput) {
  const userId = await currentUserId(client);
  const changes = payload(input);
  const { data, error } = await client.from("user_conditions").update(changes).eq("id", id).eq("user_id", userId).select(USER_CONDITION_SELECT).single();
  if (error) throw friendlyMutationError(error, "We couldn’t update this condition.");
  if (input.isPrimary) await setPrimaryCondition(client, id);
  return data as unknown as UserCondition;
}

export async function setPrimaryCondition(client: SupabaseClient, id: string) {
  const { error } = await client.rpc("set_primary_user_condition", { target_condition_id: id });
  if (error) throw new Error("We couldn’t update your primary condition.");
}

export async function archiveCondition(client: SupabaseClient, id: string) {
  const userId = await currentUserId(client); const now = new Date().toISOString();
  const { error } = await client.from("user_conditions").update({ status: "archived" satisfies ConditionStatus, archived_at: now, is_primary: false }).eq("id", id).eq("user_id", userId);
  if (error) throw new Error("We couldn’t archive this condition.");
}

export async function restoreCondition(client: SupabaseClient, id: string) {
  const userId = await currentUserId(client);
  const { error } = await client.from("user_conditions").update({ status: "active" satisfies ConditionStatus, archived_at: null }).eq("id", id).eq("user_id", userId);
  if (error) throw friendlyMutationError(error, "We couldn’t restore this condition.");
}
