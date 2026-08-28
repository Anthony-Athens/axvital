import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { database } from "./test-database.ts";

const A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

test("migrations execute and real RLS rejects cross-owner records and experiment attachments", async t => {
  const db = await database();
  t.after(() => db.close());
  await db.exec(readFileSync(new URL("../../supabase/tests/sprint12_preflight.sql",import.meta.url),"utf8"));
  assert.deepEqual((await db.query("select tablename from pg_tables where schemaname='public' and not rowsecurity")).rows,[],"Every migrated public table has RLS enabled");
  const as = async (id: string, role="authenticated") => db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); set role ${role};`);
  const insert = async (table: string, values: Record<string, unknown>) => {
    const keys = Object.keys(values);
    const result = await db.query<{id:string}>(`insert into public.${table} (${keys.join(",")}) values (${keys.map((_,i)=>`$${i+1}`).join(",")}) returning id`,Object.values(values));
    return result.rows[0].id;
  };
  const experiment = (owner: string) => insert("experiments", {user_id:owner,name:"Test experiment",hypothesis:"Synthetic hypothesis only"});
  await as(B);
  const bCheckin = await insert("daily_checkins",{user_id:B,checkin_date:"2026-08-20",energy_score:6});
  await insert("profiles",{id:B,full_name:"Synthetic B"});
  const bEvent = await insert("health_events",{user_id:B,title:"Synthetic event"});
  const bCondition = await insert("user_conditions",{user_id:B,custom_condition_name:"Test condition"});
  const bExperiment = await experiment(B);
  const bActivity = await insert("planned_activities",{user_id:B,title:"Test habit",activity_type:"habit",recurrence_type:"none",start_date:"2026-08-20"});
  const bTemplate = await insert("workout_templates",{user_id:B,name:"Test template"});
  const bProtocol = await insert("user_protocols",{user_id:B,name:"Test protocol",start_date:"2026-08-20"});
  const bOutcome = await insert("experiment_outcomes",{experiment_id:bExperiment,outcome_role:"primary",outcome_type:"energy",name:"Energy"});
  await insert("experiment_results",{experiment_id:bExperiment});
  const bFood = await insert("user_foods",{user_id:B,name:"Test food",serving_name:"Portion",serving_quantity:1,serving_unit:"portion",calories:100});
  const bEntry = await insert("nutrition_entries",{user_id:B,consumed_at:"2026-08-20T12:00:00Z"});
  const item = {user_food_id:bFood,source_name:"Test food",serving_name_snapshot:"Portion",serving_quantity_snapshot:1,serving_unit_snapshot:"portion"};
  await insert("nutrition_entry_items",{nutrition_entry_id:bEntry,...item});
  const bMeal=await insert("saved_meals",{user_id:B,name:"Test meal"});
  const bEpisode=await insert("condition_episodes",{user_id:B,user_condition_id:bCondition,started_at:"2026-08-20T12:00:00Z"});
  await insert("episode_updates",{user_id:B,condition_episode_id:bEpisode,notes:"Test update"});
  const bSymptom=await insert("user_symptom_events",{user_id:B,custom_symptom_name:"Test symptom",started_at:"2026-08-20T12:00:00Z",severity:3});
  await insert("episode_symptom_links",{condition_episode_id:bEpisode,user_symptom_event_id:bSymptom});
  await insert("workout_template_groups",{user_id:B,workout_template_id:bTemplate,group_order:0,group_label:"Test group"});
  await insert("workout_sessions",{user_id:B,name:"Test session",session_date:"2026-08-20",started_at:"2026-08-20T12:00:00Z"});
  await as(A);
  for (const table of ["profiles","daily_checkins","health_events","user_conditions","experiments","planned_activities","workout_templates","user_protocols","experiment_outcomes","experiment_results","user_foods","nutrition_entries","nutrition_entry_items","saved_meals","condition_episodes","episode_updates","user_symptom_events","episode_symptom_links","workout_template_groups","workout_sessions"]) {
    assert.equal((await db.query(`select * from public.${table}`)).rows.length,0,`${table}: B hidden`);
    assert.equal((await db.query(`update public.${table} set id=id returning *`)).rows.length,0,`${table}: B not updated`);
    assert.equal((await db.query(`delete from public.${table} returning *`)).rows.length,0,`${table}: B not deleted`);
  }
  assert.equal((await db.query("update public.daily_checkins set energy_score=1 where id=$1 returning id",[bCheckin])).rows.length,0);
  await assert.rejects(insert("daily_checkins",{user_id:B,checkin_date:"2026-08-21"}),/row-level security/);
  const manifest=(await db.query<{payload:{export_manifest:Record<string,{status:string}>}}>("select public.axvital_export_account() as payload")).rows[0].payload.export_manifest;
  assert.equal(manifest.user_insights.status,"not_present_in_schema");
  for(const [route,limit] of [["account/export:POST",2],["account/delete:POST",3]] as const){
    for(let i=0;i<limit;i++)assert.equal((await db.query<{allowed:boolean}>("select public.axvital_consume_api_budget($1) as allowed",[route])).rows[0].allowed,true);
    assert.equal((await db.query<{allowed:boolean}>("select public.axvital_consume_api_budget($1) as allowed",[route])).rows[0].allowed,false);
  }
  const aEntry=await insert("nutrition_entries",{user_id:A,consumed_at:"2026-08-20T12:00:00Z"});
  await assert.rejects(insert("nutrition_entry_items",{nutrition_entry_id:aEntry,...item}),/row-level security|FOOD_OWNER_MISMATCH/);
  await assert.rejects(insert("nutrition_entries",{user_id:A,consumed_at:"2026-08-20T12:00:00Z",saved_meal_id:bMeal}),/row-level security/);
  await assert.rejects(insert("condition_episodes",{user_id:A,user_condition_id:bCondition,started_at:"2026-08-20T12:00:00Z"}),/row-level security/);
  await assert.rejects(insert("episode_updates",{user_id:A,condition_episode_id:bEpisode,notes:"Wrong parent"}),/row-level security/);
  await assert.rejects(insert("workout_template_groups",{user_id:A,workout_template_id:bTemplate,group_order:0,group_label:"Wrong parent"}),/row-level security/);
  const aExperiment = await experiment(A);
  await assert.rejects(insert("experiment_condition_links",{experiment_id:aExperiment,user_condition_id:bCondition}),/row-level security/);
  await assert.rejects(insert("experiment_outcomes",{experiment_id:aExperiment,outcome_role:"primary",outcome_type:"energy",name:"Energy",user_condition_id:bCondition}),/row-level security/);
  for (const [key,value] of Object.entries({linked_planned_activity_id:bActivity,linked_user_protocol_id:bProtocol,linked_workout_template_id:bTemplate})) {
    await assert.rejects(insert("experiment_interventions",{experiment_id:aExperiment,intervention_type:"custom",name:"Test intervention",[key]:value}),/row-level security/);
  }
  const aOutcome = await insert("experiment_outcomes",{experiment_id:aExperiment,outcome_role:"primary",outcome_type:"energy",name:"Energy"});
  const measurement = {experiment_id:aExperiment,experiment_outcome_id:aOutcome,user_id:A,measured_at:"2026-08-20T12:00:00Z",phase:"baseline",numeric_value:5,source_type:"custom_manual",is_manual:true};
  await insert("experiment_measurements",measurement);
  const otherExperiment = await experiment(A);
  const otherOutcome = await insert("experiment_outcomes",{experiment_id:otherExperiment,outcome_role:"primary",outcome_type:"energy",name:"Other energy"});
  await assert.rejects(insert("experiment_measurements",{...measurement,experiment_outcome_id:otherOutcome}),/row-level security|foreign key/);
  await assert.rejects(insert("experiment_measurements",{...measurement,experiment_outcome_id:bOutcome}),/row-level security|foreign key/);
  await assert.rejects(insert("experiment_measurements",{...measurement,source_type:"health_event",source_record_id:bEvent}),/row-level security/);
  await assert.rejects(insert("planned_workouts",{user_id:A,workout_template_id:bTemplate,name:"Test workout",scheduled_date:"2026-08-20"}),/row-level security/);
  const aCheckin=await insert("daily_checkins",{user_id:A,checkin_date:"2026-08-20",energy_score:4});
  const partial=(await db.query<{mood_score:number|null;alcohol:boolean|null}>("select * from public.daily_checkins where id=$1",[aCheckin])).rows[0];
  assert.equal(partial.mood_score,null); assert.equal(partial.alcohol,null);
  await assert.rejects(insert("daily_checkins",{user_id:A,checkin_date:"2026-08-20",energy_score:9}),/unique/);
  await assert.rejects(insert("subscriptions",{user_id:A,plan:"premium",status:"active"}),/permission denied/);
  await assert.rejects(db.exec("insert into public.product_events(event_name) values('premium_activated')"),/permission denied/);
  for (let i=0;i<3;i++) assert.equal((await db.query<{allowed:boolean}>("select public.axvital_consume_api_budget('billing/checkout:POST') as allowed")).rows[0].allowed,true);
  assert.equal((await db.query<{allowed:boolean}>("select public.axvital_consume_api_budget('billing/checkout:POST') as allowed")).rows[0].allowed,false);
  await assert.rejects(db.exec("select * from public.api_request_budgets"),/permission denied/);
  await as("","anon");
  assert.equal((await db.query("select * from public.daily_checkins")).rows.length,0);
  await assert.rejects(insert("daily_checkins",{user_id:A,checkin_date:"2026-08-21"}),/row-level security/);
  await assert.rejects(db.exec("select public.axvital_consume_api_budget('analytics:GET')"),/permission denied/);
  await db.exec("reset role;");
  const aTemplate = await insert("workout_templates",{user_id:A,name:"A retained template"});
  await db.query("update public.workout_template_groups set workout_template_id=$1 where user_id=$2",[aTemplate,B]);
  await db.exec(`select public.axvital_begin_account_deletion('${B}');update public.account_deletions set billing_closed=true where user_id='${B}';`);
  await assert.rejects(db.exec(`delete from auth.users where id='${B}'`),/ACCOUNT_RELATIONSHIP_REVIEW_REQUIRED/);
  await db.query("update public.workout_template_groups set workout_template_id=$1 where user_id=$2",[bTemplate,B]);
  const catalogs=["condition_categories","conditions","symptom_categories","symptoms","condition_symptoms","food_categories","foods","food_servings","experiment_templates"];
  const catalogBefore=await Promise.all(catalogs.map(table=>db.query(`select * from public.${table} order by id`)));
  await db.exec(`delete from auth.users where id='${B}';`);
  for(let i=0;i<catalogs.length;i++)assert.deepEqual((await db.query(`select * from public.${catalogs[i]} order by id`)).rows,catalogBefore[i].rows,`${catalogs[i]} retained`);

  for(const table of ["experiment_outcomes","experiment_results","nutrition_entry_items","episode_symptom_links","workout_template_groups","episode_updates"]){
    const rows=(await db.query(`select * from public.${table}`)).rows;
    if(table==="experiment_outcomes") assert.equal(rows.length,2,"A outcomes survive");
    else assert.equal(rows.length,0,`${table}: B children cleaned`);
  }
  assert.equal((await db.query("select * from public.workout_templates where id=$1",[aTemplate])).rows.length,1);
  assert.equal((await db.query("select * from auth.users where id=$1",[A])).rows.length,1);

});


test("account export is complete, owner-only, redacted and bounded; deletion is atomic", async t => {
  const db=await database(true);t.after(()=>db.close());
  await db.exec(`
    alter table public.profiles add column internal_secret text;
    insert into public.profiles(id,full_name,internal_secret) values('${A}','Synthetic A','never-export'),('${B}','Synthetic B','private-B');
    insert into public.daily_checkins(user_id,checkin_date,energy_score,notes) select '${A}',date '2020-01-01'+i,4,'Synthetic A' from generate_series(0,1000) i;
    insert into public.daily_checkins(user_id,checkin_date,energy_score,notes) values('${B}','2026-08-20',8,'private-B');
    insert into public.health_events(user_id,title) values('${A}','Synthetic event'),('${B}','private-B');
    insert into public.user_insights(user_id,description) values('${A}','Synthetic insight');
    insert into public.subscriptions(user_id,plan,stripe_customer_id) values('${A}','free','never-export-customer');
    set role authenticated; select set_config('request.jwt.claim.sub','${A}',false);
  `);
  const exported=(await db.query<{payload:{data:Record<string,Array<Record<string,unknown>>>;export_manifest:Record<string,{status:string;rows:number}>}}>("select public.axvital_export_account() as payload")).rows[0].payload;
  assert.equal(exported.data.daily_checkins.length,1001,"not truncated at PostgREST's usual row limit");
  assert.equal(exported.data.user_insights.length,1);
  assert.equal(exported.export_manifest.daily_checkins.rows,1001);
  assert.equal(exported.data.profiles[0].full_name,"Synthetic A");
  const serialized=JSON.stringify(exported);
  assert.doesNotMatch(serialized,/private-B|internal_secret|never-export|stripe_customer_id|account_deletions|api_request_budgets|webhook_events|product_events/);
  await assert.rejects(db.exec(`select public.axvital_begin_account_deletion('${B}')`),/permission denied/);
  await assert.rejects(db.exec(`insert into public.account_deletions(user_id,billing_closed) values('${A}',true)`),/permission denied/);
  await db.exec(`reset role; update public.health_events set title=repeat('x',3200000) where user_id='${A}';set role authenticated;`);
  await assert.rejects(db.exec("select public.axvital_export_account()"),/EXPORT_TOO_LARGE/);
  await db.exec(`reset role;update public.health_events set title='Synthetic event' where user_id='${A}';`);
  // A missing/erroring required source must fail the whole export, not return partial data.
  await db.exec("begin;alter table public.health_events rename to hidden_test_events;set local role authenticated;");
  await assert.rejects(db.exec("select public.axvital_export_account()"),/ACCOUNT_SCHEMA_REVIEW_REQUIRED/);
  await db.exec("rollback;");
  await assert.rejects(db.exec(`delete from auth.users where id='${A}'`),/ACCOUNT_DELETION_NOT_PREPARED/);
  await db.exec(`select public.axvital_begin_account_deletion('${A}');`);
  await assert.rejects(db.exec(`update public.subscriptions set plan='premium' where user_id='${A}'`),/ACCOUNT_DELETION_PENDING/);
  await assert.rejects(db.exec(`delete from auth.users where id='${A}'`),/ACCOUNT_DELETION_NOT_PREPARED/);
  await db.exec(`update public.account_deletions set billing_closed=true where user_id='${A}';create table auth.test_cleanup_blocker(user_id uuid references auth.users(id) on delete restrict);insert into auth.test_cleanup_blocker values('${A}');`);
  await assert.rejects(db.exec(`delete from auth.users where id='${A}'`),/foreign key/);
  assert.equal((await db.query<{count:number}>(`select count(*)::int from public.daily_checkins where user_id='${A}'`)).rows[0].count,1001,"failed Auth removal rolls back application cleanup");
  await db.exec(`drop table auth.test_cleanup_blocker;delete from auth.users where id='${A}';`);
  for(const table of["daily_checkins","health_events","user_insights","subscriptions","account_deletions","api_request_budgets"]){assert.equal((await db.query<{count:number}>(`select count(*)::int from public.${table} where user_id='${A}'`)).rows[0].count,0,table)}
  assert.equal((await db.query(`select * from auth.users where id='${A}'`)).rows.length,0);
  assert.equal((await db.query(`select * from public.daily_checkins where user_id='${B}'`)).rows.length,1);
  assert.equal((await db.query(`select * from auth.users where id='${B}'`)).rows.length,1);
  await db.exec(`set role anon;select set_config('request.jwt.claim.sub','',false);`);
  await assert.rejects(db.exec("select public.axvital_export_account()"),/permission denied/);
});


import {authoritativeCustomer,type CustomerDependencies,type CustomerReservation} from "../billing/customer-coordination.ts";
test("durable customer reservation converges concurrent requests and retains failed operations",async t=>{
 const db=await database();t.after(()=>db.close());
 const rpc=async<T>(name:string,args:unknown[])=> (await db.query<{value:T}>(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(",")}) as value`,args)).rows[0].value;
 let creations=0,attempts=0,failMapping=false;
 const customers=new Map<string,{id:string;owner:string}>();
 let release!:()=>void;
 const overlap=new Promise<void>(resolve=>{release=resolve});
 const deps:CustomerDependencies={
  reserve:owner=>rpc<CustomerReservation>("axvital_reserve_billing_customer",[owner]),
  create:async(owner,key)=>{
   attempts++;
   if(!customers.has(key))customers.set(key,{id:`cus_${++creations}`,owner});
   if(attempts===2)release();
   if(attempts<=2)await overlap;
   return customers.get(key)!;
  },
  retrieve:async id=>[...customers.values()].find(x=>x.id===id)!,
  establish:async(owner,operation,customer)=>{
   if(failMapping)throw new Error("simulated mapping outage");
   return rpc<string>("axvital_establish_billing_customer",[owner,operation,customer]);
  },
  assertMapping:async(owner,customer)=>{assert.equal(await rpc("axvital_assert_billing_customer",[owner,customer]),true)},
 };
 const concurrent=await Promise.all([authoritativeCustomer(A,deps),authoritativeCustomer(A,deps)]);
 assert.deepEqual(concurrent,["cus_1","cus_1"]);assert.equal(creations,1);assert.equal(attempts,2);
 assert.equal(await authoritativeCustomer(A,deps),"cus_1");assert.equal(attempts,2,"existing mapping never calls create");
 await assert.rejects(db.query("update public.subscriptions set stripe_customer_id='cus_other' where user_id=$1",[A]),/BILLING_MAPPING_IMMUTABLE/);
 failMapping=true;
 await assert.rejects(authoritativeCustomer(B,deps),/simulated mapping outage/);
 assert.equal((await db.query("select * from public.subscriptions where user_id=$1",[B])).rows.length,0);
 assert.equal((await db.query("select * from public.billing_customer_provisions where user_id=$1 and stripe_customer_id is null",[B])).rows.length,1);
 await assert.rejects(rpc("axvital_begin_account_deletion",[B]),/BILLING_RECONCILIATION_REQUIRED/);
 failMapping=false;
 await db.exec(`alter table public.subscriptions add constraint simulate_mapping_failure check(user_id<>'${B}');`);
 await assert.rejects(authoritativeCustomer(B,deps),/simulate_mapping_failure/);
 assert.equal((await db.query("select * from public.billing_customer_provisions where user_id=$1 and stripe_customer_id is null",[B])).rows.length,1,"failed mapping transaction rolls back provision finalization");
 await db.exec("alter table public.subscriptions drop constraint simulate_mapping_failure;");
 assert.equal(await authoritativeCustomer(B,deps),"cus_2");assert.equal(creations,2,"retry recovered the provider customer, not a new one");
 await db.exec(`select public.axvital_begin_account_deletion('${A}');`);
 await assert.rejects(authoritativeCustomer(A,deps),/ACCOUNT_DELETION_PENDING/);
 await assert.rejects(deps.assertMapping(A,"cus_1"),/ACCOUNT_DELETION_PENDING/);
 const expired="cccccccc-cccc-4ccc-accc-cccccccccccc";
 await db.query("insert into auth.users(id) values($1)",[expired]);
 await deps.reserve(expired);
 await db.query("update public.billing_customer_provisions set created_at=clock_timestamp()-interval '25 hours' where user_id=$1",[expired]);
 const before=attempts;
 await assert.rejects(authoritativeCustomer(expired,deps),/BILLING_RECONCILIATION_REQUIRED/);assert.equal(attempts,before);
 await db.exec("set role authenticated;");
 await assert.rejects(deps.reserve(B),/permission denied/);
 await assert.rejects(db.exec("select * from public.billing_customer_provisions"),/permission denied/);
});


test("003 validates schema before cleanup and permits only absent optional sources",async t=>{
 const db=await database(true,async db=>{
  // Pre-003 checker is self-contained and must not depend on new functions.
  assert.equal((await db.query(readFileSync(new URL("../../supabase/tests/sprint12b_pre003_preflight.sql",import.meta.url),"utf8"))).rows.length,0);
 });t.after(()=>db.close());
 await db.exec(`insert into public.health_events(user_id,title) values('${A}','Synthetic retained');
 select public.axvital_begin_account_deletion('${A}');update public.account_deletions set billing_closed=true where user_id='${A}';
 create sequence public.cleanup_probe;
 create function public.probe_cleanup() returns trigger language plpgsql as $$begin perform nextval('public.cleanup_probe');return old;end$$;
 create trigger probe_cleanup before delete on public.health_events for each row execute function public.probe_cleanup();`);
 await db.exec(`alter policy baseline_owner on public.health_events to service_role;set role authenticated;select set_config('request.jwt.claim.sub','${A}',false);`);
 await assert.rejects(db.exec("select public.axvital_export_account()"),/ACCOUNT_SCHEMA_REVIEW_REQUIRED/);
 await db.exec("reset role;alter policy baseline_owner on public.health_events to authenticated;");
 await db.exec("begin;alter table public.planned_activity_occurrences drop constraint planned_activity_occurrences_user_id_fkey;");
 await assert.rejects(db.exec(`delete from auth.users where id='${A}'`),/ACCOUNT_SCHEMA_REVIEW_REQUIRED/);
 await db.exec("rollback;");
 // nextval is not rolled back: an uncalled sequence proves no earlier DELETE ran.
 await db.exec("alter table public.daily_checkins rename to drift_checkins;");
 await assert.rejects(db.exec(`delete from auth.users where id='${A}'`),/ACCOUNT_SCHEMA_REVIEW_REQUIRED/);
 assert.equal((await db.query<{is_called:boolean}>("select is_called from public.cleanup_probe")).rows[0].is_called,false);
 await db.exec("alter table public.drift_checkins rename to daily_checkins;");
 await db.exec("alter table public.user_insights rename column user_id to legacy_owner;");
 assert.ok((await db.query("select * from public.axvital_account_schema_issues(true) where table_name='user_insights' and issue='OWNERSHIP_COLUMN_REQUIRED'")).rows.length);
 await assert.rejects(db.exec(`delete from auth.users where id='${A}'`),/ACCOUNT_SCHEMA_REVIEW_REQUIRED/);
 await db.exec("alter table public.user_insights rename column legacy_owner to user_id;alter table public.user_insights drop column id;");
 await db.exec(`insert into public.user_insights(user_id,description) values('${A}','Legacy without id');set role authenticated;select set_config('request.jwt.claim.sub','${A}',false);`);
 const payload=(await db.query<{data:{data:{user_insights:unknown[]}}}>("select public.axvital_export_account() as data")).rows[0].data;
 assert.equal(payload.data.user_insights.length,1,"export does not assume an optional legacy id column");
 await db.exec("reset role;drop table public.user_insights;");
 await db.exec(`delete from auth.users where id='${A}';`);
 assert.equal((await db.query("select * from public.health_events")).rows.length,0);
});

test("005 coordination is checked again at deletion and cascades only on success",async t=>{
 const db=await database(true);t.after(()=>db.close());
 const reserve=(await db.query<{p:{operation_id:string}}>(`select public.axvital_reserve_billing_customer('${A}') p`)).rows[0].p;
 await assert.rejects(db.exec(`select public.axvital_begin_account_deletion('${A}')`),/BILLING_RECONCILIATION_REQUIRED/);
 await db.query("select public.axvital_establish_billing_customer($1,$2,'cus_review')",[A,reserve.operation_id]);
 await db.exec(`select public.axvital_begin_account_deletion('${A}');update public.account_deletions set billing_closed=true where user_id='${A}';`);
 await db.exec("alter table public.billing_customer_provisions rename to drift_provisions;");
 await assert.rejects(db.exec(`delete from auth.users where id='${A}'`),/ACCOUNT_SCHEMA_REVIEW_REQUIRED/);
 await db.exec("alter table public.drift_provisions rename to billing_customer_provisions;");
 await db.exec(`update public.billing_customer_provisions set stripe_customer_id=null where user_id='${A}';`);
 await assert.rejects(db.exec(`delete from auth.users where id='${A}'`),/BILLING_RECONCILIATION_REQUIRED/);
 await db.exec(`update public.billing_customer_provisions set stripe_customer_id='cus_wrong' where user_id='${A}';`);
 await assert.rejects(db.exec(`delete from auth.users where id='${A}'`),/BILLING_RECONCILIATION_REQUIRED/);
 await db.exec(`update public.billing_customer_provisions set stripe_customer_id='cus_review' where user_id='${A}';delete from auth.users where id='${A}';`);
 assert.equal((await db.query("select * from public.billing_customer_provisions")).rows.length,0);
 assert.equal((await db.query("select * from public.account_deletions")).rows.length,0);
 assert.equal((await db.query(`select * from auth.users where id='${B}'`)).rows.length,1);
});

test("Auth INSERT profile trigger coexists; composite profile-linked cascades are blocked",async t=>{
 const db=await database();t.after(()=>db.close());
 await db.exec(`create function public.handle_new_user() returns trigger language plpgsql security definer as $$begin insert into public.profiles(id) values(new.id);return new;end$$;
 create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
 insert into public.profiles(id,full_name) values('${A}','A'),('${B}','B');
 alter table public.profiles add unique(id,full_name);
 alter table public.health_events add column linked_profile uuid,add column linked_name text,add foreign key(linked_profile,linked_name) references public.profiles(id,full_name) on delete cascade;
 insert into public.health_events(user_id,title,linked_profile,linked_name) values('${B}','Other account','${A}','A');
 select public.axvital_begin_account_deletion('${A}');update public.account_deletions set billing_closed=true where user_id='${A}';`);
 await assert.rejects(db.exec(`delete from auth.users where id='${A}'`),/ACCOUNT_RELATIONSHIP_REVIEW_REQUIRED/);
 await db.exec(`update public.health_events set linked_profile=null;delete from auth.users where id='${A}';insert into auth.users(id) values('${A}');`);
 assert.equal((await db.query(`select * from public.profiles where id='${A}'`)).rows.length,1);
 assert.equal((await db.query(`select * from public.health_events where user_id='${B}'`)).rows.length,1);
 await db.exec(`create table public.unreviewed_child(id uuid primary key,user_id uuid references auth.users(id) on delete cascade);`);
 await assert.rejects(db.exec(`select public.axvital_begin_account_deletion('${A}')`),/ACCOUNT_SCHEMA_REVIEW_REQUIRED/);
});

test("003 installation rejects incompatible legacy ownership with an explicit schema error",async()=>{
 await assert.rejects(database(true,async db=>{
  await db.exec("alter table public.user_insights rename column user_id to legacy_owner;");
 }),error=>{
  assert.ok(error instanceof Error);
  assert.match(String(error.cause),/ACCOUNT_SCHEMA_REVIEW_REQUIRED/);
  return true;
 });
});
