"use client";

import { useEffect, useRef, useState } from "react";
import { foodCategories, provisionalFood, validateFoodResolution, type FoodResolution } from "@/lib/nutrition/food-resolution";
import { foodIdentity } from "@/lib/nutrition/food-quantity";
import type { NutritionDraft } from "@/lib/nutrition/voice-nutrition";

const control = "min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base";
const sources = { library: "Typical library component — verify", explicit: "Stated in your description", ai_inferred: "AI suggestion — uncertain", user_confirmed: "Added or corrected by you" };
export function FoodReview({ food, label, amount, onResolved, onChange, onBusy }: { food?: FoodResolution; label: string; amount?: string | null; onResolved?: (food: FoodResolution, nutrition: NutritionDraft) => void; onChange: (food: FoodResolution) => void; onBusy: (delta: number) => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [addition, setAddition] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), [food]);
  const current = food ?? provisionalFood(label);
  async function resolve() {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage(""); onBusy(1);
    try {
      // The edited label is the authority; stale transcript ingredients are never reapplied.
      const response = await fetch("/api/nutrition/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, context: label, amount }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(18000)]) });
      if (!response.ok) throw Error();
      const body = await response.json();
      const result = validateFoodResolution(body.food);
      if (result.label !== foodIdentity(label)) throw Error();
      if (!controller.signal.aborted) { if (onResolved && body.nutrition) onResolved(result, body.nutrition); else onChange(result); }
    } catch { if (!controller.signal.aborted) setMessage("Matching is unavailable. You can save this food as entered."); }
    finally { onBusy(-1); setBusy(false); }
  }
  async function matchComponent(index: number) {
    const component = current.components[index];
    setBusy(true); setMessage(""); onBusy(1);
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    try {
      const n = component.nutrition;
      const response = await fetch("/api/nutrition/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: component.label, context: component.label, amount: n?.quantity == null ? null : `${n.quantity} ${n.unit ?? ""}`.trim() }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(18000)]) });
      if (!response.ok) throw Error();
      const body = await response.json(), matched = validateFoodResolution(body.food), nutrition = body.nutrition as NutritionDraft;
      if (!matched.food_id || !nutrition || current.components.some((item, i) => i !== index && item.food_id === matched.food_id)) throw Error();
      const suggested = ["ai", "fuzzy"].includes(matched.method);
      if (!controller.signal.aborted) onChange({ ...current, components: current.components.map((item, i) => i === index ? { ...item, food_id: matched.food_id, label: matched.canonical_name ?? matched.label, categories: matched.categories, nutrition, source: suggested ? "ai_inferred" : "user_confirmed", confirmed: !suggested, included: !suggested } : item) });
    } catch { if (!controller.signal.aborted) setMessage("Choose a distinct catalog food for this component. Unmatched components keep nutrition incomplete."); }
    finally { setBusy(false); onBusy(-1); }
  }
  function editComponent(index: number, patch: Partial<NonNullable<FoodResolution["components"][number]["nutrition"]>>) {
    onChange({ ...current, components: current.components.map((item, i) => i === index ? { ...item, confirmed: true, nutrition: { servings: [], serving_id: null, quantity: null, unit: null, ...item.nutrition, ...patch } } : item) });
  }
  const categories = foodCategories(current);
  return <details className="rounded-lg bg-slate-50 p-3">
    <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Food details{current.canonical_name ? ` · ${current.canonical_name}` : " · unmatched"}</summary>
    <fieldset disabled={busy} className="space-y-3 text-sm">
      <p>{current.food_id ? `Catalog match: ${current.canonical_name} (${current.method}).` : "Saved as entered. No trusted catalog food has been selected."} Components stay inside this event.</p>
      {(current.method === "ai" || current.method === "fuzzy") && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={current.confirmed} onChange={e => onChange({ ...current, confirmed: e.target.checked })}/>Confirm this suggested food match</label>}
      <div className="flex flex-wrap gap-2"><button className={control} type="button" disabled={busy || !label.trim()} onClick={() => void resolve()}>{busy ? "Matching…" : "Match food again"}</button>{current.food_id && <button className={control} type="button" onClick={() => onChange(provisionalFood(label))}>Use my label only</button>}</div>
      {!!current.components.length && <p>Typical components may differ from your meal. Uncheck anything absent. AI suggestions start unchecked; checking one confirms it.</p>}
      {current.components.map((component, index) => <div className="space-y-1 border-t border-slate-200 pt-2" key={index}>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={component.included} onChange={e => onChange({ ...current, components: current.components.map((item, i) => i === index ? { ...item, included: e.target.checked, confirmed: true } : item) })}/>{component.label}{!component.included && " (excluded)"}</label>
        <p className="text-slate-600">{sources[component.source]}{component.confirmed ? " · confirmed by you" : " · not individually confirmed"}</p>
        <label className="grid gap-1">Correct component name<input className={control} value={component.label} maxLength={160} onChange={e => onChange({ ...current, components: current.components.map((item, i) => i === index ? { ...item, label: e.target.value, food_id: null, categories: [], nutrition: { ...item.nutrition, servings: [], serving_id: null, quantity: item.nutrition?.quantity ?? null, unit: item.nutrition?.unit ?? null }, confidence: null, source: "user_confirmed", confirmed: true } : item) })}/></label>
        <button type="button" className={control} onClick={() => void matchComponent(index)}>Match component</button>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">Quantity for {component.label}<input className={control} type="number" min="0.01" max="10000" step="any" value={component.nutrition?.quantity ?? ""} onChange={e => editComponent(index, { quantity: e.target.value ? Number(e.target.value) : null })}/></label>
          <label className="grid gap-1">Unit for {component.label}<input className={control} maxLength={40} value={component.nutrition?.unit ?? ""} onChange={e => editComponent(index, { unit: e.target.value || null })}/></label>
        </div>
        <label className="grid gap-1">Serving for {component.label}<select className={control} value={component.nutrition?.serving_id ?? ""} onChange={e => editComponent(index, { serving_id: e.target.value || null })}><option value="">Select a matched serving</option>{component.nutrition?.servings.map(serving => <option key={serving.id} value={serving.id}>{serving.serving_name}</option>)}</select></label>
        <button type="button" className={control} onClick={() => onChange({ ...current, components: current.components.filter((_, i) => i !== index) })}>Remove component {component.label}</button>
      </div>)}
      {current.components.length < 16 && <div className="flex flex-wrap items-end gap-2"><label className="grid gap-1">Add a component<input className={control} maxLength={160} value={addition} onChange={e => setAddition(e.target.value)}/></label><button className={control} type="button" disabled={!addition.trim() || current.components.some(item => item.label.trim().toLowerCase() === addition.trim().toLowerCase())} onClick={() => { onChange({ ...current, components: [...current.components, { food_id: null, label: addition.trim(), source: "user_confirmed", confidence: null, included: true, confirmed: true, categories: [] }] }); setAddition(""); }}>Add</button></div>}
      {!!categories.length && <p>Possible categories from selected foods: {categories.map(category => category.name).join(", ")}. These are classifications, not nutrient estimates.</p>}
      {message && <p role="status">{message}</p>}
    </fieldset>
  </details>;
}
