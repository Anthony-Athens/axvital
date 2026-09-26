import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasMacros, type MappedFood, type DataType } from "./mapping.ts";

export type ImportSelection = { slug:string; name:string; query:string; categories:string[]; existingSlug?:string; fdcId:number|null; expectedDescription:string|null; expectedDataType?:DataType; reviewed:boolean };
export type PreparedFood = { selection:ImportSelection; food:MappedFood; digest:string };
export function prepareFood(selection:ImportSelection,food:MappedFood):PreparedFood {
  if(!selection.reviewed || selection.fdcId!==food.external_id || selection.expectedDescription!==food.description || selection.expectedDataType!==food.data_type)throw Error("FDC_REVIEW_REQUIRED");
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(selection.slug) || selection.name.trim().length<2 || selection.name.length>160 || !Array.isArray(selection.categories) || selection.categories.length>12 || !selection.categories.every(c=>/^[a-z][a-z_-]+$/.test(c)))throw Error("FDC_INVALID_SELECTION");
  if(!hasMacros(food))throw Error("FDC_MISSING_MACROS");
  return {selection,food,digest:createHash("sha256").update(JSON.stringify({selection,food})).digest("hex")};
}
/** Only an operator service-role client can invoke the database import boundary. */
export async function importFoodDataCentralFood(client:SupabaseClient,prepared:PreparedFood,options:{refresh?:boolean;dryRun?:boolean}={}) {
  const verified=prepareFood(prepared.selection,prepared.food);
  if(verified.digest!==prepared.digest)throw Error("FDC_PREPARED_DATA_CHANGED");
  const {selection,food}=verified;
  const {data:existing,error}=await client.from("foods").select("id,name,slug").eq("slug",selection.existingSlug??selection.slug).maybeSingle();
  if(error)throw Error("FDC_CATALOG_UNAVAILABLE");
  if(selection.existingSlug && (!existing || existing.name!==selection.name || existing.slug!==selection.slug))throw Error("FDC_CANONICAL_CONFLICT");
  if(existing && !selection.existingSlug){
    const {data:source,error:sourceError}=await client.from("food_external_sources").select("food_id").eq("source_provider","usda_fdc").eq("external_id",food.external_id).maybeSingle();
    if(sourceError||source?.food_id!==existing.id)throw Error("FDC_CANONICAL_CONFLICT");
  }
  const payload={...food,name:selection.name,slug:selection.slug,categories:selection.categories};
  if(options.dryRun)return {food_id:existing?.id??null,status:"dry_run",payload};
  const {data,error:writeError}=await client.rpc("import_fdc_food",{payload,target_food_id:existing?.id??null,refresh:options.refresh??false});
  if(writeError){const known=["FDC_ID_CONFLICT","FDC_CANONICAL_CONFLICT","FDC_MISSING_MACROS","FDC_INVALID_PORTION","FDC_UNKNOWN_CATEGORY"].find(code=>writeError.message.includes(code));throw Error(known??"FDC_IMPORT_FAILED");}
  return data;
}
