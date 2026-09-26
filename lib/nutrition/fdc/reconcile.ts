import { servingMultiplier } from "../food-quantity.ts";
import { scaleNutrition, sumNutrition, type Serving } from "../nutrition.ts";
import { comparisonKey } from "../food-resolution.ts";

type CatalogFood={id:string;name:string;slug:string;recipe_unit:string|null;source_reference:string|null;common_aliases:string[]};
type Component={parent_food_id:string;component_food_id:string;quantity:number|null;unit:string|null};
export function reconcileCatalog(foods:CatalogFood[], servings:Serving[], components:Component[], aliases:{food_id:string;alias:string}[]){
 const active=servings.filter(s=>!s.source_retired);
 const macros=(s:Serving)=>[s.calories,s.protein_grams,s.carbohydrate_grams,s.fat_grams].every(v=>v!==null&&Number.isFinite(Number(v))&&Number(v)>=0);
 const usable=(s:Serving)=>macros(s)&&Number(s.serving_quantity)>0;
 const templates=foods.filter(f=>f.recipe_unit).map(f=>{
  const parts=components.filter(c=>c.parent_food_id===f.id).map(c=>{
   const food=foods.find(f=>f.id===c.component_food_id),options=active.filter(s=>s.food_id===c.component_food_id&&usable(s));
   const serving=options.find(s=>servingMultiplier(s,c.quantity===null?null:Number(c.quantity),c.unit)!==null);
   const multiplier=serving?servingMultiplier(serving,Number(c.quantity),c.unit):null;
   return {slug:food?.slug??null,quantity:c.quantity,unit:c.unit,canonical:!!food,macros:options.length>0,usable:!!serving,nutrients:serving&&multiplier!==null?scaleNutrition(serving,multiplier):null};
  });
  const complete=parts.length>0&&parts.every(p=>p.nutrients);
  return {slug:f.slug,total:parts.length,canonical:parts.filter(p=>p.canonical).length,withMacros:parts.filter(p=>p.macros).length,withServing:parts.filter(p=>p.usable).length,complete,nutrients:complete?sumNutrition(parts.map(p=>p.nutrients!)):null,components:parts};
 });
 const names=new Map<string,Set<string>>();
 for(const f of foods)for(const name of [f.name,...f.common_aliases,...aliases.filter(a=>a.food_id===f.id).map(a=>a.alias)]){const key=comparisonKey(name);const ids=names.get(key)??new Set<string>();ids.add(f.slug);names.set(key,ids);}
 const duplicateNames=[...names].filter(([,ids])=>ids.size>1).map(([name,ids])=>({name,foods:[...ids]}));
 const nearDuplicates: string[][]=[];
 for(let i=0;i<foods.length;i++)for(let j=i+1;j<foods.length;j++){
  const a=comparisonKey(foods[i].name).split(' '),b=comparisonKey(foods[j].name).split(' ');
  if(a.length>1&&b.length>1&&a.filter(t=>b.includes(t)).length/Math.max(a.length,b.length)>=0.67)nearDuplicates.push([foods[i].slug,foods[j].slug]);
 }
 return {foods:foods.length,foodsWithMacros:foods.filter(f=>active.some(s=>s.food_id===f.id&&usable(s))).length,foodsWithAnyServing:foods.filter(f=>active.some(s=>s.food_id===f.id)).length,servingUnits:[...new Set(active.map(s=>s.serving_unit))].sort(),completeTemplates:templates.filter(t=>t.complete).length,templates,missingMacros:foods.filter(f=>!active.some(s=>s.food_id===f.id&&usable(s))).map(f=>f.slug),missingServings:foods.filter(f=>!active.some(s=>s.food_id===f.id)).map(f=>f.slug),taxonomyWithoutNutrition:foods.filter(f=>f.source_reference==='axvital:component-library:v1'&&!active.some(s=>s.food_id===f.id&&usable(s))).map(f=>f.slug),duplicateNames,nearDuplicates};
}
