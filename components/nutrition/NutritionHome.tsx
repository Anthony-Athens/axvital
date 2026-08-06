"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button, ButtonLink, EmptyState, InlineNotice, LoadingSkeleton, PageContainer,
  PageHeader, Surface, controlClass, textareaClass,
} from "@/components/ui/design-system";
import {
  createUserFood, deleteEntry, loadFoodServings, loadNutrition, logFood, scaleNutrition, searchFoods, selectInitialServing,
  totalNutrition, type Entry, type Food, type Serving, type UserFood,
} from "@/lib/nutrition/nutrition";
import { createClient } from "@/lib/supabase/browser";

type Selection = { food: Food; user?: never } | { user: UserFood; food?: never };
const localNow = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};
const format = (value: number | null | undefined) =>
  value == null ? "—" : Number(value.toFixed(1)).toLocaleString();

export function NutritionHome() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [userFoods, setUserFoods] = useState<UserFood[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Selection | null>(null);
  const [serving, setServing] = useState<Serving | null>(null);
  const [servingLoading, setServingLoading] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [consumed, setConsumed] = useState(localNow());
  const [meal, setMeal] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [custom, setCustom] = useState(false);
  const servingRequest = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadNutrition(createClient());
      setFoods(result.foods); setUserFoods(result.userFoods); setEntries(result.entries);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load nutrition.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const results = useMemo(() => searchFoods(foods, userFoods, search), [foods, userFoods, search]);
  const totals = totalNutrition(entries);
  const base = serving ?? selected?.user;
  const preview = base ? scaleNutrition(base, quantity) : null;

  async function chooseFood(food: Food) {
    const requestId = ++servingRequest.current;
    setSelected({ food });
    setServing(null); setServingLoading(true); setError("");
    try {
      const options = await loadFoodServings(createClient(), food.id);
      if (requestId !== servingRequest.current) return;
      const selectedFood = { ...food, servings: options };
      setFoods((current) => current.map((item) => item.id === food.id ? selectedFood : item));
      setSelected({ food: selectedFood });
      setServing(selectInitialServing(options));
      if (!options.length && process.env.NODE_ENV === "development") {
        console.error("nutrition.servings.missing", { foodId: food.id, foodName: food.name, sourceType: "global", queryReturnedCount: options.length });
      }
    } catch (cause) {
      if (requestId !== servingRequest.current) return;
      setError(cause instanceof Error ? cause.message : "Serving options could not be loaded.");
    } finally { setServingLoading(false); }
  }
  function chooseUser(user: UserFood) {
    setSelected({ user });
    setServing(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !selected) return;
    setSaving(true); setError("");
    try {
      await logFood(createClient(), {
        foodId: selected.food?.id, servingId: serving?.id, userFoodId: selected.user?.id,
        quantity, consumedAt: new Date(consumed).toISOString(), mealType: meal, notes,
      });
      setSelected(null); setQuantity(1); setNotes("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to log food.");
    } finally { setSaving(false); }
  }

  if (loading) return <PageContainer><LoadingSkeleton className="h-72" /></PageContainer>;
  return (
    <PageContainer>
      <ButtonLink href="/today" variant="tertiary" className="mb-3 -ml-4">← Today</ButtonLink>
      <PageHeader eyebrow="My Health" title="Nutrition" description="Log foods with structured servings and preserved nutrition snapshots." />
      <p className="mt-3 text-sm text-slate-600">Your nutrition data is private to your AXVital account.</p>
      {error ? <div className="mt-4"><InlineNotice>{error}</InlineNotice></div> : null}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Today nutrition totals">
        {([
          ["Calories", totals.calories, "kcal"], ["Protein", totals.protein_grams, "g"],
          ["Carbohydrates", totals.carbohydrate_grams, "g"], ["Fat", totals.fat_grams, "g"],
        ] as const).map(([name, value, unit]) => (
          <Surface compact key={name}><p className="text-sm text-slate-500">{name}</p><p className="mt-1 text-xl font-semibold">{format(value)} {unit}</p></Surface>
        ))}
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Log Food</h2>
        {!selected && !custom ? (
          <>
            <input type="search" className={`${controlClass} mt-3`} placeholder="Search foods" value={search} onChange={(event) => setSearch(event.target.value)} />
            <div className="mt-3 max-h-80 divide-y overflow-y-auto rounded-xl border bg-white">
              {results.user.map((food) => <button type="button" key={food.id} onClick={() => chooseUser(food)} className="min-h-14 w-full px-4 text-left"><span className="font-semibold">{food.name}</span><span className="block text-xs text-slate-500">Custom food</span></button>)}
              {results.global.map((food) => <button type="button" key={food.id} onClick={() => chooseFood(food)} className="min-h-14 w-full px-4 text-left"><span className="font-semibold">{food.name}</span>{food.brand_name ? <span className="block text-xs text-slate-500">{food.brand_name}</span> : null}</button>)}
              {!results.user.length && !results.global.length ? <div className="p-6 text-center"><p className="font-semibold">No matching foods found</p><p className="text-sm text-slate-500">Try another search or create a custom food.</p></div> : null}
            </div>
            <Button variant="secondary" className="mt-3" onClick={() => setCustom(true)}>Create custom food</Button>
          </>
        ) : custom ? (
          <CustomFood onCancel={() => setCustom(false)} onCreated={(food) => { setUserFoods((current) => [food, ...current]); chooseUser(food); setCustom(false); }} />
        ) : selected ? (
          <form onSubmit={submit} className="mt-4 grid gap-4 rounded-xl border bg-white p-4">
            <div><h3 className="font-semibold">{selected.food?.name ?? selected.user?.name}</h3><button type="button" className="min-h-11 text-sm font-semibold text-blue-700" onClick={() => setSelected(null)}>Choose another food</button></div>
            {selected.food ? <label className="grid gap-1 text-sm font-semibold">Serving<select disabled={servingLoading || !selected.food.servings.length} className={controlClass} value={serving?.id ?? ""} onChange={(event) => setServing(selected.food.servings.find((item) => item.id === event.target.value) ?? null)}>{servingLoading ? <option value="">Loading servings…</option> : null}{selected.food.servings.map((item) => <option value={item.id} key={item.id}>{item.serving_name}</option>)}</select></label> : <label className="grid gap-1 text-sm font-semibold">Serving<select className={controlClass} value={selected.user.id} disabled><option value={selected.user.id}>{selected.user.serving_name}</option></select></label>}
            {selected.food && !servingLoading && !selected.food.servings.length ? <InlineNotice>No serving options are available for this food.</InlineNotice> : null}
            <label className="grid gap-1 text-sm font-semibold">Quantity<input type="number" inputMode="decimal" min="0.01" step="0.01" className={controlClass} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
            <label className="grid gap-1 text-sm font-semibold">Consumed at<input type="datetime-local" className={controlClass} value={consumed} onChange={(event) => setConsumed(event.target.value)} /></label>
            <label className="grid gap-1 text-sm font-semibold">Meal type<select className={controlClass} value={meal} onChange={(event) => setMeal(event.target.value)}><option value="">Not specified</option>{["breakfast", "lunch", "dinner", "snack", "other"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-semibold">Notes<textarea className={textareaClass} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            {preview ? <div className="rounded-lg bg-blue-50 p-4"><p className="font-semibold">Nutrition preview</p><p className="mt-1 text-sm">{format(preview.calories)} calories · {format(preview.protein_grams)} g protein · {format(preview.carbohydrate_grams)} g carbohydrates · {format(preview.fat_grams)} g fat</p></div> : null}
            <Button disabled={saving || servingLoading || (Boolean(selected.food) && !serving)}>{saving ? "Saving…" : "Log food"}</Button>
          </form>
        ) : null}
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Today’s food</h2>
        <div className="mt-3 grid gap-3">
          {entries.map((entry) => <Surface compact key={entry.id}><div className="flex justify-between gap-3"><div><p className="font-semibold">{entry.title}</p><p className="text-sm text-slate-500">{new Date(entry.consumed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{entry.meal_type ? ` · ${entry.meal_type}` : ""}</p><p className="mt-1 text-sm">{format(entry.items[0]?.calories)} calories · {format(entry.items[0]?.protein_grams)} g protein</p></div><Button variant="tertiary" aria-label={`Delete ${entry.title} food log`} onClick={() => { if (confirm(`Delete ${entry.title}?`)) void deleteEntry(createClient(), entry.id).then(load); }}>Delete</Button></div></Surface>)}
          {!entries.length ? <EmptyState title="No foods logged yet" description="Log a food to begin building your nutrition history." /> : null}
        </div>
      </section>
    </PageContainer>
  );
}

function CustomFood({ onCancel, onCreated }: { onCancel: () => void; onCreated: (food: UserFood) => void }) {
  const [name, setName] = useState(""); const [serving, setServing] = useState("1 serving");
  const [calories, setCalories] = useState(""); const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState(""); const [fat, setFat] = useState(""); const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      onCreated(await createUserFood(createClient(), {
        name, brand_name: null, serving_name: serving, serving_quantity: 1, serving_unit: "serving",
        calories: calories ? Number(calories) : null, protein_grams: protein ? Number(protein) : null,
        carbohydrate_grams: carbs ? Number(carbs) : null, fat_grams: fat ? Number(fat) : null,
      }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create food."); }
  }
  const fields = [["Calories", calories, setCalories], ["Protein (g)", protein, setProtein], ["Carbohydrates (g)", carbs, setCarbs], ["Fat (g)", fat, setFat]] as const;
  return <form onSubmit={save} className="mt-4 grid gap-3 rounded-xl border bg-white p-4"><h3 className="font-semibold">Create custom food</h3><label className="grid gap-1 text-sm font-semibold">Name<input required className={controlClass} value={name} onChange={(event) => setName(event.target.value)} /></label><label className="grid gap-1 text-sm font-semibold">Serving name<input required className={controlClass} value={serving} onChange={(event) => setServing(event.target.value)} /></label><div className="grid grid-cols-2 gap-3">{fields.map(([label, value, setter]) => <label key={label} className="grid gap-1 text-sm font-semibold">{label}<input type="number" min="0" step="0.1" className={controlClass} value={value} onChange={(event) => setter(event.target.value)} /></label>)}</div>{error ? <InlineNotice>{error}</InlineNotice> : null}<div className="flex gap-2"><Button>Create and log</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div></form>;
}
