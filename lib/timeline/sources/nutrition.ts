import type { TimelineSource } from "../types.ts";
export const getNutritionEvents: TimelineSource = async ({ client, userId, start, end }) => {
  const { data, error } = await client.from("nutrition_entries").select("id,entry_type,meal_type,title,consumed_at,notes,nutrition_status,stated_amount,source_type,items:nutrition_entry_items(source_name,calories,protein_grams)").eq("user_id", userId).is("deleted_at", null).gte("consumed_at", start).lt("consumed_at", end);
  if (error) throw error;
  return (data ?? []).map(row => {
    const items = (row.items ?? []) as Array<{ source_name: string; calories: number | null; protein_grams: number | null }>;
    const calories = items.length && items.every(item => item.calories !== null) ? items.reduce((n, item) => n + Number(item.calories), 0) : null;
    const protein = items.length && items.every(item => item.protein_grams !== null) ? items.reduce((n, item) => n + Number(item.protein_grams), 0) : null;
    const incomplete = row.nutrition_status === "incomplete" || calories === null || protein === null;
    const meal = row.entry_type === "meal" || items.length > 1;
    return {
      id: `nutrition_entry:${row.id}`, sourceId: row.id, sourceType: "nutrition_entry", eventType: meal ? "meal" as const : "food" as const,
      occurredAt: row.consumed_at, endedAt: null, title: row.title ?? items[0]?.source_name ?? "Food",
      subtitle: incomplete ? `Nutrition incomplete${row.stated_amount ? ` · ${row.stated_amount}` : ""}` : `${items.length > 1 ? `${items.length} items · ` : ""}${Math.round(calories!)} kcal · ${Math.round(protein! * 10) / 10} g protein`,
      description: row.notes, status: null,
      metadata: { itemCount: items.length, items: items.map(item => item.source_name), calories, proteinGrams: protein, mealType: row.meal_type, incomplete, inputMethod: row.source_type },
      editable: true, deletable: true, detailHref: "/health/nutrition", editHref: "/health/nutrition",
    };
  });
};
