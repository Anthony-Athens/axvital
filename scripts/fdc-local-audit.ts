import {readFile,writeFile} from 'node:fs/promises';
import {database} from '../lib/security/test-database.ts';
import {reconcileCatalog} from '../lib/nutrition/fdc/reconcile.ts';
import {prepareFood,type PreparedFood} from '../lib/nutrition/fdc/import.ts';
import type {Serving} from '../lib/nutrition/nutrition.ts';
const args=process.argv.slice(2),arg=(name:string)=>args[args.indexOf(name)+1];
if(!args.includes('--output'))throw Error('Usage: fdc-local-audit.ts --output NEW_FILE [--input PREPARED_FILE]');
const db=await database();
try{
 const snapshot=async()=>{
  const foods=(await db.query('select id,name,slug,recipe_unit,source_reference,common_aliases from foods where is_active order by slug')).rows;
  const servings=(await db.query<Record<string,unknown>>('select * from food_servings')).rows.map(s=>({...s,...Object.fromEntries(['serving_quantity','grams_equivalent','calories','protein_grams','carbohydrate_grams','fat_grams','fiber_grams'].map(k=>[k,s[k]===null?null:Number(s[k])]))})) as Serving[];
  const components=(await db.query('select parent_food_id,component_food_id,quantity,unit from food_components')).rows;
  const aliases=(await db.query('select food_id,alias from food_aliases')).rows;
  return reconcileCatalog(foods as Parameters<typeof reconcileCatalog>[0],servings,components as Parameters<typeof reconcileCatalog>[2],aliases as Parameters<typeof reconcileCatalog>[3]);
 };
 const before=await snapshot(),results=[],comparisons=[];
 if(args.includes('--input')){
  const prepared=JSON.parse(await readFile(arg('--input'),'utf8')) as PreparedFood[];
  for(const item of prepared){
   const checked=prepareFood(item.selection,item.food);if(checked.digest!==item.digest)throw Error('FDC_PREPARED_DATA_CHANGED');
   const {selection,food}=item;
   const existing=(await db.query<{id:string;name:string}>('select id,name from foods where slug=$1',[selection.slug])).rows[0];
   if((selection.existingSlug&&!existing)||(existing&&!selection.existingSlug)||existing&&existing.name!==selection.name)throw Error('FDC_CANONICAL_CONFLICT');
   if(existing){const servings=(await db.query<Record<string,unknown>>('select serving_name,grams_equivalent,calories,protein_grams,carbohydrate_grams,fat_grams from food_servings where food_id=$1 and source_provider is null',[existing.id])).rows;
    comparisons.push({slug:selection.slug,fdcId:food.external_id,sourceDescription:food.description,action:servings.length?'Preserve curated servings; attach provenance only':'Add missing USDA servings',upstreamPer100g:food.basis,curated:servings.map(s=>({serving:s.serving_name,per100g:Number(s.grams_equivalent)>0?Object.fromEntries(['calories','protein_grams','carbohydrate_grams','fat_grams'].map(k=>[k,s[k]===null?null:Number(s[k])*100/Number(s.grams_equivalent)])):null}))});
   }
   await db.exec('set role service_role');
   try{const result=await db.query<{result:object}>('select import_fdc_food($1::jsonb,$2::uuid,false) as result',[JSON.stringify({...food,name:selection.name,slug:selection.slug,categories:selection.categories}),existing?.id??null]);results.push({slug:selection.slug,...result.rows[0].result});}
   catch(error){results.push({slug:selection.slug,error:error instanceof Error?error.message:'FDC_IMPORT_FAILED'});}
   finally{await db.exec('reset role');}
  }
 }
 const report={source:'Local PGlite repository migrations and reviewed USDA snapshot; no production changes',before,results,comparisons,after:await snapshot()};
 await writeFile(arg('--output'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({before:before.foods,after:report.after.foods,macros:report.after.foodsWithMacros,completeTemplates:report.after.completeTemplates,failures:results.filter(r=>'error'in r)}));
}finally{await db.close();}
