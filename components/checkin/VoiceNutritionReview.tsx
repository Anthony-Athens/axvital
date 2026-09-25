"use client";
import { recipePreview } from "@/lib/nutrition/recipes";
import type { FoodResolution } from "@/lib/nutrition/food-resolution";
import { nutritionPreview, type NutritionDraft } from "@/lib/nutrition/voice-nutrition";
const control = "min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base";
const display = (value: number | null | undefined) => value == null ? "unavailable" : String(Math.round(value * 10) / 10);
export function VoiceNutritionReview({ food, draft, onChange }: { food?: FoodResolution; draft: NutritionDraft; onChange: (draft: NutritionDraft) => void }) {
  const preview = nutritionPreview(food, draft) ?? recipePreview(food, draft);
  const modified = food?.components.some(component => !component.included || component.source !== "library");
  return <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50 p-3" aria-label="Nutrition review">
    <p className="font-semibold">Nutrition Tracker</p>
    {<>
      <label className="grid gap-1">Nutrition serving<select className={control} value={draft.serving_id ?? ""} onChange={e => onChange({ ...draft, serving_id: e.target.value, accept_incomplete: false })}><option value="">Select a compatible serving</option>{draft.servings.map(serving => <option key={serving.id} value={serving.id}>{serving.serving_name}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-2"><label className="grid gap-1">Food quantity<input className={control} type="number" min="0.01" max="10000" step="any" value={draft.quantity ?? ""} onChange={e => onChange({ ...draft, quantity: e.target.value ? Number(e.target.value) : null, accept_incomplete: false })}/></label>
        <label className="grid gap-1">Food unit<input className={control} maxLength={40} value={draft.unit ?? ""} placeholder="each, oz, cup…" onChange={e => onChange({ ...draft, unit: e.target.value || null, accept_incomplete: false })}/></label></div>
      {modified && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.reference_confirmed} onChange={e => onChange({ ...draft, reference_confirmed: e.target.checked, accept_incomplete: false })}/>I checked that this reference serving’s nutrition applies to my modified food. Exclusions do not automatically subtract nutrients.</label>}
    </>}
    {!!food?.components.length && <div className="space-y-2">
      <p>Component amounts below describe one reference recipe. Choose the number of recipes and check every ingredient and portion. Library ingredients are suggestions, not a record of what you ate. Use “{food.recipe_unit ?? "serving"}” as the food unit above; other units are not automatically converted into recipes.</p>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.recipe_confirmed ?? false} onChange={e => onChange({ ...draft, recipe_confirmed: e.target.checked, recipe_unit: food.recipe_unit ?? "serving", accept_incomplete: false })}/>I checked this component recipe and its amounts</label>
    </div>}
    <label className="grid gap-1">Meal<select className={control} value={draft.meal_type ?? ""} onChange={e => onChange({ ...draft, meal_type: e.target.value || null })}><option value="">Not specified</option>{["breakfast", "lunch", "dinner", "snack", "other"].map(meal => <option key={meal}>{meal}</option>)}</select></label>
    {preview ? <p aria-label="Nutrition preview">{display(preview.nutrients.calories)} kcal · {display(preview.nutrients.protein_grams)} g protein · {display(preview.nutrients.carbohydrate_grams)} g carbs · {display(preview.nutrients.fat_grams)} g fat</p> : <>
      <p>Macros unavailable. Review the food match, serving, quantity and unit. Component suggestions alone cannot calculate nutrition.</p>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.accept_incomplete} onChange={e => onChange({ ...draft, accept_incomplete: e.target.checked })}/>Save in Nutrition Tracker without macros for now</label>
      <p className="text-sm">You can match the food again below, or create a custom food with nutrition you supply in the Nutrition Tracker.</p>
    </>}
  </div>;
}
