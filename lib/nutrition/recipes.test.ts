import test from "node:test";
import assert from "node:assert/strict";
import { matchFood, foodCategories, type FoodCatalog } from "./food-resolution.ts";
import { enrichRecipe, recipePreview } from "./recipes.ts";
import { nutritionDraft, nutritionPreview, resolveNutritionFood } from "./voice-nutrition.ts";
import { scaleNutrition, sumNutrition, searchFoods, type Serving } from "./nutrition.ts";
import { voiceNutritionRows } from "./ingestion.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const names = ["Turkey Sandwich", "Bread", "Turkey", "Mayonnaise", "Cheese", "Cereal with Milk", "Cereal", "Milk", "Greek Yogurt with Berries", "Greek Yogurt", "Berries", "Pepperoni Pizza", "Pepperoni", "Cheeseburger", "Beef Patty"];
const links = [[0,1],[0,2],[5,6],[5,7],[8,9],[8,10],[11,1],[11,4],[11,12],[13,1],[13,4],[13,14]];
const catalog: FoodCatalog = { foods: names.map((name,i) => ({ id:id(i), name, aliases: i===3 ? ["mayo"] : [], categories: [{id:`category-${i}`,name,slug:`category-${i}`}], recipe_unit: [0,13].includes(i)?"each":[5,8].includes(i)?"serving":i===11?"slice":null })), components: links.map(([p,c]) => ({parent_food_id:id(p),component_food_id:id(c),source:"library",confidence:null,quantity:c===1?2:1,unit:c===1?"slice":"oz"})) };
// Synthetic nutrient fixtures test arithmetic only; these are not catalog seed nutrition.
const servings: Serving[] = names.map((_,i) => ({id:id(i+100),food_id:id(i),serving_name:"Reference",serving_quantity:1,serving_unit:i===1?"slice":"oz",grams_equivalent:28.349523125,calories:100,protein_grams:10,carbohydrate_grams:5,fat_grams:3,is_default:true,display_order:0})).filter(s=>![0,5,8,11,13].includes(Number(s.food_id.slice(-12))));
function fixture(label="Turkey Sandwich", context=label) {
  const food=enrichRecipe(resolveNutritionFood(label,context,catalog,servings),servings);
  const draft={...nutritionDraft(food,servings,"1 each"),recipe_unit:food.recipe_unit,unit:food.recipe_unit!,recipe_confirmed:true};
  return {food,draft};
}
test("safe matching keeps food variants distinct and ambiguous aliases/plurals unresolved",()=>{
  assert.equal(matchFood("Turkey Sandwiches",catalog).food?.id,id(0));
  assert.equal(matchFood("Pepperoni Pizzas",catalog).food?.id,id(11));
  assert.equal(resolveNutritionFood("two slices of pepperoni pizza","",catalog,servings).food_id,id(11));
  assert.equal(matchFood("Turkkey Sandwich",catalog).method,"fuzzy");
  for(const name of ["Fried Turkey Sandwich","Whole Milk","Skim Milk","Flavored Greek Yogurt","Hamburger"]) assert.equal(matchFood(name,catalog).food,null);
  assert.equal(matchFood("mayo",{...catalog,foods:[...catalog.foods,{...catalog.foods[4],aliases:["mayo"]}]}).ambiguous,true);
  assert.equal(matchFood("Turkey Sandwiches",{...catalog,foods:[...catalog.foods,{...catalog.foods[0],id:id(99)}]}).ambiguous,true);
  assert.equal(searchFoods([{id:id(0),name:"Turkey Sandwich",common_aliases:[],brand_name:null,servings:[]}],[],"turkey sandwiches").global.length,1);
});
test("reference recipe quantities aggregate through existing serving conversion and stay event-local",()=>{
  const {food,draft}=fixture();
  assert.equal(recipePreview(food,{...draft,recipe_confirmed:false}),null);
  assert.equal(recipePreview(food,{...draft,unit:"cup"}),null,"food amounts cannot silently become a number of recipes");
  assert.equal(recipePreview(food,draft)?.nutrients.calories,300);
  food.components[1].nutrition!.quantity=56.69904625; food.components[1].nutrition!.unit="grams";
  assert.equal(recipePreview(food,draft)?.nutrients.calories,400);
  assert.equal(catalog.components[1].quantity,1,"event edits cannot mutate template");
  food.components[0].included=false;
  assert.equal(recipePreview(food,draft)?.nutrients.calories,200);
  assert.deepEqual(recipePreview(food,draft)?.nutrients,sumNutrition([scaleNutrition(servings.find(s=>s.food_id===id(2))!,2)]));
  assert.ok(!foodCategories(food).some(c=>c.id==='category-1'));
  food.components=food.components.filter(c=>c.included);
  assert.equal(recipePreview(food,{...draft,quantity:2})?.nutrients.calories,400);
});
test("explicit additions, exclusions, missing quantities and AI guesses cannot invent macros",()=>{
  const mayo=fixture("Turkey Sandwich with mayo");
  assert.equal(mayo.food.components.at(-1)?.source,"explicit"); assert.equal(recipePreview(mayo.food,mayo.draft),null);
  const measured=fixture("Turkey Sandwich with 1 oz mayo");
  assert.equal(recipePreview(measured.food,measured.draft)?.nutrients.calories,400);
  const excluded=fixture("Turkey Sandwich no cheese");
  assert.equal(excluded.food.components.at(-1)?.included,false); assert.equal(recipePreview(excluded.food,excluded.draft)?.nutrients.calories,300);
  const burger=fixture("Cheeseburger with no cheese");
  assert.equal(recipePreview(burger.food,burger.draft)?.nutrients.calories,300);
  for(const name of ["Pepperoni Pizza","Cereal with Milk","Greek Yogurt with Berries"]) {
    const {food,draft}=fixture(name); assert.ok(recipePreview(food,draft),name);
    food.components[0].nutrition!.serving_id=null; assert.equal(recipePreview(food,draft),null);
  }
  const unknown=fixture("burrito"); assert.equal(unknown.food.components.length,0); assert.equal(recipePreview(unknown.food,unknown.draft),null);
  const {food,draft}=fixture(); food.components[0].source="ai_inferred"; assert.equal(recipePreview(food,draft),null);
  food.components[0].confirmed=true; assert.ok(recipePreview(food,draft));
  food.components[0].nutrition!.servings[0]={...food.components[0].nutrition!.servings[0],calories:null}; assert.equal(recipePreview(food,draft),null);
});
test("trusted whole-food reference takes priority until user chooses component recipe; one payload carries all components",()=>{
  const {food,draft}=fixture();
  const reference={...servings[0],id:id(200),food_id:food.food_id!,serving_unit:"each",calories:500};
  const refDraft=nutritionDraft(food,[reference],"1 each");
  assert.equal(nutritionPreview(food,refDraft)?.nutrients.calories,500);
  assert.equal(nutritionPreview(food,{...refDraft,recipe_edited:true}),null);
  const rows=voiceNutritionRows([{event:{event_type:"food",title:food.label,food,event_date:"2026-09-25",event_time:"12:00"},nutrition:draft,source_fragment:"",time_note:"",requires_review:true}],"owner");
  assert.equal(rows.length,1); assert.equal(rows[0].nutrition?.recipe?.length,2);
  assert.equal("nutrients" in rows[0].nutrition!.recipe![0],false);
});
