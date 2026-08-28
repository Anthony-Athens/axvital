import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {normalizeBodyWeight,KG_PER_LB} from "./body-weight.ts";
import {measurement} from "./registry.ts";
import {database} from "../security/test-database.ts";
import type {StoredCapture} from "../experiments/durable-evidence.ts";
import {testHooks} from "../experiments/testing/tsx-hooks.ts";
const hooks=testHooks();
const {fixtureCapture}=await import("../experiments/testing/results-fixture.ts");
const {replayDurableCapture}=await import("../experiments/durable-evidence.ts");
const {retainedResultsDisplay}=await import("../experiments/results-display.ts");
const {discoverOutcomes}=await import("../experiments/discovery.ts");
const {chooseOutcome}=await import("../experiments/wizard-client.ts");
hooks.deregister();
const A="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",B="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
test("Postgres weight capture retains unit proof across edits/deletes, revisions, export and RLS",async()=>{
  const db=await database();
  try {
    // Synthetic historical records are inserted by the test migration role only;
    // no public RPC accepts backdated lifecycle timestamps or evidence payloads.
    const e=fixtureCapture("body_weight").raw;const start=e.experiment.actual_started_at;
    await db.query("insert into public.experiments(id,user_id,name,hypothesis,model_version,config_revision,status,current_phase,actual_started_at,analysis_timezone,baseline_mode,baseline_start_date,baseline_end_date,intervention_start_date,intervention_end_date) values($1,$1,'Synthetic study','Synthetic historical study for testing',2,1,'active','intervention',$2,'UTC','historical','2026-08-01','2026-08-07','2026-08-08','2026-08-21')",[A,start]);
    await db.query("insert into public.experiment_start_snapshots(user_id,experiment_id,config_revision,snapshot_version,configuration,source_fingerprint) values($1,$1,1,1,$2,'test')",[A,JSON.stringify(e.startSnapshot.configuration)]);
    for(const ev of e.events.slice(0,1))await db.query("insert into public.experiment_phase_events(experiment_id,user_id,event_type,occurred_at,from_status,to_status,from_phase,to_phase,metadata) values($1,$1,$2,$3,$4,$5,$6,$7,$8)",[A,ev.event_type,ev.occurred_at,ev.from_status,ev.to_status,ev.from_phase,ev.to_phase,JSON.stringify(ev.metadata)]);
    await db.exec(`select set_config('request.jwt.claim.sub','${A}',false);set role authenticated;`);
    await db.exec(`insert into public.nutrition_entries(user_id,title,consumed_at) select '${A}','Synthetic',d+interval '12 hours' from generate_series('2026-08-01'::timestamp,'2026-08-21'::timestamp,interval '1 day') d;
      insert into public.nutrition_entry_items(nutrition_entry_id,source_name,protein_grams,food_id,food_serving_id,serving_name_snapshot,serving_quantity_snapshot,serving_unit_snapshot) select e.id,'Synthetic',case when e.consumed_at<'2026-08-08' then 10 else 20 end,f.food_id,f.id,'portion',1,'g' from public.nutrition_entries e cross join (select id,food_id from public.food_servings limit 1) f where user_id='${A}';
      insert into public.nutrition_log_days(user_id,local_date,time_zone,coverage_status) select '${A}',d::date,'UTC','complete' from generate_series('2026-08-01'::timestamp,'2026-08-21'::timestamp,interval '1 day') d;`);
    await db.exec(`insert into public.daily_checkins(user_id,checkin_date,weight_source_value,weight_source_unit,weight_provenance_version) select '${A}',d::date,case when d<'2026-08-08' then 180 else 175 end,'lb',1 from generate_series('2026-08-01'::timestamp,'2026-08-21'::timestamp,interval '1 day') d;`);
    await db.query("select public.transition_experiment_v2($1,0,'complete')",[A]);
    await db.query("select public.capture_experiment_evidence_v1($1,0,1)",[A]);
    const first=(await db.query<StoredCapture>("select * from public.experiment_evidence_captures where experiment_id=$1",[A])).rows[0];
    const result=await replayDurableCapture(first);assert.equal(result.result.eligibility.state,"ready",JSON.stringify(result.result.eligibility));
    await assert.rejects(db.query("select public.capture_experiment_evidence_v1($1,0,1)",[A]),/CAPTURE_REVISION_CONFLICT/);
    await assert.rejects(db.query("update public.experiment_evidence_captures set evidence_text='{}' where experiment_id=$1",[A]),/permission denied/);
    await assert.rejects(db.query("delete from public.experiment_evidence_captures where experiment_id=$1",[A]),/permission denied/);
    await assert.rejects(db.query("select public.axvital_experiment_capture_input($1,now())",[A]),/permission denied/);
    await db.exec(`update public.daily_checkins set weight_source_value=999 where checkin_date>='2026-08-08';delete from public.daily_checkins where checkin_date<'2026-08-08';`);
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
const verified=(value=180,unit="lb")=>({weight:value,weight_source_value:value,weight_source_unit:unit,weight_provenance_version:1,weight_kg:value*(unit==="lb"?KG_PER_LB:1)});
test("weight explicit normalization, corrupt values and provenance are never inferred",()=>{
 assert.equal(normalizeBodyWeight(verified()).value,81.6466266);
 assert.equal(normalizeBodyWeight(verified(81.6466266,"kg")).value,81.6466266);
 for(const weight of [80,180,null])assert.equal(normalizeBodyWeight({weight}).provenance,"legacy_unit_ambiguous");
 for(const value of [0,-1,Infinity,NaN])assert.equal(normalizeBodyWeight(verified(value)).provenance,"invalid_value");
 for(const patch of [{weight_source_unit:"oz"},{weight_provenance_version:2}])assert.equal(normalizeBodyWeight({...verified(),...patch}).provenance,"unsupported_source");
 assert.equal(normalizeBodyWeight(verified(),"profile").provenance,"unsupported_source");
 assert.equal(normalizeBodyWeight({...verified(),weight_source_value:"180"}).provenance,"invalid_value");
 assert.equal(normalizeBodyWeight({...verified(),weight_kg:180}).provenance,"invalid_value");
});
test("weight discovery selects v2; v1 stays disabled and units are frozen in kg",async()=>{
 const choice=discoverOutcomes().outcomes.find(o=>o.registryKey==="body_weight")!;
 assert.equal(choice.registryVersion,2);assert.equal(choice.readinessAvailable,true);
 assert.equal(chooseOutcome(choice).registry_version,2);assert.equal(measurement("body_weight",1)?.enabled,false);
 const {row}=fixtureCapture("body_weight"),bundle=await replayDurableCapture(row);
 assert.equal(bundle.result.eligibility.state,"ready",JSON.stringify(bundle.result.eligibility));
 assert.ok(Math.abs(bundle.result.facts!.absoluteChange!+5*KG_PER_LB)<1e-10);
 assert.equal(retainedResultsDisplay(bundle.input)?.outcomeLabel,"Body Weight");
 assert.equal(retainedResultsDisplay(bundle.input)?.unit,"kg");
});
test("retained weight revisions survive source edits; ambiguity suppresses facts",async()=>{
 const {raw,row}=fixtureCapture("body_weight"),before=await replayDurableCapture(row);
 raw.intervention.checkins[0].weight_source_value=999;
 assert.deepEqual(await replayDurableCapture(row),before);
 const evidence_text=JSON.stringify(raw);
 const changed=await replayDurableCapture({...row,analysis_revision:2,evidence_text,digest:createHash("sha256").update(evidence_text).digest("hex")});
 assert.equal(changed.result.eligibility.state,"unable_to_determine");assert.equal(changed.result.facts,null);
 assert.ok(changed.result.eligibility.reasons.some(r=>r.code==="WEIGHT_PROVENANCE_EXCLUSIONS"));
});
test("weight five-observation floor, median and frozen gain/loss direction reuse continuous policy",async()=>{
 for(const direction of [undefined,"increase","decrease"]){
  const {raw,row}=fixtureCapture("body_weight");
  const outcome=raw.startSnapshot.configuration.outcomes[0];outcome.aggregation_method="median";
  if(direction)Object.assign(outcome,{success_criterion:{version:1,kind:"change",basis:"absolute",direction,operator:"gte",amount:1,unit:"kg"}});
  const evidence_text=JSON.stringify(raw),result=(await replayDurableCapture({...row,evidence_text,digest:createHash("sha256").update(evidence_text).digest("hex")})).result;
  assert.equal(result.family,"repeated_continuous");assert.equal(result.facts?.neutralMovement,"lower");
  assert.equal(result.facts?.direction,direction==="decrease"?"improved":direction==="increase"?"worsened":"indeterminate");
 }
 for(const n of [4,5]){
  const {raw,row}=fixtureCapture("body_weight");raw.baseline.checkins=raw.baseline.checkins.slice(0,n);
  const evidence_text=JSON.stringify(raw),result=(await replayDurableCapture({...row,evidence_text,digest:createHash("sha256").update(evidence_text).digest("hex")})).result;
  assert.equal(result.eligibility.state,n===4?"insufficient_data":"ready");
 }
});
test("Postgres provenance migration preserves history, validates new proof, keeps RLS, and is repeatable",async()=>{
 const db=await database(false,undefined,"202608280005_experiment_durable_evidence.sql");
 try{
  await db.query("insert into public.daily_checkins(user_id,checkin_date,weight) values($1,'2026-08-01',80)",[A]);
  const sql=readFileSync(new URL("../../supabase/migrations/202608280006_body_weight_provenance.sql",import.meta.url),"utf8");
  await db.exec(sql);await db.exec(sql);
  const old=(await db.query<{weight:string;weight_kg:null}>("select weight,weight_kg from daily_checkins")).rows[0];
  assert.equal(Number(old.weight),80);assert.equal(old.weight_kg,null);
  const definition=(await db.query<{d:unknown}>("select public.axvital_outcome_definition('body_weight',2) d")).rows[0].d;
  assert.deepEqual(definition,measurement("body_weight",2));
  await db.exec(`select set_config('request.jwt.claim.sub','${A}',false);set role authenticated;`);
  await db.query("insert into daily_checkins(user_id,checkin_date,weight_source_value,weight_source_unit,weight_provenance_version) values($1,'2026-08-02',180,'lb',1),($1,'2026-08-03',81.6466266,'kg',1)",[A]);
  const rows=(await db.query<{weight:string;weight_kg:string}>("select weight,weight_kg from daily_checkins where weight_kg is not null order by checkin_date")).rows;
  assert.equal(rows.length,2);assert.ok(rows.every(r=>Number(r.weight_kg)===81.6466266&&Number(r.weight)===180));
  for(const value of ["0","-1","'NaN'","'Infinity'"])await assert.rejects(db.query(`update daily_checkins set weight_source_value=${value} where checkin_date='2026-08-02'`),/INVALID_WEIGHT_PROVENANCE/);
  await db.exec("update daily_checkins set weight=181 where checkin_date='2026-08-02'");
  assert.equal((await db.query<{weight_kg:null}>("select weight_kg from daily_checkins where checkin_date='2026-08-02'")).rows[0].weight_kg,null);
  await assert.rejects(db.query("insert into daily_checkins(user_id,checkin_date,weight_source_value,weight_source_unit,weight_provenance_version) values($1,'2026-08-04',80,'kg',1)",[B]),/row-level security/);
  await db.exec(`reset role;select set_config('request.jwt.claim.sub','${B}',false);set role authenticated;`);
  assert.equal((await db.query("select * from daily_checkins")).rows.length,0);
 }finally{await db.close();}
});
