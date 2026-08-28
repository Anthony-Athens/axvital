import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {database} from "../security/test-database.ts";
import {measurement} from "../measurements/registry.ts";
import {shiftDate} from "../measurements/time-window.ts";
import {reconcileLifecycle,type LifecycleEvidence,type LifecycleEvent} from "./lifecycle.ts";
import type {StoredCapture} from "./durable-evidence.ts";
const hook=(nodeModule as unknown as {registerHooks(h:{resolve:(s:string,c:unknown,next:(s:string,c:unknown)=>unknown)=>unknown}):{deregister():void}}).registerHooks({resolve(s,c,next){return s==="server-only"?{url:"data:text/javascript,export{}",shortCircuit:true}:next(s,c);}});
const {replayDurableCapture,publicAnalysis}=await import("./durable-evidence.ts");hook.deregister();
const A="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",B="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const cutoff="2026-08-23T12:00:00.000Z",start="2026-08-08T00:00:00.000Z",end="2026-08-22T00:00:00.000Z";
const rule={version:1,domain:"nutrition",kind:"numeric",metric:"protein_grams",operator:"gte",value:15,unit:"g",period:"day"};
const outcome={registry_key:"nutrition_protein_grams",registry_version:1,outcome_role:"primary",aggregation_method:"average",expected_direction:"increase",source_config:{},definition:measurement("nutrition_protein_grams",1)};
const frozen={model_version:2,baseline_mode:"historical",analysis_timezone:"UTC",baseline_start_date:"2026-08-01",baseline_end_date:"2026-08-07",intervention_start_date:"2026-08-08",intervention_end_date:"2026-08-21",outcomes:[outcome],intervention:{type:"nutrition_target",configuration:{id:B,revision:1,definition:rule}}};
function event(type:string,at:string,revision:number,from="active",to="completed",fromPhase="intervention",toPhase="complete"):LifecycleEvent {
  return {event_type:type,occurred_at:at,from_status:from,to_status:to,from_phase:fromPhase,to_phase:toPhase,metadata:{lifecycle_version:1,lifecycle_revision:revision,provenance:"v2_transition_rpc",config_revision:1}};
}
const startEvent:LifecycleEvent={event_type:"intervention_started",occurred_at:start,from_status:"draft",to_status:"active",from_phase:"planning",to_phase:"intervention",metadata:{model_version:2,config_revision:1}};
function life(events:LifecycleEvent[]=[event("completed",end,1)]):LifecycleEvidence{return {version:1,revision:events.length,actualStartedAt:start,actualCompletedAt:end,endedEarlyAt:null,events:[structuredClone(startEvent),...events]};}
function frame(first:string,length:number,value:number){
  const dates=Array.from({length},(_,i)=>shiftDate(first,i));return {start:first,end:shiftDate(first,length),checkins:dates.map(d=>({id:d,user_id:A,checkin_date:d,energy_score:7,mood_score:7,sleep_quality:"Good"})),nutrition:{version:1,truncated:false,entries:dates.map(d=>({id:d,user_id:A,consumed_at:`${d}T12:00:00Z`})),items:dates.map(d=>({id:d,nutrition_entry_id:d,protein_grams:value})),coverage:dates.map(d=>({local_date:d,time_zone:"UTC",coverage_status:"complete"}))}};
}
function raw(){return {captureVersion:1,analysisPolicyVersion:2,versions:{analysisContract:2,readinessPolicy:1,sourceAdapter:1,measurementRegistry:1,exposureContract:1,lifecycleContract:1},cutoff,experiment:{id:A,user_id:A,config_revision:1,model_version:2,status:"completed",current_phase:"complete",actual_started_at:start,actual_completed_at:end as string|null,ended_early_at:null as string|null},startSnapshot:{snapshot_version:1,config_revision:1,configuration:structuredClone(frozen)},events:life().events,baseline:frame("2026-08-01",7,10),intervention:frame("2026-08-08",14,20)};}
function stored(evidence=raw(),revision=1):StoredCapture {const evidence_text=JSON.stringify(evidence);return {analysis_revision:revision,config_revision:1,lifecycle_revision:evidence.events.length-1,analysis_policy_version:2,capture_version:1,captured_at:cutoff,evidence_text,digest:createHash("sha256").update(evidence_text).digest("hex")};}
test("lifecycle normal completion retains planned/actual bounds and complete days",()=>{
  const r=reconcileLifecycle(frozen,"completed","complete",life(),cutoff);assert.deepEqual(r.issues,[]);assert.equal(r.activeDates.length,14);assert.equal(r.actualEnd,end);assert.equal(r.plannedDays,14);
});
test("lifecycle early end uses authoritative end and excludes its partial day",()=>{
  const at="2026-08-16T12:00:00.000Z",e=life([event("ended_early",at,1,"active","ended_early","intervention","analysis")]);e.endedEarlyAt=at;e.actualCompletedAt=null;
  const r=reconcileLifecycle(frozen,"ended_early","analysis",e,cutoff);assert.deepEqual(r.issues,[]);assert.equal(r.activeDates.length,8);assert.equal(r.endDateExclusive,"2026-08-16");assert.equal(r.plannedDays,14);
});
for(const count of [1,2])test(`lifecycle ${count} closed pauses exclude touched dates without extending planned end`,()=>{
  const events:LifecycleEvent[]=[];for(let i=0;i<count;i++){events.push(event("paused",`2026-08-${10+i*4}T12:00:00.000Z`,events.length+1,"active","paused","intervention","intervention"));events.push(event("resumed",`2026-08-${11+i*4}T12:00:00.000Z`,events.length+1,"paused","active","intervention","intervention"));}events.push(event("completed",end,events.length+1));
  const r=reconcileLifecycle(frozen,"completed","complete",life(events),cutoff);assert.deepEqual(r.issues,[]);assert.equal(r.activeDates.length,14-2*count);assert.equal(r.excludedDates.length,2*count);assert.equal(r.endDateExclusive,"2026-08-22");
});
test("lifecycle open pause and unresolved end block analysis",()=>{
  const e=life([event("paused","2026-08-10T12:00:00.000Z",1,"active","paused","intervention","intervention")]);e.actualCompletedAt=null;
  const r=reconcileLifecycle(frozen,"paused","intervention",e,cutoff);assert.ok(r.issues.includes("OPEN_PAUSE"));assert.ok(r.issues.includes("AUTHORITATIVE_END_REQUIRED"));
});
test("lifecycle legacy, malformed, mismatched, missing-start and premature completion fail closed",()=>{
  for(const mutate of [(e:LifecycleEvidence)=>{e.events[1].metadata=null;},(e:LifecycleEvidence)=>{e.revision=3;},(e:LifecycleEvidence)=>{e.events[1].from_status="paused";},(e:LifecycleEvidence)=>{e.events.shift();},(e:LifecycleEvidence)=>{e.actualCompletedAt="2026-08-15T00:00:00.000Z";}]){const e=life();mutate(e);assert.ok(reconcileLifecycle(frozen,"completed","complete",e,cutoff).issues.length);}
});
test("lifecycle abandoned and archived are classified, not spoofed as active",()=>{
  const abandoned=life([event("abandoned",end,1,"active","abandoned")]);assert.ok(reconcileLifecycle(frozen,"abandoned","complete",abandoned,cutoff).issues.includes("UNSUPPORTED_TERMINAL_STATE"));
  const archived=life([event("completed",end,1),event("archived",cutoff,2,"completed","archived","complete","complete")]);assert.ok(reconcileLifecycle(frozen,"archived","complete",archived,cutoff).issues.includes("UNSUPPORTED_TERMINAL_STATE"));
});
test("durable terminal nutrition replay is ready and source-independent",async()=>{
  const source=raw(),capture=stored(source),before=await replayDurableCapture(capture);assert.equal(before.result.eligibility.state,"ready",JSON.stringify(before.result.eligibility));assert.ok(Math.abs(before.result.facts!.absoluteChange!-10)<1e-10);assert.equal(before.result.analysisPolicyVersion,2);
  source.intervention.nutrition.items[0].protein_grams=900;source.baseline.nutrition.entries=[];
  assert.deepEqual(await replayDurableCapture(capture),before);assert.deepEqual(await replayDurableCapture(JSON.parse(JSON.stringify(capture))),before);
});
test("durable early-ended and pause-adjusted populations align outcome and exposure denominators",async()=>{
  const source=raw(),at="2026-08-18T12:00:00.000Z";source.experiment.status="ended_early";source.experiment.current_phase="analysis";source.experiment.actual_completed_at=null;source.experiment.ended_early_at=at;
  source.events=[startEvent,event("paused","2026-08-10T12:00:00.000Z",1,"active","paused","intervention","intervention"),event("resumed","2026-08-11T12:00:00.000Z",2,"paused","active","intervention","intervention"),event("ended_early",at,3,"active","ended_early","intervention","analysis")];source.intervention=frame("2026-08-08",10,20);
  const result=(await replayDurableCapture(stored(source))).result;assert.equal(result.eligibility.state,"ready",JSON.stringify(result.eligibility));assert.equal(result.outcomeQuality.intervention.expectedObservations,8);assert.equal(result.outcomeQuality.intervention.eligibleObservations,8);assert.equal(result.exposureQuality?.eligibleOpportunityCount,8);assert.equal(result.exposureQuality?.nonAdherentCount,0);assert.ok(result.limitations.includes("PAUSE_TOUCHED_DAYS_EXCLUDED"));
});
test("durable digest, policy and metadata tampering is rejected",async()=>{
  const capture=stored();await assert.rejects(()=>replayDurableCapture({...capture,evidence_text:capture.evidence_text+" "}),/CAPTURE_INTEGRITY_MISMATCH/);await assert.rejects(()=>replayDurableCapture({...capture,analysis_policy_version:99}),/CAPTURE_INTEGRITY_MISMATCH/);await assert.rejects(()=>replayDurableCapture({...capture,config_revision:2}),/CAPTURE_METADATA_MISMATCH/);
});
test("safe result projection carries revisions and facts, not private capture identifiers or observations",async()=>{
  const bundle=await replayDurableCapture(stored()),dto=publicAnalysis(bundle.result,1),encoded=JSON.stringify(dto);assert.equal(dto.analysisRevision,1);assert.doesNotMatch(encoded,/sourceId|frozenSourceId|evidence_text|inputDigest|opportunities|observedDates|actual_started_at/);assert.ok(!encoded.includes(A));
  assert.match(readFileSync(new URL("durable-evidence.ts",import.meta.url),"utf8"),/^import "server-only"/);
});
test("pause boundaries at midnight exclude precisely the paused day",()=>{
  const events=[event("paused","2026-08-10T00:00:00.000Z",1,"active","paused","intervention","intervention"),event("resumed","2026-08-11T00:00:00.000Z",2,"paused","active","intervention","intervention"),event("completed",end,3)];
  const r=reconcileLifecycle(frozen,"completed","complete",life(events),cutoff);assert.deepEqual(r.excludedDates,["2026-08-10"]);assert.equal(r.activeDates.length,13);
});
test("partial actual start excludes first day without marking it missing",async()=>{
  const source=raw();source.experiment.actual_started_at="2026-08-08T12:00:00.000Z";source.events[0].occurred_at=source.experiment.actual_started_at;
  const result=(await replayDurableCapture(stored(source))).result;assert.equal(result.eligibility.state,"ready");assert.equal(result.outcomeQuality.intervention.expectedObservations,13);assert.equal(result.outcomeQuality.intervention.missingObservations,0);assert.equal(result.exposureQuality?.eligibleOpportunityCount,13);
});
test("sub-millisecond start provenance cannot accidentally include a partial day",async()=>{
  const source=raw();source.experiment.actual_started_at="2026-08-08T00:00:00.000001Z";source.events[0].occurred_at=source.experiment.actual_started_at;
  const result=(await replayDurableCapture(stored(source))).result;assert.equal(result.eligibility.state,"ready");assert.equal(result.outcomeQuality.intervention.expectedObservations,13);
});
test("source truncation remains unavailable in a durable capture",async()=>{
  const source=raw();source.baseline.nutrition.truncated=true;const result=(await replayDurableCapture(stored(source))).result;assert.equal(result.eligibility.state,"unable_to_determine");assert.equal(result.facts,null);
});
test("durable check-in ordinal outcomes use retained adapters and not mutable reads",async()=>{
  const source=raw();Object.assign(source.startSnapshot.configuration.outcomes[0],{registry_key:"energy_score",definition:measurement("energy_score",1)});
  const result=(await replayDurableCapture(stored(source))).result;assert.equal(result.eligibility.state,"ready",JSON.stringify(result.eligibility));assert.equal(result.facts?.intervention.kind,"ordinal");
});
test("unsupported retained version and legacy pause history cannot yield facts",async()=>{
  const source=raw();source.versions.sourceAdapter=99;await assert.rejects(()=>replayDurableCapture(stored(source)),/CAPTURE_VERSION_UNSUPPORTED/);
  source.versions.sourceAdapter=1;source.events[1].metadata=null;assert.equal((await replayDurableCapture(stored(source))).result.facts,null);
});

test("Postgres durable capture isolation, immutability, explicit revisions, replay after edits/deletes and account export",async()=>{
  const db=await database();
  try {
    // Synthetic historical records are inserted by the test migration role only;
    // no public RPC accepts backdated lifecycle timestamps or evidence payloads.
    const e=raw();
    await db.query("insert into public.experiments(id,user_id,name,hypothesis,model_version,config_revision,status,current_phase,actual_started_at,analysis_timezone,baseline_mode,baseline_start_date,baseline_end_date,intervention_start_date,intervention_end_date) values($1,$1,'Synthetic study','Synthetic historical study for testing',2,1,'active','intervention',$2,'UTC','historical','2026-08-01','2026-08-07','2026-08-08','2026-08-21')",[A,start]);
    await db.query("insert into public.experiment_start_snapshots(user_id,experiment_id,config_revision,snapshot_version,configuration,source_fingerprint) values($1,$1,1,1,$2,'test')",[A,JSON.stringify(e.startSnapshot.configuration)]);
    for(const ev of e.events.slice(0,1))await db.query("insert into public.experiment_phase_events(experiment_id,user_id,event_type,occurred_at,from_status,to_status,from_phase,to_phase,metadata) values($1,$1,$2,$3,$4,$5,$6,$7,$8)",[A,ev.event_type,ev.occurred_at,ev.from_status,ev.to_status,ev.from_phase,ev.to_phase,JSON.stringify(ev.metadata)]);
    await db.exec(`select set_config('request.jwt.claim.sub','${A}',false);set role authenticated;`);
    await db.exec(`insert into public.nutrition_entries(user_id,title,consumed_at) select '${A}','Synthetic',d+interval '12 hours' from generate_series('2026-08-01'::timestamp,'2026-08-21'::timestamp,interval '1 day') d;
      insert into public.nutrition_entry_items(nutrition_entry_id,source_name,protein_grams,food_id,food_serving_id,serving_name_snapshot,serving_quantity_snapshot,serving_unit_snapshot) select e.id,'Synthetic',case when e.consumed_at<'2026-08-08' then 10 else 20 end,f.food_id,f.id,'portion',1,'g' from public.nutrition_entries e cross join (select id,food_id from public.food_servings limit 1) f where user_id='${A}';
      insert into public.nutrition_log_days(user_id,local_date,time_zone,coverage_status) select '${A}',d::date,'UTC','complete' from generate_series('2026-08-01'::timestamp,'2026-08-21'::timestamp,interval '1 day') d;`);
    await db.query("select public.transition_experiment_v2($1,0,'complete')",[A]);
    await db.query("select public.capture_experiment_evidence_v1($1,0,1)",[A]);
    const first=(await db.query<StoredCapture>("select * from public.experiment_evidence_captures where experiment_id=$1",[A])).rows[0];
    const result=await replayDurableCapture(first);assert.equal(result.result.eligibility.state,"ready",JSON.stringify(result.result.eligibility));
    await assert.rejects(db.query("select public.capture_experiment_evidence_v1($1,0,1)",[A]),/CAPTURE_REVISION_CONFLICT/);
    await assert.rejects(db.query("update public.experiment_evidence_captures set evidence_text='{}' where experiment_id=$1",[A]),/permission denied/);
    await assert.rejects(db.query("delete from public.experiment_evidence_captures where experiment_id=$1",[A]),/permission denied/);
    await assert.rejects(db.query("select public.axvital_experiment_capture_input($1,now())",[A]),/permission denied/);
    await db.exec(`update public.nutrition_entry_items set protein_grams=999;delete from public.nutrition_entries where consumed_at<'2026-08-08';`);
    assert.deepEqual(await replayDurableCapture(first),result);
    await db.query("select public.capture_experiment_evidence_v1($1,1,1)",[A]);
    const second=(await db.query<StoredCapture>("select * from public.experiment_evidence_captures where experiment_id=$1 and analysis_revision=2",[A])).rows[0];assert.notEqual(second.digest,first.digest);assert.equal((await replayDurableCapture(second)).result.facts,null);
    const exported=(await db.query<{value:{data:Record<string,unknown[]>}}>("select public.axvital_export_account() value")).rows[0].value;assert.equal(exported.data.experiment_evidence_captures.length,2);
    await db.exec(`reset role;select set_config('request.jwt.claim.sub','${B}',false);set role authenticated;`);
    assert.equal((await db.query("select * from public.experiment_evidence_captures")).rows.length,0);
    await assert.rejects(db.query("select public.capture_experiment_evidence_v1($1,2,1)",[A]),/EXPERIMENT_NOT_FOUND/);
    await assert.rejects(db.query("select public.transition_experiment_v2($1,1,'archive')",[A]),/EXPERIMENT_NOT_FOUND/);
    await db.exec(`reset role;select set_config('request.jwt.claim.sub','${A}',false);set role authenticated;`);
    await db.query("select public.transition_experiment_v2($1,1,'archive')",[A]);
    assert.deepEqual(await replayDurableCapture(first),result);
    await assert.rejects(db.query("select public.capture_experiment_evidence_v1($1,2,2)",[A]),/UNSUPPORTED_CAPTURE_DESIGN/);
    // Account erasure must remove durable evidence despite its immutable guard.
    await db.exec("reset role");await db.query("select public.axvital_begin_account_deletion($1)",[A]);await db.query("update public.account_deletions set billing_closed=true where user_id=$1",[A]);await db.query("delete from auth.users where id=$1",[A]);
    assert.equal((await db.query("select * from public.experiment_evidence_captures")).rows.length,0);assert.equal((await db.query("select * from auth.users where id=$1",[B])).rows.length,1);
  } finally {await db.close();}
});

test("Postgres v2 transition ledger records server timestamps, revisions, and exact prior states",async()=>{
  const db=await database();try {
    const config={...frozen,intervention_start_date:"2026-08-08",intervention_end_date:"2099-01-01"};
    await db.query("insert into public.experiments(id,user_id,name,hypothesis,model_version,config_revision,status,current_phase,actual_started_at,analysis_timezone,baseline_mode,intervention_start_date,intervention_end_date) values($1,$1,'Synthetic','Synthetic transition test study',2,1,'active','intervention',$2,'UTC','historical','2026-08-08','2099-01-01')",[A,start]);
    await db.query("insert into public.experiment_start_snapshots(user_id,experiment_id,config_revision,snapshot_version,configuration,source_fingerprint) values($1,$1,1,1,$2,'test')",[A,JSON.stringify(config)]);
    await db.query("insert into public.experiment_phase_events(experiment_id,user_id,event_type,occurred_at,from_status,to_status,from_phase,to_phase,metadata) values($1,$1,'intervention_started',$2,'draft','active','planning','intervention',$3)",[A,start,JSON.stringify(startEvent.metadata)]);
    await db.exec(`select set_config('request.jwt.claim.sub','${A}',false);set role authenticated;`);
    await assert.rejects(db.query("select public.transition_experiment_v2($1,0,'complete')",[A]),/PLANNED_PERIOD_NOT_FINISHED/);
    await db.query("select public.transition_experiment_v2($1,0,'pause')",[A]);
    await assert.rejects(db.query("select public.transition_experiment_v2($1,0,'resume')",[A]),/LIFECYCLE_REVISION_CONFLICT/);
    await assert.rejects(db.query("select public.transition_experiment_v2($1,1,'end_early')",[A]),/INVALID_TRANSITION/);
    await db.query("select public.transition_experiment_v2($1,1,'resume')",[A]);
    await db.query("select public.transition_experiment_v2($1,2,'end_early')",[A]);
    const events=(await db.query<LifecycleEvent>("select * from public.experiment_phase_events where experiment_id=$1 and event_type<>'intervention_started' order by (metadata->>'lifecycle_revision')::int",[A])).rows;
    assert.deepEqual(events.map(e=>[e.event_type,e.from_status,e.to_status,e.metadata?.lifecycle_revision]),[["paused","active","paused",1],["resumed","paused","active",2],["ended_early","active","ended_early",3]]);
    assert.ok(events.every(e=>e.metadata?.provenance==="v2_transition_rpc"));
    await assert.rejects(db.query("insert into public.experiment_phase_events(experiment_id,user_id,event_type) values($1,$1,'resumed')",[A]),/USE_V2_TRANSACTION/);
    await db.exec("reset role;set role anon;");await assert.rejects(db.query("select public.transition_experiment_v2($1,3,'archive')",[A]),/permission denied/);
  }finally{await db.close();}
});
