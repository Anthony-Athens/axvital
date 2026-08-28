import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
/** Synthetic baseline ONLY: these four original CREATE TABLEs are absent from the repo.
 * All subsequent migrations are executed unmodified, with real PostgreSQL roles/RLS.
 * This is not evidence about a deployed Supabase schema or its default grants. */
export async function database(withInsights=false, beforeAccount?:(db:PGlite)=>Promise<void>, throughMigration?:string) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,full_name text);
    create table public.daily_checkins(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,checkin_date date not null,
      energy_score integer not null default 8 check(energy_score between 1 and 10),mood_score integer not null default 7,sleep_quality text not null default 'Good',exercise_level text not null default 'Moderate',nutrition_quality text not null default 'Good',stress_level text not null default 'Low',alcohol boolean not null default false,weight numeric,notes text,tags text[] default '{}',created_at timestamptz default now(),updated_at timestamptz default now(),unique(user_id,checkin_date));
    create table public.health_events(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,title text);
    create table public.weekly_recaps(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,week_start date,week_end date,title text,summary text,generated_at timestamptz default now(),unique(user_id,week_start));
    ${withInsights ? `create table public.user_insights(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,description text);create policy baseline_owner on public.user_insights for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());` : ""}
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
  for (const file of readdirSync(directory).filter(file => file.endsWith(".sql") && (!throughMigration || file <= throughMigration)).sort()) {
    try {
      if(file==="202608270003_account_control.sql"&&beforeAccount)await beforeAccount(db);
      // Supabase deployments can grant functions to API roles by default.
      if(file==="202608270003_account_control.sql"||file==="202608270005_billing_customer_coordination.sql")await db.exec("alter default privileges in schema public grant execute on functions to anon,authenticated;");
      await db.exec(readFileSync(new URL(file, directory),"utf8"));
    }
    catch (error) { await db.close(); throw new Error(`Migration failed: ${file}`, { cause: error }); }
  }
  return db;
}
