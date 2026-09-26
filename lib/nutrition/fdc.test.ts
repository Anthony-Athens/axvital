import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFoodDataCentralClient} from './fdc/client.ts';
import {mapFoodDataCentral,hasMacros} from './fdc/mapping.ts';
import {prepareFood,importFoodDataCentralFood,type PreparedFood} from './fdc/import.ts';
import {database} from '../security/test-database.ts';
import type {SupabaseClient} from '@supabase/supabase-js';
import {loadFoodCatalog} from './food-catalog.ts';
import {loadNutritionServings,enrichFoodCandidates} from './food-service.ts';
import {loadNutrition,searchFoods,scaleNutrition} from './nutrition.ts';
import {resolveNutritionFood,nutritionDraft,nutritionPreview} from './voice-nutrition.ts';
import {enrichRecipe,recipePreview} from './recipes.ts';
import {voiceNutritionRows,logManualRecipe} from './ingestion.ts';
import {validateExtraction} from '../voice/schema.ts';

const fixture=(description='Bread, white')=>({fdcId:123,dataType:'Survey (FNDDS)',description,publicationDate:'2024-10-31',foodCategory:{description:'Bread'},foodNutrients:[[1008,250,'kcal'],[1003,10,'g'],[1004,5,'g'],[1005,40,'g'],[1079,3,'g'],[1093,400,'mg'],[2000,4,'g']].map(([id,amount,unitName])=>({nutrient:{id,unitName},amount})),foodPortions:[{id:5,gramWeight:28,portionDescription:'1 medium or regular slice',measureUnit:{name:'undetermined'}}]});
test('USDA mapping uses per-100g data, supported units and shared scaling; missing never becomes zero',()=>{
 const mapped=mapFoodDataCentral(fixture());assert.equal(mapped.basis.calories,250);assert.equal(mapped.basis.sodium_mg,400);assert.equal(mapped.basis.caffeine_mg,null);assert.equal(mapped.source_updated_at,'2024-10-31T00:00:00.000Z');assert.equal(mapped.servings[1].calories,70);assert.equal(mapped.servings[1].serving_unit,'slice');
 const raw=fixture();raw.foodNutrients=raw.foodNutrients.filter(n=>n.nutrient.id!==1003);assert.equal(hasMacros(mapFoodDataCentral(raw)),false);
 const empty=mapFoodDataCentral({...fixture(),foodPortions:[]});assert.equal(empty.servings.length,1);
 assert.throws(()=>mapFoodDataCentral({...fixture(),dataType:'Branded'}));
 assert.throws(()=>mapFoodDataCentral({...fixture(),foodNutrients:[...fixture().foodNutrients,fixture().foodNutrients[0]]}),/DUPLICATE_NUTRIENT/);
 assert.throws(()=>mapFoodDataCentral({...fixture(),foodNutrients:[{nutrient:{id:1008,unitName:'g'},amount:5}]}),/UNIT/);
 const energy=fixture();energy.foodNutrients.push({nutrient:{id:2048,unitName:'kcal'},amount:260});assert.equal(mapFoodDataCentral(energy).basis.calories,260);
 assert.ok(Math.abs(mapFoodDataCentral({...fixture(),foodNutrients:[{nutrient:{id:1062,unitName:'kJ'},amount:418.4}]}).basis.calories!-100)<1e-9);
 const bad=mapFoodDataCentral({...fixture(),foodPortions:[{id:1,gramWeight:12,portionDescription:'1 slice, snack-size'},{id:2,gramWeight:40,portionDescription:'a handful'},{id:3,gramWeight:-1,amount:1,measureUnit:{name:'cup'}}]});assert.equal(bad.servings.length,1);assert.equal(bad.omitted_portions,3);
});
test('bounded USDA client caches requests, prefers generic data, and sanitizes failures',async()=>{
 let calls=0;const requests:{url:string;body:unknown}[]=[];
 const api=createFoodDataCentralClient({apiKey:'private-test-key',fetch:async(url,init)=>{calls++;requests.push({url:String(url),body:init?.body?JSON.parse(String(init.body)):null});return Response.json(String(url).includes('foods/search')?{foods:[null,{fdcId:1,description:'Bread',dataType:'Foundation',foodNutrients:[]},{fdcId:2,description:'Brand',dataType:'Branded'}]}:fixture());}});
 const search=await api.searchFoodDataCentral('bread');assert.equal(search.length,1);assert.deepEqual((requests[0].body as {dataType:string[]}).dataType,['Foundation','Survey (FNDDS)','SR Legacy']);await api.searchFoodDataCentral('bread');assert.equal(calls,1);
 await Promise.all([api.food(123),api.food(123)]);assert.equal(calls,2);assert.equal(requests[1].body,null);
 await assert.rejects(api.searchFoodDataCentral('a\nb'),/INVALID_QUERY/);await assert.rejects(api.food(-1),/INVALID_ID/);
 assert.throws(()=>createFoodDataCentralClient({apiKey:''}),/NOT_CONFIGURED/);
 for(const status of [429,500,404]){const failed=createFoodDataCentralClient({apiKey:'private-test-key',fetch:async()=>new Response('secret provider details',{status})});await assert.rejects(failed.food(123),/^Error: FDC_(RATE_LIMITED|UNAVAILABLE|NOT_FOUND)$/);}
 const timeout=createFoodDataCentralClient({apiKey:'private-test-key',fetch:async()=>{throw Error('URL private-test-key timed out');}});await assert.rejects(timeout.food(123),/^Error: FDC_UNAVAILABLE$/);
 const malformed=createFoodDataCentralClient({apiKey:'key',fetch:async()=>Response.json({foods:'bad'})});await assert.rejects(malformed.searchFoodDataCentral('bread'),/INVALID_RESPONSE/);
 let rateCalls=0;const rate=createFoodDataCentralClient({apiKey:'key',fetch:async()=>{rateCalls++;return new Response('',{status:429});}});await assert.rejects(rate.food(123));await assert.rejects(rate.food(124));assert.equal(rateCalls,1);
 const empty=createFoodDataCentralClient({apiKey:'key',hourlyBudget:1,fetch:async()=>Response.json({foods:[]})});assert.deepEqual(await empty.searchFoodDataCentral('unknown'),[]);await assert.rejects(empty.searchFoodDataCentral('another'),/RATE_LIMITED/);
});

const prepared=JSON.parse(readFileSync(new URL('../../data/fdc-prepared.json',import.meta.url),'utf8')) as PreparedFood[];
test('reviewed offline USDA snapshot retains integrity and representative portion math',()=>{
 const sources=JSON.parse(readFileSync(new URL('../../data/fdc-source-records.json',import.meta.url),'utf8')) as {fdcId:number}[];
 assert.ok(prepared.length>=50&&prepared.length<=150);assert.equal(new Set(prepared.map(p=>p.food.external_id)).size,prepared.length);
 for(const item of prepared){assert.equal(prepareFood(item.selection,item.food).digest,item.digest);assert.ok(hasMacros(item.food));assert.deepEqual(mapFoodDataCentral(sources.find(s=>s.fdcId===item.food.external_id)),item.food);}
 for(const slug of ['egg','chicken-breast-cooked','bread','milk','white-rice-cooked','greek-yogurt','mayonnaise','pepperoni']){
  const food=prepared.find(p=>p.selection.slug===slug)!.food;
  for(const s of food.servings){assert.deepEqual(scaleNutrition(s,2),scaleNutrition(food.basis,s.grams_equivalent/50),slug);}
 }
 const p=structuredClone(prepared[0]);p.selection.reviewed=false;assert.throws(()=>prepareFood(p.selection,p.food),/REVIEW_REQUIRED/);
});

test('service-only import preserves catalog identities, curated servings, snapshots and recipe relationships; all templates and voice/manual share local data',async t=>{
 const db=await database();t.after(()=>db.close());
 await db.exec(readFileSync(new URL('../../supabase/migrations/202609260001_fooddata_central.sql',import.meta.url),'utf8'));
 const rows=async(table:string)=>(await db.query<{row:Record<string,unknown>}>(`select to_jsonb(t) row from ${table} t`)).rows.map(r=>r.row);
 const beforeFoods=await rows('foods'),beforeServings=await rows('food_servings'),beforeAliases=await rows('food_aliases'),beforeComponents=await rows('food_components'),beforeTaxonomy=await rows('food_category_map');
 const client={auth:{getUser:async()=>({data:{user:{id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'}},error:null})},from(table:string){const filters:{key:string;value:unknown}[]=[];const execute=async()=>({data:(await rows(table)).filter(r=>filters.every(f=>r[f.key]===f.value)),error:null});const q={select:()=>q,eq:(key:string,value:unknown)=>{filters.push({key,value});return q;},limit:execute,maybeSingle:async()=>{const r=await execute();return {data:r.data[0]??null,error:null};}};return q;},rpc:async(name:string,args:Record<string,unknown>)=>{try{const result=name==='import_fdc_food'?await db.query('select import_fdc_food($1::jsonb,$2::uuid,$3) result',[JSON.stringify(args.payload),args.target_food_id,args.refresh]):await db.query(`select ${name}($1,$2::jsonb) result`,[args.request_id,JSON.stringify(args.rows)]);return {data:(result.rows[0] as {result:unknown}).result,error:null};}catch(error){return {data:null,error:{message:(error as Error).message}};}}} as unknown as SupabaseClient;
 await db.exec('set role authenticated');await assert.rejects(db.query('select import_fdc_food($1::jsonb)',[JSON.stringify({})]),/permission denied/);await assert.rejects(db.exec("insert into food_external_sources(source_provider,external_id,food_id,external_data_type,source_description,per_100g,content_hash) values('usda_fdc',1,gen_random_uuid(),'Foundation','bad','{}','x')"),/permission denied/);await db.exec('reset role; set role service_role');
 const imported=[];
 for(const item of prepared)imported.push(await importFoodDataCentralFood(client,item));
 for(const item of prepared)assert.equal((await importFoodDataCentralFood(client,item) as {status:string}).status,'unchanged');
 const changed=structuredClone(prepared[0]);changed.food.basis.calories=1;await assert.rejects(importFoodDataCentralFood(client,changed),/DATA_CHANGED/);
 await db.exec('reset role');
 assert.equal((await rows('food_external_sources')).length,prepared.length);
 for(const f of beforeFoods)assert.deepEqual((await rows('foods')).find(r=>r.id===f.id),f);
 for(const s of beforeServings)assert.deepEqual((await rows('food_servings')).find(r=>r.id===s.id),s);
 assert.deepEqual(await rows('food_aliases'),beforeAliases);assert.deepEqual(await rows('food_components'),beforeComponents);
 for(const link of beforeTaxonomy)assert.ok((await rows('food_category_map')).some(r=>r.food_id===link.food_id&&r.category_id===link.category_id));
 const [catalog,servings]=await Promise.all([loadFoodCatalog(client),loadNutritionServings(client)]);
 let complete=0;for(const f of catalog.foods.filter(f=>f.recipe_unit)){const resolved=enrichRecipe(resolveNutritionFood(f.name,'',catalog,servings),servings);const preview=recipePreview(resolved,{...nutritionDraft(resolved,servings,`1 ${f.recipe_unit}`),recipe_confirmed:true});if(preview){complete++;assert.ok(preview.nutrients.calories!>0);}else assert.match(f.name,/pizza/i);}
 assert.equal(complete,13);
 const egg=resolveNutritionFood('three eggs','three eggs',catalog,servings),draft=nutritionDraft(egg,servings,null,'three eggs');assert.equal(draft.quantity,3);assert.equal(draft.unit,'each');assert.ok(nutritionPreview(egg,draft));
 for(const label of ['grilled chicken and rice','cereal with milk']){
  const food=enrichRecipe(resolveNutritionFood(label,label,catalog,servings),servings);
  assert.ok(recipePreview(food,{...nutritionDraft(food,servings,`1 ${food.recipe_unit}`),recipe_confirmed:true}),label);
 }
 let yogurt=resolveNutritionFood('Greek yogurt with blueberries','Greek yogurt with blueberries',catalog,servings);
 assert.equal(yogurt.components.length,2);assert.ok(yogurt.components.every(c=>c.food_id&&servings.some(s=>s.food_id===c.food_id)));
 const yogurtDraft={...nutritionDraft(yogurt,servings),quantity:1,unit:'serving',recipe_unit:'serving',recipe_confirmed:true};
 assert.equal(recipePreview(yogurt,yogurtDraft),null,'unspecified component amounts still require review');
 yogurt={...yogurt,components:yogurt.components.map(c=>({...c,nutrition:{servings:[],serving_id:null,quantity:/blueberries/i.test(c.label)?0.5:1,unit:'cup'}}))};
 yogurt=enrichRecipe(yogurt,servings);assert.ok(recipePreview(yogurt,yogurtDraft));
 // Snapshot one imported recipe through BOTH existing ingestion paths, without an external client.
 const fragment='I had a turkey sandwich with mayo.';
 const extracted=validateExtraction({events:[{event_type:'food',title:'turkey sandwich with mayo',source_fragment:fragment,food_quantity:1,food_unit:null,amount:null,dose_amount:null,dose_unit:null,duration_minutes:null,distance:null,distance_unit:null,intensity:null,severity:null,notes:null,time_expression:null}]},fragment,new Date('2026-09-26T12:00:00Z'),'UTC');
 const [candidate]=await enrichFoodCandidates(client,extracted,new AbortController().signal);candidate.nutrition!.recipe_confirmed=true;
 // Explicit additions require the existing user quantity review.
 const mayo=candidate.event.food!.components.find(c=>/mayo/i.test(c.label));if(mayo){mayo.nutrition={...mayo.nutrition!,quantity:1,unit:'tbsp'};candidate.event.food=enrichRecipe(candidate.event.food!,servings);}
 assert.ok(recipePreview(candidate.event.food,candidate.nutrition));
 const owner='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false)`);
 const voice=await client.rpc('ingest_voice_nutrition',{request_id:crypto.randomUUID(),rows:voiceNutritionRows([candidate],owner)});assert.equal(voice.error,null);await logManualRecipe(client,candidate,owner,crypto.randomUUID());
 const snapshots=await rows('nutrition_entry_items');assert.ok(snapshots.length>=4);const entries=await rows('nutrition_entries');assert.equal(entries.length,2);
 const totals=entries.map(e=>snapshots.filter(s=>s.nutrition_entry_id===e.id).reduce((n,s)=>n+Number(s.calories),0));assert.equal(totals[0],totals[1]);
 await db.exec('reset role;set role service_role');
 const bread=prepared.find(p=>p.selection.slug==='bread')!,payload={...bread.food,name:bread.selection.name,slug:bread.selection.slug,categories:bread.selection.categories};const id=(await rows('foods')).find(f=>f.slug==='bread')!.id;
 await assert.rejects(db.query('select import_fdc_food($1::jsonb,$2::uuid,true)',[JSON.stringify({...payload,servings:[{...payload.servings[0],calories:999}]}),id]),/INVALID_PORTION/);
 const conflict=(await rows('foods')).find(f=>f.slug==='egg')!.id;await assert.rejects(db.query('select import_fdc_food($1::jsonb,$2::uuid,true)',[JSON.stringify(payload),conflict]),/ID_CONFLICT/);
 const slice=payload.servings.find(s=>s.serving_unit==='slice')!,oldSlice=(await rows('food_servings')).find(s=>s.food_id===id&&s.source_portion_key===slice.key)!;
 await db.query('select import_fdc_food($1::jsonb,$2::uuid,true)',[JSON.stringify({...payload,servings:[payload.servings[0]]}),id]);
 assert.equal((await rows('food_servings')).find(s=>s.id===oldSlice.id)!.source_retired,true);
 await importFoodDataCentralFood(client,bread,{refresh:true});assert.equal((await rows('food_servings')).find(s=>s.id===oldSlice.id)!.source_retired,false);
 await db.exec('reset role');assert.deepEqual(await rows('nutrition_entry_items'),snapshots);
 // Manual loader includes enriched taxonomy foods while leaving incomplete taxonomy-only records hidden.
 const manualFoods=(await rows('foods')).map(f=>({...f,external_sources:prepared.some(p=>p.selection.slug===f.slug)?[{external_id:1}]:[]}));
 const manual={auth:{getUser:async()=>({data:{user:{id:owner}}})},from(table:string){const result={data:table==='foods'?manualFoods:[],error:null};const q={select:()=>q,eq:()=>q,is:()=>q,gte:()=>q,lt:()=>q,order:()=>q,limit:async()=>result,then:(resolve:(x:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};return q;}} as unknown as SupabaseClient;
 const loaded=await loadNutrition(manual);assert.ok(searchFoods(loaded.foods,[],'mayonnaise').global.length);assert.ok(!loaded.foods.some(f=>f.name==='Pizza Crust'));
});
