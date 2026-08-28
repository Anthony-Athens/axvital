import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {goalDefinition,goalNutrients,goalOperators,projectGoal,type NutritionGoal} from "./goals.ts";
import {evaluateFrozenNutritionDay} from "./frozen-target.ts";
import {database} from "../security/test-database.ts";
import {goalsDbClient} from "./testing/goals-db-client.ts";
import {testHooks} from "../experiments/testing/tsx-hooks.ts";
import type {StoredCapture} from "../experiments/durable-evidence.ts";
const hooks=testHooks();const {nutritionGoalsApi}=await import("./goals-api.ts");
const {fixtureCapture}=await import("../experiments/testing/results-fixture.ts");
const {replayDurableCapture}=await import("../experiments/durable-evidence.ts");hooks.deregister();
const A="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",B="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const input={name:"",metric:"protein_grams",operator:"gte",amount:180};
test("API-authored target flows through terminal SQL capture and replay after target edits/archive",async()=>{
  const db=await database();
  try {
    // Synthetic historical records are inserted by the test migration role only;
    // no public RPC accepts backdated lifecycle timestamps or evidence payloads.
    const e=fixtureCapture().raw;const start=e.experiment.actual_started_at;
    await db.exec(`select set_config('request.jwt.claim.sub','${A}',false);set role authenticated;`);
    const api=nutritionGoalsApi(async()=>goalsDbClient(db,A));
    const created=await api(request({action:"create",input:{...input,name:"Pipeline target",amount:15}}));assert.equal(created.status,201);
    const goal=await created.json() as NutritionGoal;
    e.startSnapshot.configuration.intervention.configuration.id=goal.id;
    await db.exec("reset role");
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
    assert.equal((await api(request({action:"update",id:goal.id,revision:1,input:{...input,amount:999}}))).status,200);
    assert.equal((await api(request({action:"archive",id:goal.id,revision:2}))).status,200);
    assert.deepEqual(await replayDurableCapture(first),result);
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
const request=(body?:unknown,query="",origin:string|null="https://example.test")=>new Request("https://example.test/api/nutrition/goals"+query,body===undefined?{}:{method:"POST",headers:{"content-type":"application/json",...(origin?{origin}:{})},body:JSON.stringify(body)});
for(const metric of Object.keys(goalNutrients))for(const operator of Object.keys(goalOperators))test(`goal supports ${metric} ${operator} in canonical units`,()=>{const d=goalDefinition({...input,metric,operator});assert.equal(d.unit,metric==="calories"?"kcal":"g");});
test("goal contract rejects spoofed fields, units, unsupported and invalid amounts",()=>{
 for(const patch of [{metric:"alcohol_occurrences"},{operator:"range"},{amount:0},{amount:-1},{amount:Infinity},{amount:NaN},{amount:"180"},{amount:1000001},{unit:"oz"},{user_id:B},{name:"x"},{name:"x".repeat(121)}])assert.throws(()=>goalDefinition({...input,...patch}));
});
test("authored definitions feed authoritative exposure without new evaluator logic",()=>{
 const definition=goalDefinition(input);
 const day={logicalDate:"2026-08-01",subtotal:180,fieldComplete:true,coverageStatus:"complete" as const,hasItems:true,unknownItemCount:0,itemCount:1,entryCount:1,knownItemCount:1};
 assert.equal(evaluateFrozenNutritionDay(definition,day,true).state,"adherent");
 assert.equal(evaluateFrozenNutritionDay(definition,{...day,subtotal:179},true).state,"non-adherent");
 assert.equal(evaluateFrozenNutritionDay(definition,{...day,coverageStatus:"partial"},true).state,"unknown");
 assert.equal(evaluateFrozenNutritionDay(definition,undefined,true).state,"unknown");
 assert.equal(evaluateFrozenNutritionDay({...definition,metric:"unsupported"},day,true).state,"unknown");
});
test("management API uses real owned PostgreSQL rows, revisions, budgets, archival and safe projection",async()=>{
 const db=await database();try{
  const migration=readFileSync(new URL("../../supabase/migrations/202608280007_nutrition_goals_access.sql",import.meta.url),"utf8");await db.exec(migration);
  await db.exec(`select set_config('request.jwt.claim.sub','${A}',false);set role authenticated;`);
  const api=nutritionGoalsApi(async()=>goalsDbClient(db,A));
  assert.equal((await api(request({action:"create",input},"",null))).status,403);
  assert.equal((await api(request({action:"create",input},"","https://evil.test"))).status,403);
  assert.equal((await api(request({action:"create",input:{...input,user_id:B}}))).status,400);
  assert.equal((await api(request({action:"create",input,user_id:B}))).status,400);
  assert.equal((await api(request(undefined,"?owner="+B))).status,400);
  const created=await api(request({action:"create",input}));assert.equal(created.status,201);assert.equal(created.headers.get("Cache-Control"),"private, no-store");
  const goal=await created.json() as NutritionGoal;assert.equal(goal.name,"Protein ≥ 180 g/day");assert.equal(goal.compatible,true);assert.equal(goal.revision,1);
  assert.doesNotMatch(JSON.stringify(goal),/definition|user_id|source_config/);
  const duplicate=await api(request({action:"create",input}));assert.equal(duplicate.status,201);assert.notEqual((await duplicate.json()).id,goal.id);
  assert.equal((await (await api(request())).json()).items.length,2);
  // A genuinely authored target follows the normal Premium Start transaction.
  await db.exec("reset role");await db.query("insert into subscriptions(user_id,plan,status) values($1,'premium','active')",[A]);await db.exec("set role authenticated");
  const dates=(await db.query<{today:string;end_date:string;baseline:string;previous:string}>("select current_date::text today,(current_date+13)::text end_date,(current_date-14)::text baseline,(current_date-1)::text previous")).rows[0];
  const draft={name:"Authored nutrition experiment",analysis_timezone:"UTC",baseline_mode:"historical",baseline_start_date:dates.baseline,baseline_end_date:dates.previous,intervention_start_date:dates.today,intervention_end_date:dates.end_date,intervention:{intervention_type:"nutrition_target",rule_id:goal.id},outcomes:[{registry_key:"energy_score",registry_version:1,outcome_role:"primary",aggregation_method:"average",expected_direction:"unknown",source_config:{}}]};
  const experiment=(await db.query<{id:string}>("select * from save_experiment_v2(null,0,$1)",[JSON.stringify(draft)])).rows[0];
  await db.query("select start_experiment_v2($1,1)",[experiment.id]);
  const snapshot=(await db.query<{configuration:{intervention:{configuration:{definition:unknown;revision:number}}}}>("select configuration from experiment_start_snapshots where experiment_id=$1",[experiment.id])).rows[0];
  assert.deepEqual(snapshot.configuration.intervention.configuration.definition,goalDefinition(input));
  const changed=await api(request({action:"update",id:goal.id,revision:1,input:{...input,amount:200}}));assert.equal(changed.status,200);assert.equal((await changed.json()).revision,2);
  assert.equal((await api(request({action:"update",id:goal.id,revision:1,input}))).status,409);
  assert.equal((await api(request({action:"archive",id:goal.id,revision:2}))).status,200);
  assert.equal((await (await api(request(undefined,"?status=archived"))).json()).items[0].id,goal.id);
  const discovered=(await db.query<{id:string}>("select * from discover_experiment_targets_v1('target_rules')")).rows;assert.ok(!discovered.some(r=>r.id===goal.id));
  assert.equal((await api(request({action:"restore",id:goal.id,revision:3}))).status,200);
  assert.deepEqual((await db.query("select configuration from experiment_start_snapshots where experiment_id=$1",[experiment.id])).rows[0],snapshot);
  await db.exec(`reset role;select set_config('request.jwt.claim.sub','${B}',false);set role authenticated;`);
  const foreign=nutritionGoalsApi(async()=>goalsDbClient(db,B));
  assert.equal((await (await foreign(request())).json()).items.length,0);
  assert.equal((await foreign(request({action:"archive",id:goal.id,revision:4}))).status,404);
  assert.equal((await nutritionGoalsApi(async()=>goalsDbClient(db,null))(request())).status,401);
 }finally{await db.close();}
});
test("unsupported stored definitions are labeled without raw JSON",()=>{
 const p=projectGoal({id:A,name:"Legacy exclusion",revision:1,archived_at:null,definition:{version:1,domain:"nutrition",kind:"exclusion",metric:"food_classification",operator:"excludes",classification:"dairy",period:"day"}});
 assert.equal(p.compatible,false);assert.equal(p.metric,null);assert.doesNotMatch(JSON.stringify(p),/food_classification/);
});
