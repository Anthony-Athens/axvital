import assert from "node:assert/strict";
import test from "node:test";
import { loadFoodServings, logFood, scaleNutrition, searchFoods, selectInitialServing, totalNutrition, type Entry, type Food, type Serving } from "./nutrition.ts";

test("decimal serving quantities scale without display noise", () => assert.deepEqual(
  scaleNutrition({calories:187,protein_grams:35,carbohydrate_grams:0,fat_grams:4},1.5),
  {calories:280.5,protein_grams:52.5,carbohydrate_grams:0,fat_grams:6,fiber_grams:null},
));
test("search matches names and aliases", () => {
  const food={id:"1",name:"Chicken Breast, Cooked",brand_name:null,common_aliases:["chicken breast"],servings:[]} as Food;
  assert.equal(searchFoods([food],[],"chicken").global[0]?.id,"1");
});
test("daily totals use immutable snapshot items", () => {
  const entries=[{items:[{calories:100,protein_grams:10,carbohydrate_grams:5,fat_grams:2},{calories:null,protein_grams:5,carbohydrate_grams:null,fat_grams:null}]}] as Entry[];
  assert.deepEqual(totalNutrition(entries),{calories:100,protein_grams:15,carbohydrate_grams:5,fat_grams:2});
});
const serving=(id:string,isDefault=false,order=0)=>({id,food_id:"food",serving_name:id,serving_quantity:1,serving_unit:"serving",grams_equivalent:null,calories:1,protein_grams:1,carbohydrate_grams:1,fat_grams:1,is_default:isDefault,display_order:order}) as Serving;
test("default serving is selected automatically",()=>assert.equal(selectInitialServing([serving("first"),serving("default",true)])?.id,"default"));
test("first serving is deterministic without a default",()=>assert.equal(selectInitialServing([serving("first"),serving("second")])?.id,"first"));
test("a valid persisted serving wins and a stale serving is cleared",()=>{assert.equal(selectInitialServing([serving("first"),serving("second")],"second")?.id,"second");assert.equal(selectInitialServing([serving("first")],"stale")?.id,"first")});
test("serving retrieval filters by the selected global food id and retains null nutrients",async()=>{let filtered="";const row={...serving("serving-id",true),calories:null};const query={select:()=>query,eq:(_column:string,value:string)=>{filtered=value;return query},order:()=>query,then:(resolve:(value:unknown)=>void)=>resolve({data:[row],error:null})};const result=await loadFoodServings({from:()=>query} as never,"global-food-id");assert.equal(filtered,"global-food-id");assert.equal(result[0]?.id,"serving-id");assert.equal(result[0]?.calories,null)});
test("serving failures preserve recovery guidance without logging provider details",async(t)=>{
  const logging=t.mock.method(console,"error",()=>{});
  const query={select:()=>query,eq:()=>query,order:()=>query,then:(resolve:(value:unknown)=>void)=>resolve({data:null,error:{code:"42501",details:"private row contents",message:"denied"}})};
  await assert.rejects(()=>loadFoodServings({from:()=>query} as never,"food-id"),/could not be loaded/);
  assert.equal(logging.mock.callCount(),0);
});

test("food logging failures do not expose provider details or record identifiers",async(t)=>{
  const logging=t.mock.method(console,"error",()=>{});
  const args={foodId:"private-food-id",servingId:"private-serving-id",quantity:1,consumedAt:"2026-08-27T12:00:00Z"};
  for(const message of ["constraint failure", "Food not found"]){
    const client={rpc:async()=>({data:null,error:{message,details:"private row contents"}})};
    await assert.rejects(()=>logFood(client as never,args),message==="Food not found"?/no longer available/:/Check the serving/);
  }
  assert.equal(logging.mock.callCount(),0);
});
