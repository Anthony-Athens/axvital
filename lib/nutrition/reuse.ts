import type { Entry, Nutrients } from "./nutrition";

export type Usage = {
  key: string;
  name: string;
  usedAt: string;
};

export type RankedFood = {
  key: string;
  name: string;
  count: number;
  lastUsedAt: string;
};

export type NutritionTarget = {
  id: string;
  target_type: string;
  target_value: number;
  unit: string;
  source_type: string;
  priority: number;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
};

export function rankRecentFoods(usages: Usage[]): RankedFood[] {
  const ranked = new Map<string, RankedFood>();
  for (const usage of usages) {
    const current = ranked.get(usage.key);
    if (!current) ranked.set(usage.key, { key: usage.key, name: usage.name, count: 1, lastUsedAt: usage.usedAt });
    else {
      current.count += 1;
      if (usage.usedAt > current.lastUsedAt) current.lastUsedAt = usage.usedAt;
    }
  }
  return [...ranked.values()].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
}

export function rankFrequentFoods(usages: Usage[], since: string): RankedFood[] {
  return rankRecentFoods(usages.filter((usage) => usage.usedAt >= since))
    .sort((a, b) => b.count - a.count || b.lastUsedAt.localeCompare(a.lastUsedAt));
}

export function resolveTargets(targets: NutritionTarget[], date: string): NutritionTarget[] {
  const eligible = targets.filter((target) =>
    target.source_type === "user" &&
    (!target.starts_on || target.starts_on <= date) &&
    (!target.ends_on || target.ends_on >= date),
  ).sort((a, b) => b.priority - a.priority || b.created_at.localeCompare(a.created_at));
  const resolved = new Map<string, NutritionTarget>();
  for (const target of eligible) if (!resolved.has(target.target_type)) resolved.set(target.target_type, target);
  return [...resolved.values()];
}

export function groupHistory(entries: Entry[]) {
  return entries.reduce<Record<string, Entry[]>>((groups, entry) => {
    const day = new Date(entry.consumed_at).toLocaleDateString("en-CA");
    (groups[day] ??= []).push(entry);
    return groups;
  }, {});
}

export function totalKnownNutrition(entries: Entry[]): Nutrients & { incomplete: Set<keyof Nutrients> } {
  const fields: (keyof Nutrients)[] = ["calories", "protein_grams", "carbohydrate_grams", "fat_grams", "fiber_grams"];
  const result: Nutrients & { incomplete: Set<keyof Nutrients> } = {
    calories: 0, protein_grams: 0, carbohydrate_grams: 0, fat_grams: 0, fiber_grams: 0, incomplete: new Set(),
  };
  for (const item of entries.flatMap((entry) => entry.items)) for (const field of fields) {
    const value = item[field];
    if (value == null) result.incomplete.add(field);
    else result[field] = (result[field] ?? 0) + value;
  }
  return result;
}
