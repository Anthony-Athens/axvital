import type { Metric, Study, Observation, Checkin } from './observational.ts';
export type StudyData = { studies?:Study[]; study?:Study; metrics:Metric[]; observations?:Observation[]|null; checkins?:Checkin[]|null; observationError?:boolean;sourceError?:boolean };
export async function observationRequest<T>(id?:string,action?:string,payload?:unknown):Promise<T>{
 if(action==='study'){
  const s=payload as Study;
  payload={id:s.id,title:s.title,question:s.question,start_date:s.start_date,end_date:s.end_date,timezone:s.timezone,entry_offset:s.entry_offset??0,metric_id:s.metric_id,outcome_source:s.outcome_source,factors:s.factors,status:s.status,revision:s.revision};
 }
 const response=await fetch(`/api/experiments/observational${id?`?id=${encodeURIComponent(id)}`:''}`,{cache:'no-store',...(action?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})}:{})});
 const data=await response.json();if(!response.ok)throw new Error(data.error??'Unable to load.');return data;
}

