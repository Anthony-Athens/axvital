import {createClient} from '@/lib/supabase/server';
import {guardWithClient} from '@/lib/api/boundary';
import {ApiError} from '@/lib/api/validation';
import {dietCatalog} from '@/lib/diets/service';
import {isLogicalDate,isTimeZone} from '@/lib/measurements/time-window';
export const GET=guardWithClient('http/nutrition/intake',async(request,{client})=>{
 const q=new URL(request.url).searchParams;if(!isLogicalDate(q.get('date'))||!isTimeZone(q.get('timezone')??''))throw new ApiError(400,'Invalid date/timezone.');
 const [snapshot,catalog]=await Promise.all([client.rpc('read_intake_day_v1',{local_date:q.get('date'),time_zone:q.get('timezone')}),dietCatalog(client)]);if(snapshot.error||!snapshot.data)throw new ApiError(503,'Intake could not be recalculated.');return Response.json({bundle:snapshot.data,catalog});
},createClient,{budgetRoute:'http/nutrition/goals'});
export const POST=guardWithClient('http/nutrition/intake',async(request,{client})=>{const {payload}=await request.json();const {data,error}=await client.rpc('confirm_intake_day_v1',{payload});if(error)throw new ApiError(error.message.includes('INTAKE_CHANGED')?409:400,'Unable to confirm. Refresh current intake and confirm deliberate no intake if empty.');return Response.json(data);},createClient,{budgetRoute:'http/nutrition/goals'});
