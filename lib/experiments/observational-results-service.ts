import type {SupabaseClient} from '@supabase/supabase-js';
import {dateInZone,isLogicalDate,shiftDate,calendarDays} from '../measurements/time-window.ts';
import {sources,sourceValue,type Study,type Metric,type Checkin,type Observation} from './observational.ts';
import {readLinkedEvidence,linkedCatalog} from './linked-service.ts';
import {calculateResults,type OutcomeDefinition,type OutcomeRecord} from './observational-results.ts';
import type {LinkedResponse} from './linked-evidence.ts';

/** Owner-authenticated client only. No stored results or health values in logs. */
export async function readObservationalResults(client:SupabaseClient,userId:string,study:Study,start:string,end:string,now=new Date()){
 if(![start,end].every(isLogicalDate)||end<start||calendarDays(start,end)>366)throw Error('INVALID_RANGE');
 const first=[start,study.start_date].sort().at(-1)!,last=[end,study.end_date,dateInZone(now,study.timezone),...(study.finished_on?[study.finished_on]:[])].sort()[0];
 const catalog=await linkedCatalog(client,userId);let definition:OutcomeDefinition;
 if(study.metric_id){const {data,error}=await client.from('observation_metrics').select('*').eq('user_id',userId).eq('id',study.metric_id).limit(2);if(error||data?.length!==1)throw Error('OUTCOME_UNAVAILABLE');definition=data[0] as Metric;}
 else{const s=sources.find(s=>s.key===study.outcome_source);if(!s)throw Error('OUTCOME_UNSUPPORTED');definition={id:s.key,version:s.version,name:s.label,kind:s.key==='body_weight'?'numeric':'rating',unit:s.unit,min:1,max:s.key==='sleep_quality_score'?4:10,anchors:s.key==='sleep_quality_score'?{1:'Poor',2:'Average',3:'Good',4:'Great'}:{},direction:'neither'};}
 const linked:LinkedResponse={study,versions:[],daily:[],history:[]};const outcomes=new Map<string,OutcomeRecord>();
 if(first<=last){const outcome=study.metric_id?await client.from('metric_observations').select('*').eq('user_id',userId).eq('metric_id',study.metric_id).gte('observed_date',first).lte('observed_date',last).limit(368):await client.from('daily_checkins').select('*').eq('user_id',userId).gte('checkin_date',first).lte('checkin_date',last).limit(368);
  if(outcome.error||!outcome.data||outcome.data.length>=368)throw Error('OUTCOME_UNAVAILABLE');
  if(study.metric_id)for(const o of outcome.data as Observation[])outcomes.set(o.observed_date,o);else for(const c of outcome.data as Checkin[])outcomes.set(c.checkin_date,{status:'recorded',value:sourceValue(study.outcome_source!,c)});
  // Reuse canonical bounded adapter windows. At most twelve sequential chunks,
  // with per-domain/source-day promise reuse inside each; no client per-date fetches.
  for(let from=first;from<=last;from=shiftDate(from,31)){const to=[shiftDate(from,30),last].sort()[0];const chunk=await readLinkedEvidence(client,userId,study,to,from,to);linked.history.push(...chunk.history);linked.versions=chunk.versions;}
 }
 return {study,catalog,calculated_at:now.toISOString(),results:calculateResults(linked,outcomes,definition)};
}
export type ObservationalResultsResponse=Awaited<ReturnType<typeof readObservationalResults>>;
