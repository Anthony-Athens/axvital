import type {SupabaseClient} from '@supabase/supabase-js';
import {readDietAssessment,dietCatalog} from '../diets/service.ts';
import type {IntakeBundle,Enrollment,Diet} from '../diets/model.ts';
import {dateInZone,isLogicalDate,calendarDays,shiftDate} from '../measurements/time-window.ts';
import type {Study,Checkin} from './observational.ts';
import {factorVersion,type FactorVersion} from './factor-config.ts';
import {evidenceBase,foodEvidence,supplementEvidence,checkinEvidence,type SupplementDay,type SupplementProduct,type Evidence,type LinkedResponse} from './linked-evidence.ts';
export type FactorCatalog={catalog:Awaited<ReturnType<typeof dietCatalog>>;enrollments:Enrollment[];diets:Diet[];products:SupplementProduct[]};
export async function linkedCatalog(client:SupabaseClient,userId:string):Promise<FactorCatalog>{
 const [catalog,enrollments,diets,products]=await Promise.all([dietCatalog(client),client.from('diet_enrollments').select('*').eq('user_id',userId).limit(501),client.from('diet_definitions').select('*').eq('user_id',userId).limit(501),client.from('supplement_products').select('id,name,formulation').eq('user_id',userId).limit(501)]);
 if([enrollments,diets,products].some(r=>r.error||!r.data||r.data.length>=501))throw Error('FACTOR_OPTIONS_UNAVAILABLE');return {catalog,enrollments:enrollments.data!,diets:diets.data!,products:products.data!};
}
export async function readLinkedEvidence(client:SupabaseClient,userId:string,study:Study,date:string,start:string,end:string):Promise<LinkedResponse>{
 if(![date,start,end].every(isLogicalDate)||end<start||calendarDays(start,end)>30||date<start||date>end||date<study.start_date||date>study.end_date||date>dateInZone(new Date(),study.timezone))throw Error('INVALID_WINDOW');
 const {data:versions,error}=await client.from('observational_factor_versions').select('*').eq('user_id',userId).eq('study_id',study.id).order('revision').limit(501);if(error||!versions||versions.length>=501)throw Error('VERSIONS_UNAVAILABLE');
 const intake=new Map<string,Promise<IntakeBundle>>(),supplements=new Map<string,Promise<SupplementDay>>(),diets=new Map<string,Promise<Evidence>>();
 const {data:enrollments,error:enrollmentError}=await client.from('diet_enrollments').select('*').eq('user_id',userId).limit(501);
 const {data:checkins,error:checkinError}=await client.from('daily_checkins').select('checkin_date,energy_score,mood_score,sleep_quality,weight_source_value,weight_source_unit,weight_provenance_version,weight_kg').eq('user_id',userId).gte('checkin_date',shiftDate([date,start].sort()[0],-1)).lte('checkin_date',[date,end].sort().at(-1)!).limit(34);
 const read=<T>(fn:string,args:Record<string,string>)=>Promise.resolve(client.rpc(fn,args)).then(({data,error})=>{if(error||!data)throw Error('SOURCE_UNAVAILABLE');return data as T;});
 async function day(outcomeDate:string){const version=factorVersion(versions as FactorVersion[],outcomeDate,{id:`initial:${study.id}`,effective_from:study.start_date,revision:1,factors:study.factors});
  return Promise.all(version.factors.map(async f=>{let base=evidenceBase(f,outcomeDate,version.id,study.timezone);try{
   if(['body_weight','energy_score','mood_score','sleep_quality_score'].includes(f.source)){if(checkinError||!checkins||checkins.length>=34)throw Error();return checkinEvidence(base,checkins.find(c=>c.checkin_date===base.source_date) as Checkin|undefined);}
   if(f.source==='diet'){
    if(enrollmentError||!enrollments||enrollments.length>=501)throw Error();const enrollment=enrollments.find(e=>e.id===f.ref);if(!enrollment)throw Error();base={...base,timezone:enrollment.timezone};
    if(enrollment.cancelled||base.source_date<enrollment.start_date||(enrollment.end_date&&base.source_date>enrollment.end_date))return {...base,status:'not_applicable',explanation:'Source date is outside the selected diet enrollment.'};
    const key=`${f.ref}:${base.source_date}`;if(!diets.has(key))diets.set(key,readDietAssessment(client,f.ref!,base.source_date).then(({assessment,bundle})=>({...base,status:assessment.calculated_status,value:assessment.calculated_status,complete:assessment.logging_complete,fingerprint:assessment.fingerprint,diet:assessment,explanation:`Rules effective ${bundle.version.effective_from}; ${assessment.exception?'planned exception; ':''}${assessment.logging_complete?'logging confirmed':'logging incomplete'}.`,references:assessment.reasons.map(r=>({domain:r.source.domain,id:r.source.id,detail:r.message}))})));
    const result=await diets.get(key)!;return {...result,factor:f,outcome_date:outcomeDate,configuration_version:version.id};
   }
   if(f.source==='supplement'){if(!supplements.has(base.source_date))supplements.set(base.source_date,read<SupplementDay>('read_supplement_day_v1',{local_date:base.source_date,time_zone:study.timezone}));return supplementEvidence(base,await supplements.get(base.source_date)!);}
   if(!intake.has(base.source_date))intake.set(base.source_date,read<IntakeBundle>('read_intake_day_v1',{local_date:base.source_date,time_zone:study.timezone}));return foodEvidence(base,await intake.get(base.source_date)!);
  }catch{return {...base,status:'error',freshness:'error' as const,explanation:'Source evidence could not be recalculated. Refresh after resolving the source; this is not absence.'};}}));
 }
 const history:LinkedResponse['history']=[];const last=[end,study.end_date,dateInZone(new Date(),study.timezone),...(study.finished_on?[study.finished_on]:[])].sort()[0];const first=[start,study.start_date].sort().at(-1)!;
 // Four dates at a time bound database pressure while overlapping network waits.
 // Source-day promises remain shared within this request; Promise.all retains date order.
 for(let d=first;d<=last;d=shiftDate(d,4)){const batch:string[]=[];for(let i=0;i<4&&shiftDate(d,i)<=last;i++)batch.push(shiftDate(d,i));history.push(...await Promise.all(batch.map(async date=>({date,factors:await day(date)}))));}
 return {study,versions:versions as FactorVersion[],daily:history.find(d=>d.date===date)?.factors??await day(date),history};
}
