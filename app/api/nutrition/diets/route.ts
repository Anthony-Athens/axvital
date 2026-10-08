import { createClient } from '@/lib/supabase/server';
import { guardWithClient } from '@/lib/api/boundary';
import { ApiError } from '@/lib/api/validation';
import { isUuid } from '@/lib/rules/validation';
import { isLogicalDate,calendarDays } from '@/lib/measurements/time-window';
import { validatePlan,assessDiet,type Bundle } from '@/lib/diets/model';
import { dietCatalog,readDietAssessment } from '@/lib/diets/service';
export const GET=guardWithClient('http/nutrition/diets',async(request,{client,userId})=>{
 const q=new URL(request.url).searchParams,id=q.get('id');
 if(!id){
  const [diets,enrollments,catalog]=await Promise.all([client.from('diet_definitions').select('*').eq('user_id',userId).order('updated_at',{ascending:false}).limit(501),client.from('diet_enrollments').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(501),dietCatalog(client)]);
  if(diets.error||enrollments.error||!diets.data||!enrollments.data||diets.data.length>=501||enrollments.data.length>=501)throw new ApiError(503,'Diets could not be loaded.');
  return Response.json({diets:diets.data,enrollments:enrollments.data,catalog});
 }
 if(!isUuid(id)||!isLogicalDate(q.get('date')))throw new ApiError(400,'Choose a valid enrollment and observed date.');
 try{
  const result=await readDietAssessment(client,id,q.get('date')!);let history:ReturnType<typeof assessDiet>[]=[];
  if(q.has('start')||q.has('end')){const start=q.get('start'),end=q.get('end');if(!isLogicalDate(start)||!isLogicalDate(end)||end<start||calendarDays(start,end)>30)throw new ApiError(400,'Choose a history window of up to 31 days.');const {data,error}=await client.rpc('read_diet_window_v1',{enrollment_id:id,start_date:start,end_date:end});if(error||!Array.isArray(data))throw Error('HISTORY_UNAVAILABLE');history=(data as Bundle[]).map(assessDiet);}
  return Response.json({...result,history});
 }catch(e){if(e instanceof ApiError)throw e;throw new ApiError(503,'Assessment could not be recalculated. Retry to see current results.');}
},createClient,{budgetRoute:'http/nutrition/goals'});
export const POST=guardWithClient('http/nutrition/diets',async(request,{client})=>{
 const body=await request.json();if(!body||!['definition','enroll','version','stop','confirm','classification','identity'].includes(body.action)||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))throw new ApiError(400,'Invalid request.');
 if(body.action==='definition'||body.action==='version'){try{validatePlan(body.action==='definition'?body.payload.draft:body.payload.plan,body.action==='version');}catch(e){throw new ApiError(400,e instanceof Error?e.message:'Check the rules.');}}
 const {data,error}=await client.rpc('save_diet_v1',{action:body.action,payload:body.payload});
 if(error){const code=error.message;const conflict=code.includes('CONFLICT')||code.includes('INTAKE_CHANGED');const message=conflict?'Data changed. Refresh before trying again; your input is preserved.':code.includes('CONTRADICTORY')||code.includes('CATEGORY_CONFLICT')?'Resolve contradictory food or category rules before following this diet.':code.includes('NO_INTAKE')?'Confirm that this was deliberately a no-intake day.':code.includes('HISTORICAL_SCOPE')?'Acknowledge the historical correction scope.':code.includes('INCOMPLETE_DIET')||code.includes('ALLOW_LIST')?'Add a name and complete rules, including an allowed list for an exhaustive diet.':'Unable to save. Check dates, references and required fields, then try again.';throw new ApiError(conflict?409:400,message);}
 return Response.json(data);
},createClient,{budgetRoute:'http/nutrition/goals'});
