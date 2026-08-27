import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
/** Synthetic baseline ONLY: these four original CREATE TABLEs are absent from the repo.
 * All subsequent migrations are executed unmodified, with real PostgreSQL roles/RLS.
 * This is not evidence about a deployed Supabase schema or its default grants. */
async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    create table public.profiles(id uuid primary key references auth.users(id),full_name text);
    create table public.daily_checkins(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),checkin_date date not null,
      energy_score integer not null default 8 check(energy_score between 1 and 10),mood_score integer not null default 7,sleep_quality text not null default 'Good',exercise_level text not null default 'Moderate',nutrition_quality text not null default 'Good',stress_level text not null default 'Low',alcohol boolean not null default false,weight numeric,notes text,tags text[] default '{}',created_at timestamptz default now(),updated_at timestamptz default now(),unique(user_id,checkin_date));
    create table public.health_events(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),title text);
    create table public.weekly_recaps(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),week_start date,week_end date,title text,summary text,generated_at timestamptz default now(),unique(user_id,week_start));
    -- Synthetic existing permissive policies; the new migration only restricts them.
    create policy baseline_owner on public.profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
    create policy baseline_owner on public.daily_checkins for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
    create policy baseline_owner on public.health_events for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
    create policy baseline_owner on public.weekly_recaps for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
    grant select,insert,update,delete on all tables in schema public to authenticated,anon;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;
    alter default privileges in schema public grant usage,select on sequences to authenticated,anon;
    insert into auth.users values('${A}'),('${B}');
  `);
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(directory).filter(file => file.endsWith(".sql")).sort()) {
    try { await db.exec(readFileSync(new URL(file, directory),"utf8")); }
    catch (error) { await db.close(); throw new Error(`Migration failed: ${file}`, { cause: error }); }
  }
  return db;
}

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
  const aEntry=await insert("nutrition_entries",{user_id:A,consumed_at:"2026-08-20T12:00:00Z"});
  await assert.rejects(insert("nutrition_entry_items",{nutrition_entry_id:aEntry,...item}),/row-level security/);
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
});
