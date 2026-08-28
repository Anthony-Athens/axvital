import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import * as nodeModule from "node:module";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {ReadinessResult} from "../measurements/readiness-policies.ts";
import {studyPeriod,habitExposure,outcomeCompleteness,unknownExposure,unknownCompleteness,collectionHealth,studyHealthExplanation} from "./study-health.ts";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const rule={start_date:"2026-08-24",end_date:null,recurrence_type:"specific_days" as const,days_of_week:[1,3,5],interval_days:null};
const rows=[{scheduled_date:"2026-08-24",status:"completed"},{scheduled_date:"2026-08-26",status:"completed"}];
test("study progress uses analysis-zone calendar days, not device timezone or efficacy",()=>{
  const p=studyPeriod("2026-03-07","2026-03-10","America/New_York",new Date("2026-03-09T02:00:00Z"))!;assert.equal(p.day,2);assert.equal(p.total,4);assert.equal(p.percent,25);
  assert.equal(studyPeriod("2026-08-24","2026-08-25","UTC",new Date("2026-08-28"))?.ended,true);
  assert.equal(studyPeriod("2026-08-24","2026-08-25","UTC",new Date("2026-08-23"))?.day,0);
  assert.equal(studyPeriod("invalid","2026-08-25","UTC",new Date()),null);
});
test("M/W/F denominators exclude off-days and today's unfinished opportunity",()=>{
  const r=habitExposure(rule,rows,rule.start_date,"2026-08-28","2026-08-28","2026-09-01");assert.equal(r.eligible,2);assert.equal(r.completed,2);assert.equal(r.state,"adherent");assert.match(r.today,/no confirmed completion/);
});
test("explicit eligible skips are non-adherent, unrelated days are ignored",()=>{
  const r=habitExposure(rule,[rows[0],{...rows[1],status:"skipped"},{scheduled_date:"2026-08-25",status:"skipped"}],rule.start_date,"2026-08-28","2026-08-28","2026-09-01");assert.equal(r.state,"non-adherent");assert.equal(r.skipped,1);
});
test("absent, planned and duplicate evidence stay unknown, never missed by inference",()=>{
  for(const records of [[],[rows[0]],[rows[0],{...rows[1],status:"planned"}],[...rows,rows[1]]])assert.equal(habitExposure(rule,records,rule.start_date,"2026-08-28","2026-08-28","2026-09-01").state,"unknown");
});
test("daily opportunities and no-opportunity windows retain honest denominators",()=>{
  assert.equal(habitExposure({...rule,recurrence_type:"daily"},[],rule.start_date,"2026-08-28","2026-08-28","2026-09-01").eligible,4);
  assert.equal(habitExposure(rule,[],"2026-08-25","2026-08-26","2026-08-26","2026-09-01").state,"unknown");
});
const readiness=(patch:Record<string,unknown>={})=>({queryCompleteness:"complete",observationCount:3,coverage:{expectedDays:3,observedDays:3},...patch} as ReadinessResult);
test("complete and missing outcome coverage reuse backend expected-day semantics",()=>{
  assert.equal(outcomeCompleteness(readiness()).state,"complete");const r=outcomeCompleteness(readiness({coverage:{expectedDays:3,observedDays:1}}));assert.equal(r.state,"missing");assert.equal(r.missing,2);
});
test("nutrition counts complete logging days, not partial intake as zero",()=>{
  const r=outcomeCompleteness(readiness({nutrition:{qualifyingCompleteDays:1}}));assert.equal(r.captured,1);assert.equal(r.missing,2);assert.match(r.reason,/not necessarily intake/);
});
test("unsupported cadence and failed/truncated reads never manufacture missing observations",()=>{
  const r=outcomeCompleteness(readiness({coverage:{expectedDays:null,observedDays:3}}));assert.equal(r.expected,null);assert.equal(r.captured,3);assert.equal(r.state,"unknown");
  for(const state of ["failed","truncated"])assert.equal(outcomeCompleteness(readiness({queryCompleteness:state})).captured,null);
});
test("study health describes collection only and unknown remains unknown",()=>{
  const e=habitExposure(rule,rows,rule.start_date,"2026-08-28","2026-08-28","2026-09-01");assert.equal(collectionHealth(e,outcomeCompleteness(readiness())),"Good");assert.equal(collectionHealth({...e,state:"non-adherent"},outcomeCompleteness(readiness())),"Needs attention");assert.equal(collectionHealth(e,unknownCompleteness("unsupported")),"Unable to determine");assert.equal(collectionHealth(unknownExposure("unsupported"),outcomeCompleteness(readiness())),"Unable to determine");assert.match(studyHealthExplanation,/does not indicate whether the intervention is working/);
});
test("active UI provides textual progress, separate sections, safe mobile layout and existing trackers only",()=>{
  const ui=read("../../components/experiments/ActiveStudyStatus.tsx");for(const label of ["Study timeline","Study Health","Intervention exposure","Outcome completeness","Today / current requirements","aria-label","min-w-0","break-words"])assert.ok(ui.includes(label));assert.doesNotMatch(ui,/<form|<input|\.rpc\(|transitionExperiment|effect estimate|p-value/);assert.match(ui,/Backend status remains/);
});
test("status reads protect against stale responses, hide old previews and offer loading/retry",()=>{
  const ui=read("../../components/experiments/ActiveStudyStatus.tsx");for(const text of ["current=false","abort.abort()","state?.key===key","Loading current study status","Refresh status / retry","60000"])assert.ok(ui.includes(text));
  const legacy=read("../../components/experiments/ExperimentDetail.tsx");assert.match(legacy,/request===generation.current/);assert.match(legacy,/x.id!==id/);assert.ok(legacy.indexOf("model_version===2")<legacy.indexOf("const actions"));
});
const hook=(nodeModule as unknown as {registerHooks(h:{resolve:(s:string,c:unknown,next:(s:string,c:unknown)=>unknown)=>unknown}):{deregister():void}}).registerHooks({resolve(s,c,next){return s==="server-only"?{url:"data:text/javascript,export{}",shortCircuit:true}:next(s,c);}});
const {loadStudyStatus}=await import("./study-status.ts");hook.deregister();
const id="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",owner="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const source={id,name:"Walking",activity_type:"habit",tracking_type:"binary",target_value:null,target_unit:null,minimum_value:null,allow_partial_completion:false,...rule,scheduled_time:null,is_active:true};
function client(options:{foreign?:boolean;changed?:boolean;paused?:boolean;fail?:string;type?:string}={}){
  const tables:Record<string,Record<string,unknown>[]>={experiments:[{id,user_id:options.foreign?"other":owner,model_version:2,config_revision:2,status:"active",current_phase:"intervention"}],experiment_start_snapshots:[{user_id:owner,experiment_id:id,config_revision:2,snapshot_version:1,configuration:{question:"Does walking appear associated with energy?",analysis_timezone:"UTC",intervention_start_date:rule.start_date,intervention_end_date:"2026-09-01",intervention:{type:options.type??"habit",configuration:source},outcomes:[]}}],planned_activities:[{...source,title:options.changed?"Changed":source.name,user_id:owner}],planned_activity_occurrences:rows.map(r=>({...r,user_id:owner,planned_activity_id:id})),experiment_phase_events:options.paused?[{id,user_id:owner,experiment_id:id,event_type:"paused"}]:[]};
  return {from(table:string){let data=tables[table]??[],single=false;const q={select(){return q;},eq(k:string,v:unknown){data=data.filter(r=>r[k]===v);return q;},gte(k:string,v:string){data=data.filter(r=>String(r[k])>=v);return q;},lte(k:string,v:string){data=data.filter(r=>String(r[k])<=v);return q;},limit(){return q;},abortSignal(){return q;},maybeSingle(){single=true;return q;},then(resolve:(v:unknown)=>unknown){return Promise.resolve({data:single?data[0]??null:data,count:data.length,error:options.fail===table?{}:null}).then(resolve);}};return q;}} as unknown as SupabaseClient;
}
test("server status reads owned frozen habit criteria and never needs a mutation client",async()=>{
  const r=await loadStudyStatus(client(),owner,id,new Date("2026-08-28"));assert.equal(r.exposure.state,"adherent");assert.equal(r.exposure.eligible,2);assert.equal(r.intervention.name,"Walking");assert.equal(r.health,"Unable to determine");
  await assert.rejects(loadStudyStatus(client({foreign:true}),owner,id),/EXPERIMENT_NOT_FOUND/);
});
test("source changes, read failures, pause history and unsupported interventions remain unknown",async()=>{
  for(const options of [{changed:true},{paused:true},{fail:"planned_activity_occurrences"},{type:"protocol"},{type:"nutrition_target"},{type:"nutrition_pattern"},{type:"workout"}]){
    const r=await loadStudyStatus(client(options),owner,id,new Date("2026-08-28"));assert.equal(r.exposure.state,"unknown");assert.equal(r.health,"Unable to determine");
  }
});
test("status endpoint uses authenticated boundary, owned projection and no experiment mutation",()=>{
  const route=read("../../app/api/experiments/v2/status/route.ts"),server=read("./study-status.ts");assert.match(route,/experimentApi\("status"/);assert.match(read("./api.ts"),/budgetRoute: "http\/experiments\/draft"/);assert.match(server,/ownedExperiment/);assert.match(server,/snapshot_version===1/);assert.doesNotMatch(server,/\.rpc\(|\.insert\(|\.update\(|\.delete\(|ensureOccurrences/);
});
