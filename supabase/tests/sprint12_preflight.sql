-- OWNER ACTION: run with an authorized database administrator on staging first.
-- Read-only. Outputs schema/policy metadata and violation COUNTS, never health rows.
begin read only;
select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='public' order by tablename,policyname;
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
and table_name in ('profiles','daily_checkins','health_events','weekly_recaps')
order by table_name,ordinal_position;

do $$
declare r record; child_owner text; parent_owner text; violations bigint;
-- Explicit private child ownership paths. Other private tables carry user_id.
paths jsonb := '{
 "experiment_interventions":["experiments","experiment_id"],
 "experiment_outcomes":["experiments","experiment_id"],
 "experiment_condition_links":["experiments","experiment_id"],
 "experiment_results":["experiments","experiment_id"],
 "nutrition_entry_items":["nutrition_entries","nutrition_entry_id"],
 "saved_meal_items":["saved_meals","saved_meal_id"],
 "symptom_event_conditions":["user_symptom_events","symptom_event_id"],
 "episode_symptom_links":["condition_episodes","condition_episode_id"]
}';
begin
 for r in
  select child.relname child_table,parent.relname parent_table,a.attname child_column,b.attname parent_column
  from pg_constraint c join pg_class child on child.oid=c.conrelid join pg_class parent on parent.oid=c.confrelid
  join pg_namespace ns on ns.oid=child.relnamespace join pg_namespace pn on pn.oid=parent.relnamespace
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  join pg_attribute b on b.attrelid=c.confrelid and b.attnum=c.confkey[1]
  where c.contype='f' and ns.nspname='public' and pn.nspname='public' and cardinality(c.conkey)=1
  and (paths ? child.relname or exists(select 1 from pg_attribute ca where ca.attrelid=child.oid and ca.attname='user_id'))
  and (paths ? parent.relname or exists(select 1 from pg_attribute pa where pa.attrelid=parent.oid and pa.attname='user_id'))
 loop
  child_owner := case when paths ? r.child_table then format('(select p.user_id from public.%I p where p.id=child.%I)',paths->r.child_table->>0,paths->r.child_table->>1) else 'child.user_id' end;
  parent_owner := case when paths ? r.parent_table then format('(select p.user_id from public.%I p where p.id=parent.%I)',paths->r.parent_table->>0,paths->r.parent_table->>1) else 'parent.user_id' end;
  execute format('select count(*) from public.%I child join public.%I parent on parent.%I=child.%I where (%s) is distinct from (%s) %s',r.child_table,r.parent_table,r.parent_column,r.child_column,child_owner,parent_owner,case when r.parent_table='exercises' then 'and parent.user_id is not null' else '' end) into violations;
  raise notice '%.%: cross-owner links = %',r.child_table,r.child_column,violations;
 end loop;
end $$;
select count(*) as mismatched_measurement_outcomes from public.experiment_measurements m
join public.experiment_outcomes o on o.id=m.experiment_outcome_id where o.experiment_id<>m.experiment_id;
select count(*) as duplicate_checkin_dates from (
 select 1 from public.daily_checkins group by user_id,checkin_date having count(*)>1
) duplicates;
rollback;
