import test from "node:test";
import assert from "node:assert/strict";
import { foodCategories, foodPersistence, matchFood, provisionalFood, resolveFood, validateFoodResolution, type FoodCatalog } from "./food-resolution.ts";
import { resolveWithCatalog, enrichFoodCandidates } from "./food-service.ts";
import { ingestHealthEvents } from "../health-events/ingestion.ts";
import { reviewedInputs, type VoiceCandidate } from "../voice/schema.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const names = ["Pepperoni Pizza", "Pizza Crust", "Cheese", "Tomato Sauce", "Pepperoni", "Turkey Sandwich", "Bread", "Turkey", "Mayonnaise", "Lettuce", "Cheeseburger", "Beef Patty", "Greek Yogurt with Berries", "Greek Yogurt", "Berries", "Coca-Cola Zero Sugar", "Chicken Breast", "Grilled Chicken Breast"];
const category = (slug: string) => ({ id: slug, slug, name: slug });
const catalog: FoodCatalog = { foods: names.map((name, index) => ({ id: id(index), name, aliases: name === "Mayonnaise" ? ["mayo"] : name === "Coca-Cola Zero Sugar" ? ["coke zero", "coca cola zero", "coca-cola zero sugar"] : [], categories: ({ "Pizza Crust": ["grains"], Cheese: ["dairy"], "Tomato Sauce": ["vegetables"], Pepperoni: ["processed_meat"], Bread: ["grains"], Turkey: ["poultry"], Mayonnaise: ["condiments"], "Beef Patty": ["beef"], "Greek Yogurt": ["dairy"], Berries: ["fruits"] } as Record<string, string[]>)[name]?.map(category) ?? [] })), components: [[0,1],[0,2],[0,3],[0,4],[5,6],[5,7],[10,6],[10,11],[10,2],[12,13],[12,14]].map(([parent, child]) => ({ parent_food_id: id(parent), component_food_id: id(child), source: "library", confidence: null })) };

test("matching hierarchy preserves aliases, punctuation boundaries, ambiguity and preparation", () => {
  for (const [label, method, canonical] of [["Pepperoni Pizza", "exact", names[0]], ["coke zero", "alias", names[15]], ["coca cola zero", "alias", names[15]], ["coca-cola zero sugar", "alias", names[15]], ["  PEPPERONI-PIZZA  ", "normalized", names[0]], ["Pepperonni Pizza", "fuzzy", names[0]], ["Grilled Chicken Breast", "exact", names[17]], ["Chicken Breast", "exact", names[16]]] as const) {
    const result = matchFood(label, catalog); assert.equal(result.method, method); assert.equal(result.food?.name, canonical);
  }
  for (const label of ["Smoked Chicken Breast", "Peperoni", "Unlisted restaurant special"]) assert.equal(matchFood(label, catalog).food, null);
  const ambiguous = { ...catalog, foods: [...catalog.foods, { ...catalog.foods[0], id: id(99) }] };
  assert.equal(matchFood(names[0], ambiguous).ambiguous, true);
  const aliasCollision = { ...catalog, foods: [...catalog.foods, { ...catalog.foods[1], aliases: ["coke zero"] }] };
  assert.equal(matchFood("coke zero", aliasCollision).food, null);
});

test("composites retain library/explicit provenance, exclusions and many-to-many categories", () => {
  const pizza = resolveFood("Two slices of pepperoni pizza", "Two slices of pepperoni pizza without cheese", catalog);
  assert.equal(pizza.food_id, id(0)); assert.equal(pizza.components.length, 4);
  assert.equal(pizza.components.find(c => c.label === "Cheese")?.included, false);
  assert.equal(pizza.components.find(c => c.label === "Cheese")?.source, "explicit");
  assert.deepEqual(foodCategories(pizza).map(c => c.slug).sort(), ["grains", "processed_meat", "vegetables"]);
  const plain = resolveFood("turkey sandwich", "turkey sandwich", catalog);
  assert.deepEqual(plain.components.map(c => c.label), ["Bread", "Turkey"]);
  assert.ok(plain.components.every(c => c.source === "library" && !c.confirmed));
  const mayo = resolveFood("turkey sandwich with mayo", "turkey sandwich with mayo and lettuce", catalog);
  assert.deepEqual(mayo.components.map(c => c.source), ["library", "library", "explicit", "explicit"]);
  assert.equal(mayo.components.find(c => c.label === "Mayonnaise")?.food_id, id(8));
  assert.deepEqual(foodCategories(resolveFood("cheeseburger", "cheeseburger", catalog)).map(c => c.slug).sort(), ["beef", "dairy", "grains"]);
  assert.deepEqual(foodCategories(resolveFood("bread with cheese", "bread with cheese", catalog)).map(c => c.slug).sort(), ["dairy", "grains"]);
  const yogurt = resolveFood("Greek yogurt with berries", "Greek yogurt with berries", catalog);
  assert.equal(yogurt.components.length, 2); assert.deepEqual(yogurt.components.map(c => c.source), ["library", "explicit"]);
  assert.equal(resolveFood("turkey sandwich", "turkey sandwich with mayo and I took creatine", catalog).components.length, 3);
  const cycle = { ...catalog, components: [...catalog.components, { parent_food_id: id(1), component_food_id: id(0), source: "library" as const, confidence: null }] };
  assert.equal(resolveFood(names[0], names[0], cycle).components.length, 4);
});

test("AI is skipped for deterministic/ambiguous foods and optional failures remain provisional", async () => {
  let calls = 0;
  const infer = async () => { calls++; throw Error("provider unavailable"); };
  const signal = new AbortController().signal;
  await resolveWithCatalog("coke zero", "coke zero", catalog, signal, infer);
  await resolveWithCatalog(names[0], names[0], { ...catalog, foods: [...catalog.foods, catalog.foods[0]] }, signal, infer);
  await resolveWithCatalog("Two slices of pepperoni pizza", "Two slices of pepperoni pizza", { ...catalog, foods: [...catalog.foods, catalog.foods[0]] }, signal, infer);
  assert.equal(calls, 0);
  const result = await resolveWithCatalog("Unlisted stew", "Unlisted stew", catalog, signal, infer);
  assert.equal(calls, 1); assert.equal(result.label, "Unlisted stew"); assert.equal(result.method, "provisional");
});

test("voice enrichment loads catalog once, preserves non-food events and bounds optional AI work", async () => {
  const reads: string[] = [];
  const client = { from: (table: string) => {
    reads.push(table);
    const data = table === "foods" ? catalog.foods.map(food => ({ ...food, common_aliases: food.aliases })) : table === "food_components" ? catalog.components : [];
    const query = { select: () => query, eq: () => query, limit: async () => ({ data, error: null }) }; return query;
  } } as unknown as SupabaseClient;
  const events: VoiceCandidate[] = ["pepperoni pizza", "Unlisted a", "Unlisted b", "Unlisted c", "Unlisted d", "Walk"].map((title, i) => ({ event: { title, event_type: i === 5 ? "exercise" : "food", event_date: "2026-09-24", event_time: "12:00", tags: [] }, source_fragment: title, time_note: "Review", requires_review: true }));
  let calls = 0;
  const result = await enrichFoodCandidates(client, events, new AbortController().signal, async base => { calls++; return base; });
  assert.equal(result.length, events.length); assert.equal(calls, 3); assert.equal(reads.length, 5);
  assert.equal(result[0].event.food?.components.length, 4); assert.deepEqual(result[5], events[5]);
  assert.ok(result.every((item, index) => item.event.title === events[index].event.title && item.event.event_time === "12:00"));
  assert.equal(events[0].event.food, undefined, "draft inputs are not mutated");
});

test("mixed voice batches persist one primary food and components in one RPC; uncertainty is not retried", async () => {
  const food = resolveFood("pepperoni pizza", "pepperoni pizza without cheese", catalog);
  const events: VoiceCandidate[] = [{ event: { event_type: "food", title: "pepperoni pizza", food, amount: "2 slices", event_date: "2026-09-24", event_time: "12:00", tags: [] }, source_fragment: "2 slices of pepperoni pizza", time_note: "Review", requires_review: true }, { event: { event_type: "exercise", title: "Walk", event_date: "2026-09-24", event_time: "13:00", tags: [] }, source_fragment: "Walk", time_note: "Review", requires_review: true }];
  const inputs = reviewedInputs(events.map(c => c.event), "owner");
  const writes: { rows: { event: { input_method: string }; food: unknown }[] }[] = [];
  const client = { auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) }, rpc: async (name: string, args: typeof writes[number]) => { assert.equal(name, "ingest_health_events_with_food"); writes.push(args); return { error: { message: "private" } }; }, from: () => { throw Error("must not insert separately"); } } as unknown as SupabaseClient;
  await assert.rejects(ingestHealthEvents(client, inputs), /PERSISTENCE_FAILED/);
  assert.equal(writes.length, 1); assert.equal(writes[0].rows.length, 2);
  assert.ok(writes[0].rows.every(row => row.event.input_method === "voice"));
  assert.deepEqual(writes[0].rows[0].food, foodPersistence(food)); assert.equal(writes[0].rows[1].food, null);
  const unavailable = await enrichFoodCandidates(client, events, new AbortController().signal);
  assert.equal(unavailable[0].event.food?.method, "provisional"); assert.deepEqual(unavailable[1], events[1]);
});

test("invalid and duplicate component metadata is rejected before writes", () => {
  const food = resolveFood(names[0], names[0], catalog);
  assert.throws(() => validateFoodResolution({ ...food, components: [...food.components, food.components[0]] }), /INVALID_EVENT/);
  assert.throws(() => validateFoodResolution({ ...food, components: [{ ...food.components[0], confidence: 2 }] }), /INVALID_EVENT/);
  assert.equal(provisionalFood("Family recipe").food_id, null);
  const inferred = { ...food, components: food.components.map(c => ({ ...c, source: "ai_inferred" as const })) };
  assert.deepEqual(foodCategories(inferred), []);
});
