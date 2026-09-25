import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { database } from "../security/test-database.ts";
import { examples, extracted } from "./voice-quantity.test.ts";
import { enrichFoodCandidates } from "./food-service.ts";
import { voiceNutritionRows } from "./ingestion.ts";
import { nutritionPreview } from "./voice-nutrition.ts";

test("spoken extraction through catalog enrichment and RPC snapshots equals manual logging for stored servings", async t => {
  const db = await database(); t.after(() => db.close());
  await db.exec("alter table public.health_events add column event_date date, add column event_time time, add column event_type text, add column dose text, add column dose_amount numeric, add column dose_unit text;");
  // Original health table DDL is absent from the repository; complete only the test baseline.
  for (const [name, type] of Object.entries({ amount: "text", description: "text", distance: "numeric", distance_unit: "text", duration: "text", duration_minutes: "numeric", exercise_type: "text", intensity: "text", notes: "text", severity: "numeric", supplement_name: "text", tags: "text[]" })) await db.exec(`alter table public.health_events add column if not exists ${name} ${type}`);
  const owner = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  // Read-only Supabase-shaped adapter over the actual migration-chain catalog.
  const client = { from(table: string) {
    const query = { select: () => query, eq: () => query, limit: async () => ({ data: (await db.query(`select * from public.${table}`)).rows, error: null }) };
    return query;
  } } as unknown as SupabaseClient;
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
  for (const [phrase, identity, quantity, unit, slug, multiplier] of examples) {
    const [candidate] = await enrichFoodCandidates(client, [extracted(phrase, `I ate ${phrase}.`)], new AbortController().signal);
    assert.equal(candidate.event.title, identity);
    assert.equal(candidate.nutrition?.quantity, quantity); assert.equal(candidate.nutrition?.unit, unit);
    const canonical = (await db.query<{ id: string }>("select id from foods where slug=$1", [slug])).rows[0];
    assert.ok(canonical, slug); assert.equal(candidate.event.food?.food_id, canonical.id);
    const preview = nutritionPreview(candidate.event.food, candidate.nutrition);
    if (multiplier === null) {
      assert.equal(preview, null); assert.throws(() => voiceNutritionRows([candidate], owner), /NUTRITION_REVIEW_REQUIRED/);
      candidate.nutrition!.accept_incomplete = true;
      assert.equal(voiceNutritionRows([candidate], owner)[0].nutrition?.status, "incomplete");
      continue;
    }
    assert.equal(preview?.multiplier, multiplier);
    const rows = voiceNutritionRows([candidate], owner), nutrition = rows[0].nutrition!;
    assert.equal(nutrition.stated_amount, `${quantity} ${unit}`);
    assert.equal(nutrition.serving_id, preview!.serving.id);
    assert.equal(nutrition.multiplier, multiplier);
    assert.equal("calories" in nutrition, false, "database owns macros");
    const manual = (await db.query<{ id: string }>("select log_food_atomic($1,$2,null,$3,$4,null,null,'manual') id", [canonical.id, preview!.serving.id, multiplier, nutrition.consumed_at])).rows[0].id;
    const request = crypto.randomUUID();
    await db.query("select ingest_voice_nutrition($1,$2::jsonb)", [request, JSON.stringify(rows)]);
    const snapshot = async (id: string) => (await db.query<{ calories: string }>("select food_id,food_serving_id,quantity_multiplier,calories,protein_grams,carbohydrate_grams,fat_grams from nutrition_entry_items where nutrition_entry_id=$1", [id])).rows[0];
    const voice = (await db.query<{ id: string }>("select id from nutrition_entries where source_type='voice' order by created_at desc limit 1")).rows[0].id;
    assert.deepEqual(await snapshot(voice), await snapshot(manual), phrase);
    assert.equal(Number((await snapshot(voice)).calories), preview!.nutrients.calories);
    const before = (await db.query("select id from nutrition_entries")).rows.length;
    await db.query("select ingest_voice_nutrition($1,$2::jsonb)", [request, JSON.stringify(rows)]);
    assert.equal((await db.query("select id from nutrition_entries")).rows.length, before, "retry does not duplicate");
  }
  const fragment = "I had two eggs, took 5 grams of creatine, and my knee hurts.";
  const mixed = await enrichFoodCandidates(client, [
    extracted("eggs", fragment, { food_quantity: 2, food_unit: "each" }),
    extracted("creatine", fragment, { event_type: "supplement", dose_amount: 5, dose_unit: "grams" }),
    extracted("knee hurts", fragment, { event_type: "symptom" }),
  ], new AbortController().signal);
  const rows = voiceNutritionRows(mixed, owner);
  assert.deepEqual(rows.map(row => row.kind), ["nutrition", "health", "health"]);
  assert.equal(rows[0].nutrition?.multiplier, 2);
  assert.equal(rows[1].event?.dose_amount, 5); assert.equal(rows[2].event?.event_type, "symptom");
  assert.equal(rows[1].event?.input_method, "voice");
  const request = crypto.randomUUID();
  await db.query("select ingest_voice_nutrition($1,$2::jsonb)", [request, JSON.stringify(rows)]);
  await db.query("select ingest_voice_nutrition($1,$2::jsonb)", [request, JSON.stringify(rows)]);
  assert.equal((await db.query("select id from health_events")).rows.length, 2);
  assert.equal((await db.query("select id from health_events where event_type='food'")).rows.length, 0);
  const latest = (await db.query<{ calories: string }>("select i.calories from nutrition_entry_items i join nutrition_entries e on e.id=i.nutrition_entry_id where e.source_type='voice' order by e.created_at desc limit 1")).rows[0];
  assert.equal(Number(latest.calories), 144);
});
