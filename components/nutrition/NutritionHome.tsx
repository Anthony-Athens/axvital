"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  EmptyState,
  InlineNotice,
  LoadingSkeleton,
  PageContainer,
  controlClass,
  textareaClass,
} from "@/components/ui/design-system";
import {
  completeEntry,
  createUserFood,
  deleteEntry,
  loadFoodServings,
  loadNutrition,
  logFood,
  scaleNutrition,
  searchFoods,
  selectInitialServing,
  type Entry,
  type Food,
  type Serving,
  type UserFood,
} from "@/lib/nutrition/nutrition";
import { totalKnownNutrition } from "@/lib/nutrition/reuse";
import { createClient } from "@/lib/supabase/browser";

import { FoodReview } from "@/components/checkin/FoodReview";
import { VoiceNutritionReview } from "@/components/checkin/VoiceNutritionReview";
import { provisionalFood, type FoodResolution } from "@/lib/nutrition/food-resolution";
import { nutritionDraft, type NutritionDraft } from "@/lib/nutrition/voice-nutrition";
import { logManualRecipe } from "@/lib/nutrition/ingestion";
import { sumNutrition } from "@/lib/nutrition/nutrition";
import Link from "next/link";
import { CategoryIcon } from "@/components/ui/CategoryIcon";

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
  const [completing, setCompleting] = useState<string | null>(null);
  const servingRequest = useRef(0);
  const [recipe, setRecipe] = useState<{ food: FoodResolution; draft: NutritionDraft } | null>(
    null,
  );
  const [recipeBusy, setRecipeBusy] = useState(0);
  const recipeRequest = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadNutrition(createClient());
      setFoods(result.foods);
      setUserFoods(result.userFoods);
      setEntries(result.entries);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load nutrition.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const results = useMemo(() => searchFoods(foods, userFoods, search), [foods, userFoods, search]);
  const totals = totalKnownNutrition(entries);
  const base = serving ?? selected?.user;
  const preview = base ? scaleNutrition(base, quantity) : null;

  async function chooseFood(food: Food) {
    const requestId = ++servingRequest.current;
    setRecipe(null);
    recipeRequest.current = null;
    setSelected({ food });
    setServing(null);
    setServingLoading(true);
    setError("");
    try {
      const options = await loadFoodServings(createClient(), food.id);
      if (food.recipe_unit && !completing) {
        const response = await fetch("/api/nutrition/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: food.name,
            context: food.name,
            amount: `1 ${food.recipe_unit}`,
          }),
        });
        if (!response.ok) throw Error("Unable to load this recipe. Try again.");
        const body = await response.json();
        if (requestId !== servingRequest.current) return;
        setRecipe({ food: body.food, draft: body.nutrition });
      }
      if (requestId !== servingRequest.current) return;
      const selectedFood = { ...food, servings: options };
      setFoods((current) => current.map((item) => (item.id === food.id ? selectedFood : item)));
      setSelected({ food: selectedFood });
      setServing(selectInitialServing(options));
    } catch (cause) {
      if (requestId !== servingRequest.current) return;
      setError(cause instanceof Error ? cause.message : "Serving options could not be loaded.");
    } finally {
      setServingLoading(false);
    }
  }
  function chooseUser(user: UserFood) {
    servingRequest.current++;
    setRecipe(null);
    recipeRequest.current = null;
    setSelected({ user });
    setServing(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !selected || recipeBusy > 0) return;
    setSaving(true);
    setError("");
    try {
      const input = {
        foodId: selected.food?.id,
        servingId: serving?.id,
        userFoodId: selected.user?.id,
        quantity,
        consumedAt: new Date(consumed).toISOString(),
        mealType: meal,
        notes,
      };
      if (recipe && !completing) {
        const client = createClient();
        const { data } = await client.auth.getUser();
        if (!data.user) throw Error("Please sign in again.");
        recipeRequest.current ??= crypto.randomUUID();
        await logManualRecipe(
          client,
          {
            event: {
              event_type: "food",
              title: recipe.food.label,
              food: recipe.food,
              event_date: consumed.slice(0, 10),
              event_time: consumed.slice(11),
              notes,
            },
            nutrition: { ...recipe.draft, meal_type: meal || recipe.draft.meal_type },
            source_fragment: "",
            time_note: "",
            requires_review: true,
          },
          data.user.id,
          recipeRequest.current,
        );
      } else if (completing) await completeEntry(createClient(), completing, input);
      else await logFood(createClient(), input);
      setCompleting(null);
      setSelected(null);
      setRecipe(null);
      recipeRequest.current = null;
      setQuantity(1);
      setNotes("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to log food.");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <PageContainer>
        <LoadingSkeleton className="h-72" />
      </PageContainer>
    );
  const groups = mealGroups(entries);
  const macroCalories =
    (totals.protein_grams ?? 0) * 4 +
    (totals.carbohydrate_grams ?? 0) * 4 +
    (totals.fat_grams ?? 0) * 9;
  const split = (
    [
      ["Protein", totals.protein_grams, 4, "bg-cat-food"],
      ["Carbs", totals.carbohydrate_grams, 4, "bg-cat-food/65"],
      ["Fat", totals.fat_grams, 9, "bg-cat-food/35"],
    ] as const
  ).map(([name, grams, perGram, tone]) => ({
    name,
    grams: grams ?? 0,
    tone,
    share: macroCalories ? Math.round((((grams ?? 0) * perGram) / macroCalories) * 100) : 0,
  }));

  return (
    <PageContainer>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="text-sm text-fg-3">
            <Link href="/track" className="hover:text-fg">
              Track
            </Link>{" "}
            / <span className="text-fg-2">Nutrition</span>
          </nav>
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-fg sm:text-[32px]">
            Nutrition
          </h1>
        </div>
        <p className="text-sm text-fg-3">
          {new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          }).format(new Date())}
        </p>
      </header>
      <nav
        aria-label="Nutrition sections"
        className="mt-4 flex gap-1 overflow-x-auto border-b border-line"
      >
        {(
          [
            ["Today", "/health/nutrition"],
            ["Goals", "/health/nutrition/goals"],
            ["Diets", "/health/nutrition/diets"],
            ["Supplements", "/health/supplements"],
            ["Review intake", "/health/nutrition/review"],
          ] as const
        ).map(([label, href]) => (
          <Link
            key={href}
            href={href}
            aria-current={href === "/health/nutrition" ? "page" : undefined}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3.5 text-[15px] ${
              href === "/health/nutrition"
                ? "border-accent-fg font-semibold text-fg"
                : "border-transparent text-fg-3 hover:text-fg"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {error ? (
        <div className="mt-4">
          <InlineNotice>{error}</InlineNotice>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-start">
        <section
          aria-label="Today nutrition totals"
          className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 lg:col-start-2 lg:row-start-1"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[17px] font-semibold">Today so far</h2>
            <Link
              href="/health/nutrition/goals"
              className="text-sm font-semibold text-accent-fg hover:underline"
            >
              Goals
            </Link>
          </div>
          <div className="flex items-end justify-between gap-3">
            <p className="text-[40px] font-bold leading-none tracking-tight tabular-nums">
              {format(totals.calories)}
              <span className="ml-1.5 text-base font-medium text-fg-3">kcal</span>
            </p>
            <span className="text-[13px] tabular-nums text-fg-3">
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <div>
            <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-full bg-line">
              {split.map((part) =>
                part.share ? (
                  <span key={part.name} className={part.tone} style={{ width: `${part.share}%` }} />
                ) : null,
              )}
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              {split.map((part) => (
                <div key={part.name} className="rounded-xl bg-raised px-3 py-2.5">
                  <dt className="flex items-center gap-1.5 text-[13px] text-fg-3">
                    <span aria-hidden="true" className={`h-2 w-2 rounded-full ${part.tone}`} />
                    {part.name}
                  </dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {format(part.grams)}
                    <span className="ml-0.5 text-[13px] font-normal text-fg-3">g</span>
                  </dd>
                  <dd className="text-xs tabular-nums text-fg-3">{part.share}% of kcal</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="text-[13px] tabular-nums text-fg-3">Fiber {format(totals.fiber_grams)} g</p>
          {totals.incomplete.size > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-[13px] text-amber-200">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="mt-px h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              Some logged foods have incomplete nutrition. Totals include known values only.
            </p>
          )}
          <p className="text-xs text-fg-3">
            Your nutrition data is private to your AXVital account.
          </p>
        </section>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <section
            aria-labelledby="log-food-heading"
            className="rounded-2xl border border-line bg-surface p-4 sm:p-5"
          >
            <div className="mb-3 flex items-center gap-3">
              <CategoryIcon category="food" />
              <h2 id="log-food-heading" className="text-lg font-semibold">
                Log Food
              </h2>
            </div>
            {completing && (
              <InlineNotice>
                Complete the existing food log by selecting nutrition that matches what you ate. Its
                original time, notes and component exclusions are retained.{" "}
                <button
                  type="button"
                  onClick={() => {
                    setCompleting(null);
                    setSelected(null);
                  }}
                >
                  Cancel completion
                </button>
              </InlineNotice>
            )}
            {!selected && !custom ? (
              <>
                <label htmlFor="nutrition-search" className="sr-only">
                  Search foods
                </label>
                <input
                  id="nutrition-search"
                  type="search"
                  className={`${controlClass} min-h-14 text-[16px]`}
                  placeholder="Search foods, e.g. oats, chicken bowl, latte"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <div className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-raised/40">
                  {results.user.map((food) => (
                    <button
                      type="button"
                      key={food.id}
                      onClick={() => chooseUser(food)}
                      className="min-h-14 w-full px-4 text-left hover:bg-raised focus-visible:bg-raised"
                    >
                      <span className="font-semibold">{food.name}</span>
                      <span className="block text-xs text-fg-3">Custom food</span>
                    </button>
                  ))}
                  {results.global.map((food) => (
                    <button
                      type="button"
                      key={food.id}
                      onClick={() => chooseFood(food)}
                      className="min-h-14 w-full px-4 text-left hover:bg-raised focus-visible:bg-raised"
                    >
                      <span className="font-semibold">{food.name}</span>
                      {food.brand_name ? (
                        <span className="block text-xs text-fg-3">{food.brand_name}</span>
                      ) : null}
                    </button>
                  ))}
                  {!results.user.length && !results.global.length ? (
                    <div className="p-6 text-center">
                      <p className="font-semibold">No matching foods found</p>
                      <p className="text-sm text-fg-3">
                        Try another search or create a custom food.
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setCustom(true)}>
                    Create custom food
                  </Button>
                  {!completing && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const food = provisionalFood(search.trim() || "My meal");
                        servingRequest.current++;
                        recipeRequest.current = null;
                        setServing(null);
                        setServingLoading(false);
                        setSelected({
                          food: {
                            id: "",
                            name: food.label,
                            brand_name: null,
                            common_aliases: [],
                            servings: [],
                          },
                        });
                        setRecipe({ food, draft: nutritionDraft(food, [], "1 serving") });
                      }}
                    >
                      Build a meal
                    </Button>
                  )}
                </div>
              </>
            ) : custom ? (
              <CustomFood
                onCancel={() => setCustom(false)}
                onCreated={(food) => {
                  setUserFoods((current) => [food, ...current]);
                  chooseUser(food);
                  setCustom(false);
                }}
              />
            ) : selected ? (
              <form onSubmit={submit} className="mt-1 grid gap-4">
                <div>
                  <h3 className="text-lg font-semibold">
                    {selected.food?.name ?? selected.user?.name}
                  </h3>
                  <button
                    type="button"
                    className="min-h-11 text-sm font-semibold text-accent-fg"
                    onClick={() => setSelected(null)}
                  >
                    Choose another food
                  </button>
                </div>
                {recipe ? (
                  <>
                    <label className="grid gap-1 text-sm font-semibold">
                      Meal name
                      <input
                        className={controlClass}
                        maxLength={160}
                        value={recipe.food.label}
                        onChange={(event) =>
                          setRecipe({
                            food: provisionalFood(event.target.value),
                            draft: nutritionDraft(
                              provisionalFood(event.target.value),
                              [],
                              "1 serving",
                            ),
                          })
                        }
                      />
                    </label>
                    <VoiceNutritionReview
                      food={recipe.food}
                      draft={recipe.draft}
                      onChange={(draft) => setRecipe({ ...recipe, draft })}
                    />
                    <FoodReview
                      food={recipe.food}
                      label={recipe.food.label}
                      onChange={(food) =>
                        setRecipe({
                          ...recipe,
                          food,
                          draft: {
                            ...recipe.draft,
                            recipe_edited: true,
                            reference_confirmed: false,
                            accept_incomplete: false,
                          },
                        })
                      }
                      onResolved={(food, draft) => setRecipe({ food, draft })}
                      onBusy={(delta) => setRecipeBusy((value) => value + delta)}
                    />
                  </>
                ) : (
                  <>
                    {selected.food ? (
                      <label className="grid gap-1 text-sm font-semibold">
                        Serving
                        <select
                          disabled={servingLoading || !selected.food.servings.length}
                          className={controlClass}
                          value={serving?.id ?? ""}
                          onChange={(event) =>
                            setServing(
                              selected.food.servings.find(
                                (item) => item.id === event.target.value,
                              ) ?? null,
                            )
                          }
                        >
                          {servingLoading ? <option value="">Loading servings…</option> : null}
                          {selected.food.servings.map((item) => (
                            <option value={item.id} key={item.id}>
                              {item.serving_name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label className="grid gap-1 text-sm font-semibold">
                        Serving
                        <select className={controlClass} value={selected.user.id} disabled>
                          <option value={selected.user.id}>{selected.user.serving_name}</option>
                        </select>
                      </label>
                    )}
                    {selected.food && !servingLoading && !selected.food.servings.length ? (
                      <InlineNotice>No serving options are available for this food.</InlineNotice>
                    ) : null}
                    <label className="grid gap-1 text-sm font-semibold">
                      Quantity
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        className={controlClass}
                        value={quantity}
                        onChange={(event) => setQuantity(Number(event.target.value))}
                      />
                    </label>
                  </>
                )}
                {!completing && (
                  <>
                    <label className="grid gap-1 text-sm font-semibold">
                      Consumed at
                      <input
                        type="datetime-local"
                        className={controlClass}
                        value={consumed}
                        onChange={(event) => setConsumed(event.target.value)}
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-semibold">
                      Meal type
                      <select
                        className={controlClass}
                        value={meal}
                        onChange={(event) => setMeal(event.target.value)}
                      >
                        <option value="">Not specified</option>
                        {["breakfast", "lunch", "dinner", "snack", "other"].map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-semibold">
                      Notes
                      <textarea
                        className={textareaClass}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                      />
                    </label>
                  </>
                )}
                {!recipe && preview ? (
                  <div className="rounded-xl border border-cat-food/25 bg-cat-food/10 p-4">
                    <p className="font-semibold">Nutrition preview</p>
                    <p className="mt-1 text-sm">
                      {format(preview.calories)} calories · {format(preview.protein_grams)} g
                      protein · {format(preview.carbohydrate_grams)} g carbohydrates ·{" "}
                      {format(preview.fat_grams)} g fat
                    </p>
                  </div>
                ) : null}
                <Button
                  disabled={
                    saving ||
                    servingLoading ||
                    recipeBusy > 0 ||
                    (!recipe && Boolean(selected.food) && !serving)
                  }
                >
                  {saving ? "Saving…" : "Log food"}
                </Button>
              </form>
            ) : null}
          </section>

          <section aria-labelledby="meals-heading">
            <h2 id="meals-heading" className="text-lg font-semibold">
              Today’s food
            </h2>
            {entries.length ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
                {groups.map((group) => (
                  <div key={group.key} className="border-b border-line last:border-b-0">
                    <div className="flex items-center justify-between gap-3 bg-ground/40 px-4 py-2.5 sm:px-5">
                      <h3 className="text-sm font-semibold capitalize text-fg-2">{group.label}</h3>
                      <span className="text-[13px] tabular-nums text-fg-3">
                        {format(group.calories)} kcal · {format(group.protein)} g protein
                      </span>
                    </div>
                    <ul className="divide-y divide-line">
                      {group.entries.map((entry) => (
                        <li key={entry.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{entry.title}</p>
                            <p className="text-[13px] text-fg-3">
                              {new Date(entry.consumed_at).toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </p>
                            <p
                              className={`mt-1 text-sm tabular-nums ${entry.nutrition_status === "incomplete" ? "text-amber-200" : "text-fg-2"}`}
                            >
                              {entry.nutrition_status === "incomplete"
                                ? `Macros unavailable${entry.stated_amount ? ` · ${entry.stated_amount}` : ""}`
                                : `${format(sumNutrition(entry.items).calories)} calories · ${format(sumNutrition(entry.items).protein_grams)} g protein`}
                            </p>
                            {entry.items.length > 1 && (
                              <details className="mt-1">
                                <summary className="min-h-11 cursor-pointer py-2 text-sm text-fg-2">
                                  Components ({entry.items.length})
                                </summary>
                                <ul className="space-y-1 pb-1 text-[13px] tabular-nums text-fg-3">
                                  {entry.items.map((item) => (
                                    <li key={item.id}>
                                      {item.source_name} · {format(item.quantity_multiplier)} ×{" "}
                                      {item.serving_name_snapshot} · {format(item.calories)} kcal
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}
                            {entry.nutrition_status === "incomplete" && (
                              <Button
                                variant="secondary"
                                className="mt-2"
                                onClick={() => {
                                  setCompleting(entry.id);
                                  setSelected(null);
                                  setSearch(entry.title ?? "");
                                  setQuantity(1);
                                }}
                              >
                                Complete nutrition
                              </Button>
                            )}
                          </div>
                          <Button
                            variant="tertiary"
                            className="text-fg-3 hover:text-rose-300"
                            aria-label={`Delete ${entry.title} food log`}
                            onClick={() => {
                              if (confirm(`Delete ${entry.title}?`))
                                void deleteEntry(createClient(), entry.id)
                                  .then(load)
                                  .catch(() =>
                                    setError("We couldn’t delete this food log. Please try again."),
                                  );
                            }}
                          >
                            Delete
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3">
                <EmptyState
                  title="No foods logged yet"
                  description="Log a food to begin building your nutrition history."
                />
              </div>
            )}
          </section>
        </div>
      </div>
    </PageContainer>
  );
}

const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack", "other"];
function mealGroups(entries: Entry[]) {
  const groups = new Map<string, Entry[]>();
  for (const entry of [...entries].sort((a, b) => a.consumed_at.localeCompare(b.consumed_at))) {
    const key =
      entry.meal_type && MEAL_ORDER.includes(entry.meal_type) ? entry.meal_type : "unspecified";
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => ((MEAL_ORDER.indexOf(a) + 99) % 99) - ((MEAL_ORDER.indexOf(b) + 99) % 99))
    .map(([key, own]) => {
      const sum = sumNutrition(own.flatMap((entry) => entry.items));
      return {
        key,
        label: key === "unspecified" ? "Other food" : key,
        entries: own,
        calories: sum.calories,
        protein: sum.protein_grams,
      };
    });
}

function CustomFood({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (food: UserFood) => void;
}) {
  const [name, setName] = useState("");
  const [serving, setServing] = useState("1 serving");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      onCreated(
        await createUserFood(createClient(), {
          name,
          brand_name: null,
          serving_name: serving,
          serving_quantity: 1,
          serving_unit: "serving",
          calories: calories ? Number(calories) : null,
          protein_grams: protein ? Number(protein) : null,
          carbohydrate_grams: carbs ? Number(carbs) : null,
          fat_grams: fat ? Number(fat) : null,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create food.");
    }
  }
  const fields = [
    ["Calories", calories, setCalories],
    ["Protein (g)", protein, setProtein],
    ["Carbohydrates (g)", carbs, setCarbs],
    ["Fat (g)", fat, setFat],
  ] as const;
  return (
    <form onSubmit={save} className="mt-4 grid gap-3 rounded-xl border bg-surface p-4">
      <h3 className="font-semibold">Create custom food</h3>
      <label className="grid gap-1 text-sm font-semibold">
        Name
        <input
          required
          className={controlClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        Serving name
        <input
          required
          className={controlClass}
          value={serving}
          onChange={(event) => setServing(event.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        {fields.map(([label, value, setter]) => (
          <label key={label} className="grid gap-1 text-sm font-semibold">
            {label}
            <input
              type="number"
              min="0"
              step="0.1"
              className={controlClass}
              value={value}
              onChange={(event) => setter(event.target.value)}
            />
          </label>
        ))}
      </div>
      {error ? <InlineNotice>{error}</InlineNotice> : null}
      <div className="flex gap-2">
        <Button>Create food</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
