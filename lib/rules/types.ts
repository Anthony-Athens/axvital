export const classificationKeys = ["dairy", "meat", "fish", "egg", "animal_derived", "plant_derived", "grain", "legume", "added_sugar", "alcohol"] as const;
export type ClassificationKey = typeof classificationKeys[number];
export type RuleDefinition =
  | { version: 1; domain: "nutrition"; kind: "numeric"; metric: "calories" | "protein_grams" | "carbohydrate_grams" | "fat_grams" | "fiber_grams" | "alcohol_occurrences"; operator: "gte" | "lte" | "eq"; value: number; unit: "kcal" | "g" | "count"; period: "day" }
  | { version: 1; domain: "nutrition"; kind: "exclusion"; metric: "food_classification"; operator: "excludes"; classification: ClassificationKey; period: "day" }
  | { version: 1; domain: "nutrition"; kind: "cutoff"; metric: "food_time"; operator: "not_after"; local_time: string; time_zone: string; period: "day" }
  | { version: 1; domain: "exercise"; kind: "numeric"; metric: "exercise_sessions"; operator: "gte"; value: number; unit: "count"; period: "week"; exercise_id: string };
export type TargetRule = { id: string; user_id: string; name: string; definition: RuleDefinition; revision: number; archived_at: string | null };
