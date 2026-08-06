import type { SupabaseClient } from "@supabase/supabase-js";

export type Nutrients = { calories:number|null; protein_grams:number|null; carbohydrate_grams:number|null; fat_grams:number|null; fiber_grams?:number|null };
export type Serving = Nutrients & { id:string; food_id:string; serving_name:string; serving_quantity:number; serving_unit:string; grams_equivalent:number|null; is_default:boolean; display_order:number };
export type Food = { id:string; name:string; brand_name:string|null; common_aliases:string[]; servings:Serving[] };
export type UserFood = Nutrients & { id:string; name:string; brand_name:string|null; serving_name:string; serving_quantity:number; serving_unit:string; last_logged_at:string|null };
export type Entry = { id:string; title:string|null; consumed_at:string; meal_type:string|null; notes:string|null; items:Array<Nutrients & { id:string; source_name:string; serving_name_snapshot:string; serving_quantity_snapshot:number; serving_unit_snapshot:string; quantity_multiplier:number }> };

async function userId(client:SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Please log in to manage nutrition.");
  return data.user.id;
}
export function scaleNutrition(n:Nutrients, quantity:number):Nutrients {
  return { calories:n.calories==null?null:n.calories*quantity, protein_grams:n.protein_grams==null?null:n.protein_grams*quantity, carbohydrate_grams:n.carbohydrate_grams==null?null:n.carbohydrate_grams*quantity, fat_grams:n.fat_grams==null?null:n.fat_grams*quantity, fiber_grams:n.fiber_grams==null?null:n.fiber_grams*quantity };
}
export function totalNutrition(entries:Entry[]) {
  return entries.flatMap((entry)=>entry.items).reduce((total,item)=>({ calories:(total.calories??0)+(item.calories??0), protein_grams:(total.protein_grams??0)+(item.protein_grams??0), carbohydrate_grams:(total.carbohydrate_grams??0)+(item.carbohydrate_grams??0), fat_grams:(total.fat_grams??0)+(item.fat_grams??0) }),{calories:0,protein_grams:0,carbohydrate_grams:0,fat_grams:0} as Nutrients);
}
export function searchFoods(globalFoods:Food[], userFoods:UserFood[], query:string) {
  const search=query.trim().toLowerCase();
  return { global:globalFoods.filter((food)=>!search||[food.name,food.brand_name,...food.common_aliases].filter(Boolean).some((value)=>value!.toLowerCase().includes(search))), user:userFoods.filter((food)=>!search||[food.name,food.brand_name].filter(Boolean).some((value)=>value!.toLowerCase().includes(search))) };
}
export function selectInitialServing(servings:Serving[], persistedId?:string|null) {
  return servings.find((item)=>item.id===persistedId) ?? servings.find((item)=>item.is_default) ?? servings[0] ?? null;
}
export async function loadFoodServings(client:SupabaseClient, foodId:string):Promise<Serving[]> {
  if (!foodId) return [];
  const { data, error } = await client.from("food_servings").select("*").eq("food_id",foodId).order("is_default",{ascending:false}).order("display_order",{ascending:true});
  if (error) {
    console.error("nutrition.servings.load_failed",{foodId,code:error.code,constraint:error.details});
    throw new Error("Serving options could not be loaded. Try selecting the food again.");
  }
  return (data??[]) as Serving[];
}
export async function loadNutrition(client:SupabaseClient) {
  const user=await userId(client), start=new Date(); start.setHours(0,0,0,0); const end=new Date(start); end.setDate(end.getDate()+1);
  const [foods,userFoods,entries]=await Promise.all([
    client.from("foods").select("id,name,brand_name,common_aliases").eq("is_active",true).order("name"),
    client.from("user_foods").select("*").eq("user_id",user).eq("is_active",true).is("archived_at",null).order("last_logged_at",{ascending:false}),
    client.from("nutrition_entries").select("id,title,consumed_at,meal_type,notes,items:nutrition_entry_items(*)").eq("user_id",user).is("deleted_at",null).gte("consumed_at",start.toISOString()).lt("consumed_at",end.toISOString()).order("consumed_at",{ascending:false}),
  ]);
  if (foods.error||userFoods.error||entries.error) throw new Error("We couldn’t load nutrition data.");
  return { foods:(foods.data??[]).map((food)=>({...food,servings:[]})) as Food[], userFoods:(userFoods.data??[]) as UserFood[], entries:(entries.data??[]) as unknown as Entry[] };
}
export async function logFood(client:SupabaseClient,args:{foodId?:string;servingId?:string;userFoodId?:string;quantity:number;consumedAt:string;mealType?:string;notes?:string}) {
  if (!Number.isFinite(args.quantity)||args.quantity<=0) throw new Error("Quantity must be greater than zero.");
  if (args.foodId && !args.servingId) throw new Error("Select a serving before logging this food.");
  if ((args.foodId?1:0)+(args.userFoodId?1:0)!==1) throw new Error("Select one food to log.");
  const { data,error }=await client.rpc("log_food_atomic",{selected_food_id:args.foodId??null,selected_serving_id:args.servingId??null,selected_user_food_id:args.userFoodId??null,quantity:args.quantity,consumed:args.consumedAt,meal:args.mealType||null,note:args.notes||null,entry_source:"manual"});
  if(error){console.error("nutrition.food.log_failed",{sourceType:args.foodId?"global":"user",foodId:args.foodId,userFoodId:args.userFoodId,servingId:args.servingId,code:error.code,constraint:error.details});if(error.message.includes("Food not found"))throw new Error("That food or serving is no longer available. Select it again.");throw new Error("We couldn’t save this food. Check the serving and try again.");} return data as string;
}
export async function createUserFood(client:SupabaseClient,input:Omit<UserFood,"id"|"last_logged_at">){const user=await userId(client);if(input.name.trim().length<2||input.serving_quantity<=0||Object.values(input).filter((value)=>typeof value==="number").some((value)=>value<0))throw new Error("Enter a valid food, serving, and nutrition value.");const{data,error}=await client.from("user_foods").insert({...input,user_id:user}).select().single();if(error)throw new Error("We couldn’t create this custom food.");return data as UserFood;}
export async function updateEntry(client:SupabaseClient,id:string,changes:{consumed_at?:string;meal_type?:string|null;notes?:string|null}){const user=await userId(client);const{error}=await client.from("nutrition_entries").update(changes).eq("id",id).eq("user_id",user);if(error)throw new Error("We couldn’t update this food log.");}
export async function deleteEntry(client:SupabaseClient,id:string){const user=await userId(client);const{error}=await client.from("nutrition_entries").update({deleted_at:new Date().toISOString()}).eq("id",id).eq("user_id",user);if(error)throw new Error("We couldn’t delete this food log.");}
