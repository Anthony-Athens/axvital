"use client";

import { useEffect, useRef, useState } from "react";
import { foodCategories, provisionalFood, validateFoodResolution, type FoodResolution } from "@/lib/nutrition/food-resolution";

const control = "min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base";
const sources = { library: "Typical library component — verify", explicit: "Stated in your description", ai_inferred: "AI suggestion — uncertain", user_confirmed: "Added or corrected by you" };
export function FoodReview({ food, label, onChange, onBusy }: { food?: FoodResolution; label: string; onChange: (food: FoodResolution) => void; onBusy: (delta: number) => void }) {
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
      const response = await fetch("/api/nutrition/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, context: label }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(18000)]) });
      if (!response.ok) throw Error();
      const result = validateFoodResolution((await response.json()).food);
      if (result.label !== label) throw Error();
      if (!controller.signal.aborted) onChange(result);
    } catch { if (!controller.signal.aborted) setMessage("Matching is unavailable. You can save this food as entered."); }
    finally { onBusy(-1); setBusy(false); }
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
        <label className="grid gap-1">Correct component name<input className={control} value={component.label} maxLength={160} onChange={e => onChange({ ...current, components: current.components.map((item, i) => i === index ? { ...item, label: e.target.value, food_id: null, categories: [], confidence: null, source: "user_confirmed", confirmed: true } : item) })}/></label>
      </div>)}
      {current.components.length < 16 && <div className="flex flex-wrap items-end gap-2"><label className="grid gap-1">Add a component<input className={control} maxLength={160} value={addition} onChange={e => setAddition(e.target.value)}/></label><button className={control} type="button" disabled={!addition.trim() || current.components.some(item => item.label.trim().toLowerCase() === addition.trim().toLowerCase())} onClick={() => { onChange({ ...current, components: [...current.components, { food_id: null, label: addition.trim(), source: "user_confirmed", confidence: null, included: true, confirmed: true, categories: [] }] }); setAddition(""); }}>Add</button></div>}
      {!!categories.length && <p>Possible categories from selected foods: {categories.map(category => category.name).join(", ")}. These are classifications, not nutrient estimates.</p>}
      {message && <p role="status">{message}</p>}
    </fieldset>
  </details>;
}
