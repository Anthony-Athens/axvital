import type { SupabaseClient } from '@supabase/supabase-js';
import { assessDiet, type Bundle, type Catalog, type Assessment } from './model.ts';
export async function dietCatalog(client:SupabaseClient):Promise<Catalog>{
 const responses=await Promise.all([client.from('foods').select('id,name,common_aliases,category_id,source_type,is_verified,recipe_unit').eq('is_active',true).order('name').limit(5001),client.from('food_categories').select('id,name,slug').eq('is_active',true).order('name').limit(501),client.from('food_category_map').select('food_id,category_id').limit(10001),client.from('food_components').select('parent_food_id,component_food_id,source').limit(5001)]);
 if(responses.some((r,i)=>r.error||!r.data||r.data.length>=[5001,501,10001,5001][i]))throw Error('CATALOG_UNAVAILABLE');
 return {foods:responses[0].data!,categories:responses[1].data!,maps:responses[2].data!,library:responses[3].data!} as Catalog;
}
/** Stable future adapter boundary. Current source reads, not a persisted adherence checkbox. */
export async function readDietAssessment(client:SupabaseClient,enrollmentId:string,date:string):Promise<{bundle:Bundle;assessment:Assessment}>{
 const {data,error}=await client.rpc('read_diet_day_v1',{enrollment_id:enrollmentId,local_date:date});
 if(error||!data)throw Error('ASSESSMENT_UNAVAILABLE');const bundle=data as Bundle;return {bundle,assessment:assessDiet(bundle)};
}
