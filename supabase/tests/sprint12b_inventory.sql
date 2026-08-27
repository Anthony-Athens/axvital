-- READ ONLY. Run as an authorized schema reviewer in staging. No account data selected.
-- Compare these rows to docs/account-data-controls.md BEFORE enabling deletion.
select n.nspname as schema_name,c.relname as table_name,c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','storage') and c.relkind in ('r','p') order by 1,2;
select c.conrelid::regclass as child,c.confrelid::regclass as parent,
       c.conname,pg_get_constraintdef(c.oid) as definition
from pg_constraint c where c.contype='f'
and (c.connamespace='public'::regnamespace or c.confrelid='auth.users'::regclass)
order by 1,2,3;
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public' order by tablename,policyname;
select tgname,pg_get_triggerdef(oid) as definition from pg_trigger
where tgrelid='auth.users'::regclass and not tgisinternal;
select name,to_regclass('public.'||name) as deployed_table
from unnest(array['profiles','daily_checkins','health_events','weekly_recaps','user_insights']) as name;
-- Null here is explicit absence; present rows still require original DDL/grants/FK review.
