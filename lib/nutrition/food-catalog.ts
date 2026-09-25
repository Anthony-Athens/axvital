import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, FoodCatalog, CatalogComponent } from "./food-resolution.ts";

export async function loadFoodCatalog(client: SupabaseClient): Promise<FoodCatalog> {
  // Fail closed instead of silently resolving against a truncated catalog.
  const [foods, aliases, categories, map, components] = await Promise.all([
    client.from("foods").select("id,name,common_aliases").eq("is_active", true).limit(1001),
    client.from("food_aliases").select("food_id,alias").limit(1001),
    client.from("food_categories").select("id,name,slug").eq("is_active", true).limit(1001),
    client.from("food_category_map").select("food_id,category_id").limit(1001),
    client.from("food_components").select("parent_food_id,component_food_id,source,confidence").limit(1001),
  ]);
  if ([foods, aliases, categories, map, components].some(result => result.error || !result.data || result.data.length >= 1000)) throw new Error("FOOD_CATALOG_UNAVAILABLE");
  return { foods: foods.data!.map(food => ({
    id: food.id, name: food.name,
    aliases: [...new Set<string>([...(food.common_aliases ?? []), ...aliases.data!.filter(alias => alias.food_id === food.id).map(alias => alias.alias)])],
    categories: (categories.data as Category[]).filter(category => map.data!.some(link => link.food_id === food.id && link.category_id === category.id)),
  })), components: components.data as CatalogComponent[] };
}
