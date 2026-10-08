import {createClient} from '@/lib/supabase/server';
import {guardWithClient} from '@/lib/api/boundary';
import {ApiError} from '@/lib/api/validation';
import {dateInZone,isLogicalDate,isTimeZone} from '@/lib/measurements/time-window';
export const GET=guardWithClient('http/nutrition/supplements',async(request,{client,userId})=>{
 const q=new URL(request.url).searchParams,tz=q.get('timezone')??'UTC';if(!isTimeZone(tz))throw new ApiError(400,'Invalid date/timezone.');const date=q.get('date')??dateInZone(new Date(),tz);if(!isLogicalDate(date))throw new ApiError(400,'Invalid date/timezone.');
 const [products,day]=await Promise.all([client.from('supplement_products').select('id,name,formulation').eq('user_id',userId).limit(501),client.rpc('read_supplement_day_v1',{local_date:date,time_zone:tz})]);
 if(products.error||day.error||!products.data||products.data.length>=501)throw new ApiError(503,'Supplement records could not be loaded.');return Response.json({products:products.data,day:day.data});
},createClient,{budgetRoute:'http/nutrition/goals'});
export const POST=guardWithClient('http/nutrition/supplements',async(request,{client})=>{
 const {action,payload}=await request.json();const {data,error}=await client.rpc('save_supplement_review_v1',{action,payload});if(error)throw new ApiError(error.message.includes('INTAKE_CHANGED')?409:400,'Unable to save supplement review. Refresh stale records; your input is preserved.');return Response.json(data);
},createClient,{budgetRoute:'http/nutrition/goals'});
