import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from '../security/test-database.ts';
import { completeness, sourceValue, rollingWeight, validateMetric, validateObservation, validateStudy, type Metric, type Study, type Observation } from './observational.ts';
import { dateInZone, shiftDate } from '../measurements/time-window.ts';
const A='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',ID='cccccccc-cccc-4ccc-cccc-cccccccccccc',SECOND='dddddddd-dddd-4ddd-dddd-dddddddddddd';
const metric={name:'Synthetic intensity',description:'',kind:'rating' as const,unit:'rating',min:0,max:4,anchors:{'0':'Absent','4':'High'},direction:'lower' as const,instructions:'Describe the observed night.'};
const study:Study={id:ID,title:'Synthetic observational study',question:'How does the outcome vary?',start_date:'2026-01-01',end_date:'2026-03-31',timezone:'America/New_York',entry_offset:-1,metric_id:null,outcome_source:'energy_score',factors:[{source:'body_weight',offset:0}],status:'draft',revision:0};
test('calendar alignment, DST, boundaries, completeness, zeros, false, scale and weight normalization',()=>{
 assert.equal(shiftDate('2026-03-01',-1),'2026-02-28');assert.equal(shiftDate('2026-11-01',1),'2026-11-02');
 assert.equal(dateInZone(new Date('2026-03-08T04:30:00Z'),'America/New_York'),'2026-03-07');assert.equal(dateInZone(new Date('2026-11-01T05:30:00Z'),'America/New_York'),'2026-11-01');
 validateMetric(metric);assert.throws(()=>validateMetric({...metric,max:25}));assert.throws(()=>validateMetric({...metric,anchors:{'5':'Invalid'}}));assert.throws(()=>validateMetric({...metric,min:null}));
 validateStudy(study);assert.throws(()=>validateStudy({...study,end_date:'2026-02-30'}));assert.throws(()=>validateStudy({...study,factors:[...study.factors,...study.factors]}));
 const m={...metric,id:ID,version:1} as Metric;const o={metric_id:ID,observed_date:'2026-01-01',status:'recorded',value:0,observer:'Synthetic observer',coverage:'most',note:'',submitted_at:'',updated_at:''} as Observation;
 validateObservation(o,m,'2026-01-03');validateObservation({...o,value:0},{...m,kind:'boolean',min:null,max:null},'2026-01-03');validateObservation({...o,status:'not_observed',value:null},m,'2026-01-03');assert.throws(()=>validateObservation({...o,value:5},m,'2026-01-03'));
 assert.deepEqual(completeness({...study,entry_offset:0},new Map<string,{status:string;value:number|null}>([['2026-01-01',o],['2026-01-02',{status:'not_observed',value:null}]]),new Date('2026-01-03T18:00:00Z')),{valid:1,notObserved:1,missing:1,expected:3});
 assert.deepEqual(completeness(study,new Map(),new Date('2026-01-03T18:00:00Z')),{valid:0,notObserved:0,missing:2,expected:2});
 const rows=[{checkin_date:'2026-01-01',weight_source_value:100,weight_source_unit:'lb',weight_provenance_version:1,weight_kg:45.359237},{checkin_date:'2026-01-07',weight_source_value:50,weight_source_unit:'kg',weight_provenance_version:1,weight_kg:50}];
 assert.equal(sourceValue('body_weight',rows[0]),45.359237);assert.equal(sourceValue('body_weight'),null);assert.equal(sourceValue('body_weight',{checkin_date:'2026-01-02',weight:100}),null);
 assert.deepEqual(rollingWeight('2026-01-07',rows),{value:(45.359237+50)/2,count:2});assert.equal(rollingWeight('2026-01-08',rows).count,1);
 assert.equal(sourceValue('body_weight',{...rows[1],weight_source_value:51,weight_kg:51}),51);assert.equal(rollingWeight('2026-01-07',[]).value,null);
});
test('real PostgreSQL RPC, RLS, canonical reuse, scale enforcement, immutable config, export and deletion',async()=>{
 const db=await database();const as=async(uid:string,role='authenticated')=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${uid}',false);set role ${role};`);
 const save=async<T>(action:string,payload:unknown)=>(await db.query<{result:T}>('select public.save_observational_v1($1,$2::jsonb) as result',[action,JSON.stringify(payload)])).rows[0].result;
 try{
 await as(A);await assert.rejects(save('metric',metric),/PREMIUM_REQUIRED/);
 await db.exec(`reset role;insert into public.subscriptions(user_id,plan,status) values('${A}','premium','active'),('${B}','premium','active');`);
 await as(A);const m=await save<Metric>('metric',metric);assert.equal(m.version,1);
 await assert.rejects(save('metric',{...metric,anchors:{'5':'bad'}}),/INVALID_ANCHORS/);await assert.rejects(save('metric',{...metric,min:null}));
 let s=await save<Study>('study',{...study,metric_id:m.id,outcome_source:null});assert.equal(s.revision,1);
 s=await save<Study>('study',{...s,user_id:undefined,created_at:undefined,updated_at:undefined,finished_on:undefined,status:'active'});
 // RPC responses include ownership/timestamps; only send the public authoring fields.
 const config=(s:Study)=>({id:s.id,title:s.title,question:s.question,start_date:s.start_date,end_date:s.end_date,timezone:s.timezone,entry_offset:s.entry_offset??0,metric_id:s.metric_id,outcome_source:s.outcome_source,factors:s.factors,status:s.status,revision:s.revision});
 const obs={study_id:ID,observed_date:'2026-01-01',status:'recorded',value:0,observer:'Synthetic observer',coverage:'most',note:'',expected_updated_at:null};
 const o=await save<Observation>('observation',obs);assert.equal(o.value,0);
 await assert.rejects(save('observation',{...obs,value:4}),/OBSERVATION_CONFLICT/);
 await save('observation',{...obs,value:2,expected_updated_at:o.updated_at});
 await save('observation',{...obs,observed_date:'2026-01-02',status:'not_observed',value:null});
 await assert.rejects(save('observation',{...obs,observed_date:'2026-01-03',value:5}),/INVALID_VALUE/);
 await assert.rejects(save('observation',{...obs,observed_date:'2026-01-03',value:1.5}),/INVALID_VALUE/);
 await assert.rejects(save('observation',{...obs,observed_date:'2025-12-31'}),/INVALID_DATE/);
 await assert.rejects(save('study',{...config(s),end_date:'2026-04-01'}),/CONFIG_LOCKED/);
 const second=await save<Study>('study',{...study,id:SECOND,metric_id:m.id,outcome_source:null});await save<Study>('study',{...config(second),status:'active'});
 const shared=(await db.query<Observation>('select * from public.metric_observations where observed_date=\'2026-01-01\'')).rows[0];
 await save('observation',{...obs,study_id:SECOND,value:3,expected_updated_at:shared.updated_at});
 assert.equal((await db.query('select * from public.metric_observations')).rows.length,2);
 await assert.rejects(db.exec(`update public.observation_metrics set max=10`),/permission denied/);
 await as(B);assert.equal((await db.query('select * from public.metric_observations')).rows.length,0);await assert.rejects(save('study',{...study,metric_id:m.id,outcome_source:null,id:crypto.randomUUID()}),/foreign key/);await assert.rejects(save('observation',obs),/NOT_FOUND/);
 await as('','anon');await assert.rejects(save('metric',metric),/permission denied/);
 await as(A);const exported=(await db.query<{result:Record<string,unknown>}>('select public.axvital_export_account() as result')).rows[0].result;assert.ok(JSON.stringify(exported).includes('metric_observations'));
 await db.exec(`reset role;insert into public.account_deletions(user_id,billing_closed) values('${A}',true);delete from auth.users where id='${A}'`);assert.equal((await db.query('select * from public.metric_observations')).rows.length,0);assert.equal((await db.query('select * from public.observational_studies')).rows.length,0);
 }finally{await db.close();}
});




