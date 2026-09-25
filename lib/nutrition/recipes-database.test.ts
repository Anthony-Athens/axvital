import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { database } from "../security/test-database.ts";
import { loadFoodCatalog } from "./food-catalog.ts";
import { loadNutritionServings, enrichFoodCandidates } from "./food-service.ts";
import { resolveNutritionFood, nutritionDraft } from "./voice-nutrition.ts";
import { enrichRecipe, recipePreview } from "./recipes.ts";
import { voiceNutritionRows, logManualRecipe } from "./ingestion.ts";
import { foodCategories } from "./food-resolution.ts";
import { validateExtraction } from "../voice/schema.ts";

test("curated recipes are idempotent, resolve existing canonical foods and persist one private meal with authoritative component snapshots", async t => {
  const db=await database(); t.after(()=>db.close());
  const counts=async()=> (await db.query("select (select count(*) from foods) foods,(select count(*) from food_components) components,(select count(*) from food_servings) servings")).rows[0];
  const before=await counts();
  await db.exec(readFileSync(new URL("../../supabase/migrations/202609250003_curated_recipe_templates.sql",import.meta.url),"utf8"));
  assert.deepEqual(await counts(),before);
  assert.equal((await db.query("select id from foods where recipe_unit is not null")).rows.length,15);
  const client={from(table:string){const q={select:()=>q,eq:()=>q,limit:async()=>({data:(await db.query(`select * from ${table}`)).rows,error:null})};return q;},rpc:async(name:string,args:{request_id:string;rows:unknown})=>{await db.query(`select ${name}($1,$2::jsonb)`,[args.request_id,JSON.stringify(args.rows)]);return {error:null};}} as unknown as SupabaseClient;
  const [catalog,servings]=await Promise.all([loadFoodCatalog(client),loadNutritionServings(client)]);
  for(const label of ["Turkey Sandwich","Turkey Sandwich with mayo","Turkey Sandwich no cheese","Pepperoni Pizza","Cheeseburger","Cereal with Milk","Greek Yogurt with Berries"]) {
    const resolved=enrichRecipe(resolveNutritionFood(label,label,catalog,servings),servings);
    assert.ok(resolved.food_id,label); assert.ok(resolved.components.length);
    assert.equal(recipePreview(resolved,{...nutritionDraft(resolved,servings,`1 ${resolved.recipe_unit}`),recipe_confirmed:true}),null,"missing stored ingredient data stays incomplete");
  }
  assert.notEqual(resolveNutritionFood("Chicken Salad","",catalog,servings).food_id,resolveNutritionFood("Salad with Chicken","",catalog,servings).food_id,"chopped chicken salad and leafy salad are not aliases");
  const pizza=resolveNutritionFood("Pepperoni Pizza","Pepperoni Pizza no cheese",catalog,servings);
  assert.ok(!foodCategories(pizza).some(c=>c.slug==='dairy')); assert.ok(foodCategories(pizza).some(c=>c.slug==='processed_meat'));
  const fragment="I had one serving of eggs and toast.";
  const candidates=validateExtraction({events:[{event_type:"food",title:"eggs and toast",source_fragment:fragment,food_quantity:1,food_unit:"serving",amount:"one serving",dose_amount:null,dose_unit:null,duration_minutes:null,distance:null,distance_unit:null,intensity:null,severity:null,notes:null,time_expression:null}]},fragment,new Date("2026-09-25T12:00:00Z"),"UTC");
  const [candidate]=await enrichFoodCandidates(client,candidates,new AbortController().signal);
  candidate.nutrition!.recipe_confirmed=true;
  const preview=recipePreview(candidate.event.food,candidate.nutrition); assert.ok(preview); assert.equal(preview.items.length,2);
  const owner="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",other="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
  const voiceRows=voiceNutritionRows([candidate],owner),key=crypto.randomUUID();
  await client.rpc("ingest_voice_nutrition",{request_id:key,rows:voiceRows});
  await client.rpc("ingest_voice_nutrition",{request_id:key,rows:voiceRows});
  await logManualRecipe(client,candidate,owner,crypto.randomUUID());
  const entries=(await db.query<{id:string;source_type:string;entry_type:string}>("select id,source_type,entry_type from nutrition_entries order by source_type")).rows;
  assert.equal(entries.length,2); assert.ok(entries.every(e=>e.entry_type==='meal'));
  const snapshots=async(id:string)=>(await db.query("select food_id,food_serving_id,quantity_multiplier,calories,protein_grams,carbohydrate_grams,fat_grams from nutrition_entry_items where nutrition_entry_id=$1 order by food_id",[id])).rows;
  assert.deepEqual(await snapshots(entries[0].id),await snapshots(entries[1].id));
  assert.equal(Number((await db.query<{total:string}>("select sum(calories) total from nutrition_entry_items where nutrition_entry_id=$1",[entries[0].id])).rows[0].total),preview.nutrients.calories);
  assert.equal((await db.query("select id from health_events")).rows.length,0);
  assert.equal((await db.query("select id from health_event_food_components where quantity=2")).rows.length,4);
  const savedTemplate=(await db.query("select * from food_components order by parent_food_id,component_food_id")).rows;
  for(const mutate of [
    (rows:typeof voiceRows)=>{rows[0].nutrition!.recipe_confirmed=false;},
    (rows:typeof voiceRows)=>{rows[0].nutrition!.recipe!.pop();},
    (rows:typeof voiceRows)=>{rows[0].nutrition!.recipe![0].serving_id=rows[0].nutrition!.recipe![1].serving_id;},
    (rows:typeof voiceRows)=>{rows[0].food!.components[0].source="ai_inferred";rows[0].food!.components[0].confirmed=false;},
    (rows:typeof voiceRows)=>{rows[0].nutrition!.recipe![0].multiplier=-1;},
  ]) {
    const rows=structuredClone(voiceRows); mutate(rows);
    await assert.rejects(client.rpc("ingest_voice_nutrition",{request_id:crypto.randomUUID(),rows}) as unknown as Promise<unknown>);
    assert.equal((await db.query("select id from nutrition_entries")).rows.length,2,"failed recipe rolls back entry and receipt");
  }
  assert.deepEqual((await db.query("select * from food_components order by parent_food_id,component_food_id")).rows,savedTemplate);
  const exported=(await db.query<{payload:{data:Record<string,unknown[]>}}>("select axvital_export_account() payload")).rows[0].payload;
  assert.equal(exported.data.nutrition_entry_items.length,4); assert.equal(exported.data.health_event_food_components.length,4);
  await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
  for(const table of ['nutrition_entries','nutrition_entry_items','health_event_food_components','nutrition_food_category_exposures']) assert.equal((await db.query(`select * from ${table}`)).rows.length,0);
  await assert.rejects(db.exec("update food_components set quantity=100"),/permission denied/);
});
