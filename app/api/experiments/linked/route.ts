import {createClient} from '@/lib/supabase/server';
import {guardWithClient} from '@/lib/api/boundary';
import {ApiError} from '@/lib/api/validation';
import {isUuid} from '@/lib/rules/validation';
import {linkedCatalog,readLinkedEvidence} from '@/lib/experiments/linked-service';
import {validateFactors} from '@/lib/experiments/factor-config';
import type {Study} from '@/lib/experiments/observational';
export const GET=guardWithClient('http/experiments/linked',async(request,{client,userId})=>{
 const q=new URL(request.url).searchParams;
 if(!q.has('id')){try{return Response.json(await linkedCatalog(client,userId));}catch{throw new ApiError(503,'Factor options could not be loaded. Retry.');}}
 if(!isUuid(q.get('id')))throw new ApiError(400,'Invalid study.');
 const {data,error}=await client.from('observational_studies').select('*').eq('id',q.get('id')).eq('user_id',userId).single();if(error||!data)throw new ApiError(404,'Study not found.');
 try{return Response.json(await readLinkedEvidence(client,userId,data as Study,q.get('date')??'',q.get('start')??'',q.get('end')??''));}catch{throw new ApiError(503,'Linked evidence could not be recalculated. Retry; old results are unavailable.');}
},createClient,{budgetRoute:'http/experiments/draft'});
export const POST=guardWithClient('http/experiments/linked',async(request,{client})=>{
 const {payload}=await request.json();try{validateFactors(payload?.factors);}catch{throw new ApiError(400,'Choose valid unique factors.');}
 const {data,error}=await client.rpc('save_factor_version_v1',{payload});if(error)throw new ApiError(error.message.includes('CONFLICT')?409:error.message.includes('PREMIUM_REQUIRED')?403:400,'Unable to save factor version. Check references, effective date and historical acknowledgment; your input is preserved.');return Response.json(data);
},createClient,{budgetRoute:'http/experiments/draft'});
