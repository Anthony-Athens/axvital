import {createClient} from '@/lib/supabase/server';
import {guardWithClient} from '@/lib/api/boundary';
import {ApiError} from '@/lib/api/validation';
import {isUuid} from '@/lib/rules/validation';
import {isLogicalDate,calendarDays} from '@/lib/measurements/time-window';
import {readObservationalResults} from '@/lib/experiments/observational-results-service';
import type {Study} from '@/lib/experiments/observational';
import {entitlementFor} from '@/lib/billing/server';
export const GET=guardWithClient('http/experiments/observational-results',async(request,{client,userId})=>{
 const q=new URL(request.url).searchParams,start=q.get('start')??'',end=q.get('end')??'';
 if(!isUuid(q.get('id'))||!isLogicalDate(start)||!isLogicalDate(end)||end<start||calendarDays(start,end)>366)throw new ApiError(400,'Choose a valid range of at most 367 dates.');
 const {data,error}=await client.from('observational_studies').select('*').eq('id',q.get('id')).eq('user_id',userId).single();if(error||!data)throw new ApiError(404,'Study not found.');
 const access=await entitlementFor(client,'full_experiments');if(!access.allowed)throw new ApiError(403,'Premium is required for observational comparisons.');
 try{return Response.json(await readObservationalResults(client,userId,data as Study,start,end),{headers:{'Cache-Control':'no-store'}});}catch{throw new ApiError(503,'Results could not be recalculated. Previous results are unavailable; retry.');}
},createClient,{budgetRoute:'http/experiments/draft'});
