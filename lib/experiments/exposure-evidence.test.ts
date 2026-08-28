import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import {readFileSync} from "node:fs";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {NutritionDay} from "../measurements/observations.ts";
import {evaluateFrozenNutritionDay,supportedFrozenTarget,supportedNutritionExposure} from "../nutrition/frozen-target.ts";
import {closedDates,frozenHabitDates,habitOpportunities,presentExposure} from "./exposure-evidence.ts";

const hook=(nodeModule as unknown as {registerHooks(h:{resolve:(s:string,c:unknown,next:(s:string,c:unknown)=>unknown)=>unknown}):{deregister():void}}).registerHooks({resolve(s,c,next){return s==="server-only"?{url:"data:text/javascript,export{}",shortCircuit:true}:next(s,c);}});
const {readExposureEvidence}=await import("./exposure-reader.ts");
const {loadStudyStatus}=await import("./study-status.ts");hook.deregister();
type Row=Record<string,unknown>;
const owner="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",id="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",sourceId="cccccccc-cccc-4ccc-cccc-cccccccccccc";
const now=new Date("2026-08-28T12:00:00Z");
const rule={version:1,domain:"nutrition",kind:"numeric",metric:"protein_grams",operator:"gte",value:100,unit:"g",period:"day"};
const habit={id:sourceId,name:"Walking",activity_type:"habit",tracking_type:"binary",target_value:null,target_unit:null,minimum_value:null,allow_partial_completion:false,recurrence_type:"specific_days",days_of_week:[1,3,5],interval_days:null,start_date:"2026-08-24",end_date:null,scheduled_time:null,is_active:true};
const day:NutritionDay={logicalDate:"2026-08-24",entryCount:1,knownItemCount:1,unknownItemCount:0,hasItems:true,fieldComplete:true,coverageStatus:"complete",subtotal:110};
type Options={type?:string;source?:Row;phase?:string;status?:string;revision?:number;snapshotRevision?:number;missingSnapshot?:boolean;missingSource?:boolean;changed?:boolean;changedDuringRead?:boolean;paused?:boolean;fail?:string;truncated?:boolean;countMissing?:boolean;occurrences?:Row[];workouts?:Row[];nutrition?:{entries:Row[];items:Row[];coverage:Row[];truncated:boolean};primary?:boolean};
function fixture(options:Options={}) {
  const type=options.type??"habit",source=options.source??(type==="habit"?habit:type==="nutrition_target"?{id:sourceId,name:"Protein",revision:1,definition:rule}:type==="workout"?{id:sourceId,name:"Strength",prescribed_exercises:[{exercise_id:id}]}:{id:sourceId,name:"Unsupported",revision:1,members:[{...habit,is_required:true}]});
  const experiment:Row={id,user_id:owner,name:"Controlled experiment",model_version:2,config_revision:options.revision??2,status:options.status??"active",current_phase:options.phase??"intervention"};
  const snapshot={user_id:owner,experiment_id:id,snapshot_version:1,config_revision:options.snapshotRevision??2,configuration:{question:"Does the frozen change appear associated with energy?",analysis_timezone:"UTC",intervention_start_date:"2026-08-24",intervention_end_date:"2026-08-30",intervention:{type,configuration:source},outcomes:options.primary?[{registry_key:"energy_score",registry_version:1,outcome_role:"primary",aggregation_method:"average",expected_direction:"unknown",source_config:{},definition:{label:"Energy",sourceAdapter:"checkins"}}]:[]}};
  const tables:Record<string,Row[]>={experiments:[experiment],experiment_start_snapshots:options.missingSnapshot?[]:[snapshot],planned_activities:options.missingSource?[]:[{...habit,user_id:owner,title:options.changed?"Edited":habit.name}],planned_activity_occurrences:(options.occurrences??[{scheduled_date:"2026-08-24",status:"completed"},{scheduled_date:"2026-08-26",status:"skipped"}]).map(r=>({...r,user_id:owner,planned_activity_id:sourceId})),planned_workouts:(options.workouts??[]).map(r=>({...r,user_id:owner,workout_template_id:sourceId})),experiment_phase_events:options.paused?[{id,user_id:owner,experiment_id:id,event_type:"paused"}]:[],daily_checkins:[]};
  const calls:{name:string;args?:Record<string,unknown>}[]=[];let liveReads=0;
  const client={auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},rpc(name:string,args:Record<string,unknown>){calls.push({name,args});assert.equal(name,"read_nutrition_observations_v1");return{abortSignal(){return this;},then(resolve:(v:unknown)=>unknown){return Promise.resolve({data:{version:1,...(options.nutrition??nutrition()),truncated:options.truncated??options.nutrition?.truncated??false},error:options.fail===name?{}:null}).then(resolve);}};},from(name:string){calls.push({name});let rows=[...(tables[name]??[])],single=false,limit=Infinity;
    if(name==="planned_activities"&&++liveReads>1&&options.changedDuringRead)rows=rows.map(r=>({...r,title:"Changed during read"}));
    const q={select(){return q;},eq(k:string,v:unknown){rows=rows.filter(r=>r[k]===v);return q;},gte(k:string,v:string){rows=rows.filter(r=>String(r[k])>=v);return q;},lte(k:string,v:string){rows=rows.filter(r=>String(r[k])<=v);return q;},lt(k:string,v:string){rows=rows.filter(r=>String(r[k])<v);return q;},order(){return q;},limit(n:number){limit=n;return q;},abortSignal(){return q;},maybeSingle(){single=true;return q;},then(resolve:(v:unknown)=>unknown){return Promise.resolve({data:single?rows[0]??null:rows.slice(0,limit),error:options.fail===name?{}:null,count:options.countMissing?null:options.truncated?rows.length+1:rows.length}).then(resolve);}};return q;}} as unknown as SupabaseClient;
  return {client,experiment,snapshot,calls,read:()=>readExposureEvidence(client,owner,experiment,options.missingSnapshot?null:snapshot,now)};
}
function nutrition(values:(number|null)[]=[110,90,100,120],coverage="complete") {
  const dates=closedDates("2026-08-24","2026-08-28");
  return {entries:dates.map((d,i)=>({id:`entry${i}`,user_id:owner,consumed_at:`${d}T12:00:00Z`})),items:dates.map((_,i)=>({id:`item${i}`,nutrition_entry_id:`entry${i}`,protein_grams:values[i]})),coverage:dates.map(d=>({local_date:d,time_zone:"UTC",coverage_status:coverage})),truncated:false};
}
test("shared evidence exposes explicit contract identity, counts, phase and dated states",async()=>{
  const e=await fixture().read();assert.equal(e.contractVersion,1);assert.equal(e.frozenSourceId,sourceId);assert.equal(e.experimentRevision,2);assert.equal(e.phase,"intervention");assert.equal(e.eligibleOpportunityCount,2);assert.equal(e.adherentCount,1);assert.equal(e.nonAdherentCount,1);assert.equal(e.unknownCount,0);assert.equal(e.classification,"non-adherent");assert.equal(e.opportunities.length,2);assert.equal(presentExposure(e).skipped,1);
});
test("all confirmed opportunities yield adherent; absent records remain unknown",async()=>{
  const all=await fixture({occurrences:[{scheduled_date:"2026-08-24",status:"completed"},{scheduled_date:"2026-08-26",status:"completed"}]}).read();assert.equal(all.classification,"adherent");
  const absent=await fixture({occurrences:[]}).read();assert.equal(absent.classification,"unknown");assert.equal(absent.nonAdherentCount,0);assert.equal(absent.unknownCount,2);
});
test("duplicate habit evidence gets no duplicate credit and remains unknown",async()=>{
  const e=await fixture({occurrences:[{scheduled_date:"2026-08-24",status:"completed"},{scheduled_date:"2026-08-24",status:"completed"}]}).read();assert.equal(e.adherentCount,0);assert.equal(e.unknownCount,2);
});
test("frozen recurrence excludes off-days, today and future days from the denominator",async()=>{
  const e=await fixture({occurrences:[{scheduled_date:"2026-08-25",status:"skipped"},{scheduled_date:"2026-08-28",status:"completed"},{scheduled_date:"2026-08-31",status:"completed"}]}).read();assert.deepEqual(e.opportunities.map(o=>o.date),["2026-08-24","2026-08-26"]);assert.equal(e.nonAdherentCount,0);assert.match(e.today,/complete/);
});
test("daily/interval recurrence and empty schedules retain precise bounded semantics",()=>{
  assert.equal(frozenHabitDates({...habit,recurrence_type:"daily"},"2026-08-24","2026-08-28").length,4);
  assert.deepEqual(frozenHabitDates({...habit,recurrence_type:"interval",interval_days:3},"2026-08-24","2026-08-28"),["2026-08-24","2026-08-27"]);
  assert.deepEqual(habitOpportunities([],[]),[]);assert.throws(()=>closedDates("2020-01-01","2026-08-28"));assert.throws(()=>frozenHabitDates({...habit,recurrence_type:"unsupported"},"2026-08-24","2026-08-28"));
});
test("empty eligible denominator is not automatic adherence",async()=>{
  const e=await fixture({source:{...habit,recurrence_type:"none",start_date:"2026-08-30"}}).read();assert.equal(e.eligibleOpportunityCount,0);assert.equal(e.classification,"unknown");
});
test("changed, missing and concurrently edited habit sources suppress classification",async()=>{
  for(const options of [{changed:true},{missingSource:true},{changedDuringRead:true}]){const e=await fixture(options).read();assert.equal(e.classification,"unknown");assert.equal(e.adherentCount,0);assert.ok(["mismatch","unavailable"].includes(e.sourceIntegrity));}
});
test("failed, truncated and missing-count reads never credit partial habit evidence",async()=>{
  for(const options of [{fail:"planned_activity_occurrences"},{truncated:true},{countMissing:true}]){const e=await fixture(options).read();assert.equal(e.evidenceCompleteness,"incomplete");assert.equal(e.adherentCount,0);assert.equal(e.unknownCount,2);}
});
test("missing snapshot or revision mismatch cannot reach source reads",async()=>{
  for(const options of [{missingSnapshot:true},{snapshotRevision:1},{revision:3}]){const f=fixture(options),e=await f.read();assert.equal(e.sourceIntegrity,"unavailable");assert.equal(e.eligibleOpportunityCount,null);assert.equal(f.calls.length,0);}
});
test("baseline/planning have no intervention opportunities and advanced phases remain unsupported",async()=>{
  for(const phase of ["baseline","planning"]){const f=fixture({phase}),e=await f.read();assert.equal(e.denominator,"not_applicable");assert.equal(e.eligibleOpportunityCount,0);assert.equal(f.calls.length,0);}
  assert.equal((await fixture({phase:"washout"}).read()).eligibleOpportunityCount,null);
});
test("pause events, paused state and incomplete pause reads force unknown denominator",async()=>{
  for(const options of [{paused:true},{status:"paused"},{fail:"experiment_phase_events"}]){const e=await fixture(options).read();assert.equal(e.pauseState,"unknown");assert.equal(e.eligibleOpportunityCount,null);assert.equal(e.classification,"unknown");}
});
test("frozen nutrition target supports min/max/equality with exact rule validation",()=>{
  assert.equal(evaluateFrozenNutritionDay(rule,day,true).state,"adherent");assert.equal(evaluateFrozenNutritionDay(rule,{...day,subtotal:90},true).state,"non-adherent");
  assert.equal(evaluateFrozenNutritionDay({...rule,operator:"lte"},day,true).state,"non-adherent");assert.equal(evaluateFrozenNutritionDay({...rule,operator:"eq"},{...day,subtotal:100},true).state,"adherent");
  assert.equal(supportedNutritionExposure.metrics.length,5);assert.equal(supportedFrozenTarget({...rule,unit:"kcal"}),null);
});
test("incomplete logging, unknown nutrient, empty day and failed read remain unknown even above minimum",()=>{
  for(const value of [undefined,{...day,coverageStatus:"partial" as const},{...day,fieldComplete:false},{...day,unknownItemCount:1},{...day,hasItems:false},{...day,subtotal:null},{...day,subtotal:NaN}])assert.equal(evaluateFrozenNutritionDay(rule,value,true).state,"unknown");
  assert.equal(evaluateFrozenNutritionDay(rule,day,false).state,"unknown");
});
test("unsupported exclusion, cutoff, alcohol occurrence, range and future rule versions remain unknown",()=>{
  for(const value of [{...rule,kind:"range"},{...rule,version:2},{...rule,metric:"alcohol_occurrences",unit:"count"},{version:1,domain:"nutrition",kind:"exclusion",metric:"food_classification",operator:"excludes",classification:"dairy",period:"day"},{version:1,domain:"nutrition",kind:"cutoff",metric:"food_time",operator:"not_after",local_time:"20:00",time_zone:"UTC",period:"day"}])assert.equal(evaluateFrozenNutritionDay(value,day,true).state,"unknown");
});
test("nutrition reader evaluates four eligible days through existing atomic source adapter",async()=>{
  const f=fixture({type:"nutrition_target"}),e=await f.read();assert.equal(e.eligibleOpportunityCount,4);assert.equal(e.adherentCount,3);assert.equal(e.nonAdherentCount,1);assert.equal(e.unknownCount,0);assert.equal(e.sourceIntegrity,"frozen_definition_verified");assert.equal(e.frozenRevision,1);assert.ok(f.calls.some(c=>c.name==="read_nutrition_observations_v1"));
  assert.equal(f.calls.some(c=>c.name==="target_rules"),false);
});
test("frozen numeric criteria, not later mutable target settings, determine nutrition state",async()=>{
  const f=fixture({type:"nutrition_target",source:{id:sourceId,revision:1,definition:{...rule,value:80}}}),e=await f.read();assert.equal(e.classification,"adherent");assert.equal(f.calls.some(c=>c.name==="target_rules"),false);
});
test("nutrition partial logging, missing values and truncated snapshots suppress definitive daily evidence",async()=>{
  for(const options of [{nutrition:nutrition([110,90,100,120],"partial")},{nutrition:nutrition([null,null,null,null])},{truncated:true},{fail:"read_nutrition_observations_v1"}]){const e=await fixture({type:"nutrition_target",...options}).read();assert.equal(e.classification,"unknown");assert.equal(e.adherentCount,0);assert.equal(e.nonAdherentCount,0);assert.equal(e.unknownCount,4);}
});
test("duplicate nutrition items fail the adapter and never receive repeated credit",async()=>{
  const data=nutrition();data.items.push(data.items[0]);const e=await fixture({type:"nutrition_target",nutrition:data}).read();assert.equal(e.unknownCount,4);assert.equal(e.adherentCount,0);
});
test("protocol required/optional semantics are not replaced with an invented aggregate",async()=>{
  for(const required of [true,false]){const e=await fixture({type:"protocol",source:{id:sourceId,members:[{...habit,is_required:required}]}}).read();assert.equal(e.evidenceCompleteness,"unsupported");assert.equal(e.eligibleOpportunityCount,null);assert.match(e.warnings.join(" "),/Optional-item completion cannot prove required exposure/);}
});
test("protocol missing historical membership and ambiguous pauses stay unknown",async()=>{
  assert.equal((await fixture({type:"protocol",source:{id:sourceId,members:[]}}).read()).classification,"unknown");assert.equal((await fixture({type:"protocol",paused:true}).read()).pauseState,"unknown");
});
test("frozen nutrition pattern does not fabricate a heuristic whole-pattern score",async()=>{
  const e=await fixture({type:"nutrition_pattern",source:{id:sourceId,revision:1,rules:[{definition:rule}]}}).read();assert.equal(e.classification,"unknown");assert.equal(e.eligibleOpportunityCount,null);assert.match(e.warnings.join(" "),/composition/);
});
test("workout opportunities are recorded schedules, never calendar-day denominators",async()=>{
  const e=await fixture({type:"workout",workouts:[{id:"one",scheduled_date:"2026-08-24",status:"completed"},{id:"two",scheduled_date:"2026-08-26",status:"skipped"},{id:"today",scheduled_date:"2026-08-28",status:"completed"},{id:"cancel",scheduled_date:"2026-08-25",status:"cancelled"}]}).read();assert.equal(e.denominator,"recorded_workout_schedule");assert.equal(e.eligibleOpportunityCount,2);assert.equal(e.unknownCount,2);assert.equal(e.nonAdherentCount,0);assert.match(e.opportunities[0].reason,/unverified/);assert.match(e.opportunities[1].reason,/explicitly skipped/);
});
test("duplicate or truncated workout schedule cannot yield false denominator precision",async()=>{
  const row={id:"one",scheduled_date:"2026-08-24",status:"completed"};
  for(const options of [{workouts:[row,row]},{workouts:[row],truncated:true}]){const e=await fixture({type:"workout",...options}).read();assert.equal(e.eligibleOpportunityCount,null);assert.equal(e.classification,"unknown");}
});
test("status service consumes shared nutrition evidence and preserves non-efficacy health",async()=>{
  const f=fixture({type:"nutrition_target"}),r=await loadStudyStatus(f.client,owner,id,now);assert.equal(r.exposureEvidence?.nonAdherentCount,1);assert.equal(r.exposure.skipped,null);assert.equal(r.exposure.state,"non-adherent");assert.equal(r.health,"Unable to determine");assert.notEqual(r.completeness.state,"complete");
});
test("exposure implementation stays read-only and React contains no rule evaluator",()=>{
  const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8"),server=read("./exposure-reader.ts"),ui=read("../../components/experiments/ActiveStudyStatus.tsx");assert.doesNotMatch(server,/\.insert\(|\.update\(|\.delete\(|ensureOccurrences|start_experiment/);assert.match(read("./study-status.ts"),/readExposureEvidence/);assert.doesNotMatch(ui,/evaluateFrozenNutritionDay|habitOpportunities|readExposureEvidence|supportedFrozenTarget/);assert.match(ui,/non-adherent/);assert.doesNotMatch(ui,/explicitly skipped/);
});
