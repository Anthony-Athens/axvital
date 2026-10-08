import { createClient } from '@/lib/supabase/server';
import { guardWithClient } from '@/lib/api/boundary';
import { ApiError } from '@/lib/api/validation';
import { isUuid } from '@/lib/rules/validation';
import { validateMetric, validateStudy, validateObservation, type Metric, type Observation, type Study } from '@/lib/experiments/observational';
import { dateInZone, shiftDate } from '@/lib/measurements/time-window';
export const GET = guardWithClient('http/experiments/observational', async(request,{client,userId})=>{
  const id=new URL(request.url).searchParams.get('id');
  const [studies,metrics]=await Promise.all([client.from('observational_studies').select('*').eq('user_id',userId).order('updated_at',{ascending:false}).limit(200),client.from('observation_metrics').select('*').eq('user_id',userId).limit(200)]);
  if(studies.error||metrics.error)throw new ApiError(503,'Unable to load studies or metrics.');
  if(!id)return Response.json({studies:studies.data,metrics:metrics.data});
  if(!isUuid(id))throw new ApiError(400,'Invalid study.');
  const {data:study,error}=await client.from('observational_studies').select('*').eq('id',id).eq('user_id',userId).single();
  if(error||!study)throw new ApiError(404,'Study not found.');
  const s=study as Study;
  const [observations,checkins]=await Promise.all([
    s.metric_id?client.from('metric_observations').select('*').eq('user_id',userId).eq('metric_id',s.metric_id).gte('observed_date',s.start_date).lte('observed_date',s.end_date).limit(367):Promise.resolve({data:[],error:null}),
    client.from('daily_checkins').select('checkin_date,energy_score,mood_score,sleep_quality,weight_source_value,weight_source_unit,weight_provenance_version,weight_kg').eq('user_id',userId).gte('checkin_date',shiftDate(s.start_date,-7)).lte('checkin_date',s.end_date).limit(375),
  ]);
  return Response.json({study:s,metrics:metrics.data,observations:observations.error?null:observations.data,checkins:checkins.error?null:checkins.data,observationError:!!observations.error,sourceError:!!checkins.error});
},createClient,{budgetRoute:'http/experiments/draft'});
export const POST = guardWithClient('http/experiments/observational',async(request,{client,userId})=>{
  const body=await request.json();
  if(!body||typeof body!=='object'||!['metric','study','observation'].includes(body.action)||!body.payload||typeof body.payload!=='object')throw new ApiError(400,'Invalid request.');
  try {
    if(body.action==='metric')validateMetric(body.payload);
    if(body.action==='study') {validateStudy(body.payload);if(!isUuid(body.payload.id)||!Number.isInteger(body.payload.revision)||body.payload.revision<0)throw new Error('INVALID_STUDY');}
    if(body.action==='observation') {
      if(!isUuid(body.payload.study_id))throw new Error('INVALID_STUDY');
      const {data:s}=await client.from('observational_studies').select('*').eq('id',body.payload.study_id).eq('user_id',userId).single();
      if(!s?.metric_id)throw new Error('INVALID_STUDY');
      const {data:m}=await client.from('observation_metrics').select('*').eq('id',s.metric_id).eq('user_id',userId).single();
      if(!m)throw new Error('INVALID_METRIC');
      validateObservation(body.payload as Observation,m as Metric,dateInZone(new Date(),s.timezone));
    }
  }catch{throw new ApiError(400,'Check the dates, scale and required fields.');}
  const {data,error}=await client.rpc('save_observational_v1',{action:body.action,payload:body.payload});
  if(error) {
    const code=error.message;
    if(code.includes('PREMIUM_REQUIRED'))throw new ApiError(403,'Premium is required to save and start experiments.');
    if(code.includes('CONFLICT'))throw new ApiError(409,'This record changed. Reload before editing again; your input is still here.');
    throw new ApiError(400,'Unable to save. Check your configuration and try again.');
  }
  return Response.json(data);
},createClient,{budgetRoute:'http/experiments/draft'});
