begin;
-- Explicit account schema contract. Catalog inspection validates this list; it
-- never discovers additional tables to delete. Optional means absent is allowed,
-- not that a present incompatible table may silently be skipped.
create function public.axvital_account_schema_issues(require_coordination boolean)
returns table(table_name text, issue text) language plpgsql stable security invoker set search_path='' as $$
declare entry record; relation oid; owner_att smallint; parent_id oid; parent_att smallint;
contract jsonb;
begin
 select jsonb_agg(to_jsonb(m)) into contract from (values
 ('profiles','id','auth.users','c',false,false),
 ('daily_checkins','user_id','auth.users','c',false,false),
 ('health_events','user_id','auth.users','c',false,false),
 ('weekly_recaps','user_id','auth.users','c',false,false),
 ('planned_activities','user_id','auth.users','c',false,false),
 ('planned_activity_occurrences','user_id','auth.users','c',false,false),
 ('protocol_templates','user_id','auth.users','c',false,false),
 ('protocol_template_activities','user_id','auth.users','c',false,false),
 ('user_protocols','user_id','auth.users','c',false,false),
 ('user_protocol_activities','user_id','auth.users','c',false,false),
 ('protocol_pause_periods','user_id','auth.users','c',false,false),
 ('workout_templates','user_id','auth.users','c',false,false),
 ('workout_template_groups','user_id','auth.users','c',false,false),
 ('workout_template_exercises','user_id','auth.users','c',false,false),
 ('workout_template_sets','user_id','auth.users','c',false,false),
 ('planned_workouts','user_id','auth.users','c',false,false),
 ('planned_workout_exercises','user_id','auth.users','c',false,false),
 ('planned_workout_sets','user_id','auth.users','c',false,false),
 ('workout_sessions','user_id','auth.users','c',false,false),
 ('workout_session_exercises','user_id','auth.users','c',false,false),
 ('workout_session_sets','user_id','auth.users','c',false,false),
 ('user_conditions','user_id','auth.users','c',false,false),
 ('user_symptoms','user_id','auth.users','c',false,false),
 ('user_symptom_events','user_id','auth.users','c',false,false),
 ('experiments','user_id','auth.users','c',false,false),
 ('experiment_phase_events','user_id','auth.users','c',false,false),
 ('experiment_measurements','user_id','auth.users','c',false,false),
 ('user_foods','user_id','auth.users','c',false,false),
 ('nutrition_entries','user_id','auth.users','c',false,false),
 ('user_food_preferences','user_id','auth.users','c',false,false),
 ('saved_meals','user_id','auth.users','c',false,false),
 ('nutrition_targets','user_id','auth.users','c',false,false),
 ('condition_episodes','user_id','auth.users','c',false,false),
 ('episode_updates','user_id','auth.users','c',false,false),
 ('subscriptions','user_id','auth.users','c',false,false),
 ('exercises','user_id','auth.users','c',false,false),
 ('user_insights','user_id','auth.users','c',true,false),
 ('nutrition_entry_items','nutrition_entry_id','public.nutrition_entries','c',false,false),
 ('saved_meal_items','saved_meal_id','public.saved_meals','c',false,false),
 ('symptom_event_conditions','symptom_event_id','public.user_symptom_events','c',false,false),
 ('experiment_interventions','experiment_id','public.experiments','c',false,false),
 ('experiment_outcomes','experiment_id','public.experiments','c',false,false),
 ('experiment_condition_links','experiment_id','public.experiments','c',false,false),
 ('experiment_results','experiment_id','public.experiments','c',false,false),
 ('episode_symptom_links','condition_episode_id','public.condition_episodes','c',false,false),
 ('product_events','user_id','auth.users','n',false,false),
 ('api_request_budgets','user_id','auth.users','c',false,false),
 ('account_deletions','user_id','auth.users','c',false,false),
 ('billing_customer_provisions','user_id','auth.users','c',false,true)
 ) m(name,owner_column,parent,delete_action,optional,coordination);
 for entry in select * from jsonb_to_recordset(contract) as m(name text,owner_column text,parent text,delete_action text,optional boolean,coordination boolean) loop
  if entry.coordination and not require_coordination then continue; end if;
  relation:=to_regclass('public.'||entry.name);
  if relation is null then
   if not entry.optional then table_name:=entry.name;issue:='MISSING_REQUIRED_TABLE';return next;end if;
   continue;
  end if;
  if not exists(select 1 from pg_class where oid=relation and relkind in ('r','p') and relrowsecurity) then
   table_name:=entry.name;issue:='TABLE_OR_RLS_REQUIRED';return next;
  end if;
  if entry.name not in ('product_events','api_request_budgets','account_deletions','billing_customer_provisions') then
   if not has_table_privilege('authenticated',relation,'SELECT') or not exists(
    select 1 from pg_policy pol where pol.polrelid=relation and pol.polpermissive and pol.polcmd in ('r','*')
    and (0=any(pol.polroles) or (select oid from pg_roles where rolname='authenticated')=any(pol.polroles))) then
    table_name:=entry.name;issue:='EXPORT_SELECT_ACCESS_REQUIRED';return next;
   end if;
  end if;
  select attnum into owner_att from pg_attribute where attrelid=relation and attname=entry.owner_column and not attisdropped and atttypid='uuid'::regtype;
  if owner_att is null then table_name:=entry.name;issue:='OWNERSHIP_COLUMN_REQUIRED';return next;continue;end if;
  parent_id:=to_regclass(entry.parent);
  select attnum into parent_att from pg_attribute where attrelid=parent_id and attname='id' and not attisdropped and atttypid='uuid'::regtype;
  if not exists(select 1 from pg_constraint where conrelid=relation and confrelid=parent_id and contype='f' and convalidated
   and conkey=array[owner_att] and confkey=array[parent_att] and confdeltype::text=entry.delete_action) then
   table_name:=entry.name;issue:='OWNERSHIP_FK_ACTION_REQUIRED';return next;
  end if;
 end loop;
 -- Operational columns read by the prepared-deletion and billing checks.
 for entry in select * from (values
  ('account_deletions','billing_closed','boolean',false),
  ('subscriptions','stripe_customer_id','text',false),
  ('billing_customer_provisions','stripe_customer_id','text',true)
 ) m(name,column_name,type_name,coordination) loop
  if entry.coordination and not require_coordination then continue; end if;
  if not exists(select 1 from pg_attribute where attrelid=to_regclass('public.'||entry.name) and attname=entry.column_name and not attisdropped and atttypid=to_regtype(entry.type_name)) then
   table_name:=entry.name;issue:='OPERATIONAL_COLUMN_REQUIRED';return next;
  end if;
 end loop;
 -- Unknown public FK dependents require review; never cascade/delete them by guesswork.
 return query select child.relname::text,'UNREVIEWED_INCOMING_FK'::text
 from pg_constraint fk join pg_class child on child.oid=fk.conrelid join pg_namespace ns on ns.oid=child.relnamespace
 where fk.contype='f' and ns.nspname='public'
 and not exists(select 1 from jsonb_array_elements(contract) m where m->>'name'=child.relname)
 and (fk.confrelid='auth.users'::regclass or exists(select 1 from jsonb_array_elements(contract) m where to_regclass('public.'||(m->>'name'))=fk.confrelid));
end $$;
revoke all on function public.axvital_account_schema_issues(boolean) from public,anon,authenticated;
grant execute on function public.axvital_account_schema_issues(boolean) to authenticated,service_role;

create function public.axvital_assert_account_schema(require_coordination boolean) returns void
language plpgsql stable security invoker set search_path='' as $$
declare problems text;
begin
 select string_agg(table_name||':'||issue,', ' order by table_name,issue) into problems from public.axvital_account_schema_issues(require_coordination);
 if problems is not null then raise exception 'ACCOUNT_SCHEMA_REVIEW_REQUIRED' using detail=problems; end if;
end $$;
revoke all on function public.axvital_assert_account_schema(boolean) from public,anon,authenticated;
grant execute on function public.axvital_assert_account_schema(boolean) to authenticated,service_role;

-- 005 replaces this hook to require coordination schema and resolved state.
create function public.axvital_assert_deletion_contract(target_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.axvital_assert_account_schema(false);
end $$;
revoke all on function public.axvital_assert_deletion_contract(uuid) from public,anon,authenticated;
grant execute on function public.axvital_assert_deletion_contract(uuid) to service_role;

-- Legacy insights existed before checked-in migrations. Do not invent its schema.
do $$ begin if to_regclass('public.user_insights') is not null then
 if not exists(select 1 from pg_attribute where attrelid=to_regclass('public.user_insights') and attname='user_id' and not attisdropped and atttypid='uuid'::regtype) then
  raise exception 'ACCOUNT_SCHEMA_REVIEW_REQUIRED' using detail='user_insights:OWNERSHIP_COLUMN_REQUIRED';
 end if;
 alter table public.user_insights enable row level security;
 create policy sprint12b_insight_owner on public.user_insights as restrictive for all to public using(user_id=auth.uid()) with check(user_id=auth.uid());
end if; end $$;

-- No owner parameter. SECURITY INVOKER plus explicit owner predicates and RLS.
-- STABLE gives all source reads the calling statement's consistent snapshot.
create function public.axvital_export_account() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare source record; rows jsonb; result jsonb := '{}'::jsonb; manifest jsonb := '{}'::jsonb; row_count integer;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 perform public.axvital_assert_account_schema(false);
 for source in select * from (values
('profiles','r.id=auth.uid()'),
('daily_checkins','r.user_id=auth.uid()'),
('health_events','r.user_id=auth.uid()'),
('weekly_recaps','r.user_id=auth.uid()'),
('planned_activities','r.user_id=auth.uid()'),
('planned_activity_occurrences','r.user_id=auth.uid()'),
('protocol_templates','r.user_id=auth.uid()'),
('protocol_template_activities','r.user_id=auth.uid()'),
('user_protocols','r.user_id=auth.uid()'),
('user_protocol_activities','r.user_id=auth.uid()'),
('protocol_pause_periods','r.user_id=auth.uid()'),
('workout_templates','r.user_id=auth.uid()'),
('workout_template_groups','r.user_id=auth.uid()'),
('workout_template_exercises','r.user_id=auth.uid()'),
('workout_template_sets','r.user_id=auth.uid()'),
('planned_workouts','r.user_id=auth.uid()'),
('planned_workout_exercises','r.user_id=auth.uid()'),
('planned_workout_sets','r.user_id=auth.uid()'),
('workout_sessions','r.user_id=auth.uid()'),
('workout_session_exercises','r.user_id=auth.uid()'),
('workout_session_sets','r.user_id=auth.uid()'),
('user_conditions','r.user_id=auth.uid()'),
('user_symptoms','r.user_id=auth.uid()'),
('user_symptom_events','r.user_id=auth.uid()'),
('experiments','r.user_id=auth.uid()'),
('experiment_phase_events','r.user_id=auth.uid()'),
('experiment_measurements','r.user_id=auth.uid()'),
('user_foods','r.user_id=auth.uid()'),
('nutrition_entries','r.user_id=auth.uid()'),
('user_food_preferences','r.user_id=auth.uid()'),
('saved_meals','r.user_id=auth.uid()'),
('nutrition_targets','r.user_id=auth.uid()'),
('condition_episodes','r.user_id=auth.uid()'),
('episode_updates','r.user_id=auth.uid()'),
('subscriptions','r.user_id=auth.uid()'),
('exercises','r.user_id=auth.uid()'),
('user_insights','r.user_id=auth.uid()'),
('nutrition_entry_items','exists(select 1 from public.nutrition_entries p where p.id=r.nutrition_entry_id and p.user_id=auth.uid())'),
('saved_meal_items','exists(select 1 from public.saved_meals p where p.id=r.saved_meal_id and p.user_id=auth.uid())'),
('symptom_event_conditions','exists(select 1 from public.user_symptom_events p where p.id=r.symptom_event_id and p.user_id=auth.uid())'),
('experiment_interventions','exists(select 1 from public.experiments p where p.id=r.experiment_id and p.user_id=auth.uid())'),
('experiment_outcomes','exists(select 1 from public.experiments p where p.id=r.experiment_id and p.user_id=auth.uid())'),
('experiment_condition_links','exists(select 1 from public.experiments p where p.id=r.experiment_id and p.user_id=auth.uid())'),
('experiment_results','exists(select 1 from public.experiments p where p.id=r.experiment_id and p.user_id=auth.uid())'),
('episode_symptom_links','exists(select 1 from public.condition_episodes p where p.id=r.condition_episode_id and p.user_id=auth.uid())')
 ) as sources(table_name,predicate) loop
  if source.table_name='user_insights' and to_regclass('public.user_insights') is null then
   manifest := manifest || jsonb_build_object(source.table_name,jsonb_build_object('status','not_present_in_schema','rows',0));
   continue;
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(r)-''user_id''),''[]''::jsonb) from (select * from public.%I r where %s order by to_jsonb(r)::text limit 10001) r',source.table_name,source.predicate) into rows;
  row_count := jsonb_array_length(rows);
  if row_count>10000 then raise exception 'EXPORT_TOO_LARGE'; end if;
  if source.table_name in ('profiles','subscriptions') then
   select coalesce(jsonb_agg((select jsonb_object_agg(k,v) from jsonb_each(item) e(k,v) where k=any(case when source.table_name='profiles' then array['id','email','full_name','preferred_name','primary_goal','tracking_mode','birth_month','birth_year','current_weight','goal_weight','typical_sleep_hours','health_focus_note','onboarding_completed','created_at','updated_at'] else array['plan','status','current_period_start','current_period_end','cancel_at_period_end','trial_start','trial_end','created_at','updated_at'] end))),'[]'::jsonb) into rows from jsonb_array_elements(rows) item;
  end if;
  result := result || jsonb_build_object(source.table_name,rows);
  manifest := manifest || jsonb_build_object(source.table_name,jsonb_build_object('status','included','rows',row_count));
  if octet_length(result::text)>3145728 then raise exception 'EXPORT_TOO_LARGE'; end if;
 end loop;
 return jsonb_build_object('export_version','axvital.account.v1','generated_at',statement_timestamp(),'export_manifest',manifest,'data',result);
end $$;
revoke all on function public.axvital_export_account() from public,anon,authenticated;
grant execute on function public.axvital_export_account() to authenticated;

create table public.account_deletions(
 user_id uuid primary key references auth.users(id) on delete cascade,
 requested_at timestamptz not null default now(), billing_closed boolean not null default false
);
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from public,anon,authenticated;
grant all on public.account_deletions to service_role;

-- Serialize billing projection writes and the start of deletion on the Auth row.
create function public.axvital_begin_account_deletion(target_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from auth.users where id=target_user for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
 perform public.axvital_assert_deletion_contract(target_user);
 insert into public.account_deletions(user_id) values(target_user) on conflict do nothing;
end $$;
revoke all on function public.axvital_begin_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.axvital_begin_account_deletion(uuid) to service_role;
create function public.axvital_guard_billing_during_deletion() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from auth.users where id=new.user_id for update;
 if exists(select 1 from public.account_deletions where user_id=new.user_id) then raise exception 'ACCOUNT_DELETION_PENDING'; end if;
 return new;
end $$;
revoke all on function public.axvital_guard_billing_during_deletion() from public,anon,authenticated;
create trigger account_deletion_billing_guard before insert or update on public.subscriptions for each row execute function public.axvital_guard_billing_during_deletion();

create function public.axvital_cleanup_deleted_account() returns trigger language plpgsql security definer set search_path='' as $$
declare t text; r record; child_owner text; parent_owner text; invalid_link boolean;
paths jsonb := '{"nutrition_entry_items":["nutrition_entries","nutrition_entry_id"],"saved_meal_items":["saved_meals","saved_meal_id"],"symptom_event_conditions":["user_symptom_events","symptom_event_id"],"experiment_interventions":["experiments","experiment_id"],"experiment_outcomes":["experiments","experiment_id"],"experiment_condition_links":["experiments","experiment_id"],"experiment_results":["experiments","experiment_id"],"episode_symptom_links":["condition_episodes","condition_episode_id"]}';
begin
 -- Full validation completes before the first DELETE or operational row read.
 -- 005 strengthens this hook and requires its coordination table to remain present.
 perform public.axvital_assert_deletion_contract(old.id);
 if not exists(select 1 from public.account_deletions where user_id=old.id and billing_closed) then raise exception 'ACCOUNT_DELETION_NOT_PREPARED'; end if;
 -- Existing corrupt cross-owner references must not cascade into another account.
 for r in
  select child.relname child_table,parent.relname parent_table,
   (select string_agg(format('parent.%I=child.%I',pa.attname,ca.attname),' and ' order by keys.position)
    from unnest(c.conkey,c.confkey) with ordinality keys(child_att,parent_att,position)
    join pg_attribute ca on ca.attrelid=c.conrelid and ca.attnum=keys.child_att
    join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=keys.parent_att) join_condition
  from pg_constraint c join pg_class child on child.oid=c.conrelid join pg_class parent on parent.oid=c.confrelid
  join pg_namespace ns on ns.oid=child.relnamespace join pg_namespace pn on pn.oid=parent.relnamespace
  where c.contype='f' and ns.nspname='public' and pn.nspname='public'
  and (child.relname='profiles' or paths ? child.relname or exists(select 1 from pg_attribute ca where ca.attrelid=child.oid and ca.attname='user_id'))
  and (parent.relname='profiles' or paths ? parent.relname or exists(select 1 from pg_attribute pa where pa.attrelid=parent.oid and pa.attname='user_id'))
 loop
  child_owner := case when r.child_table='profiles' then 'child.id' when paths ? r.child_table then format('(select p.user_id from public.%I p where p.id=child.%I)',paths->r.child_table->>0,paths->r.child_table->>1) else 'child.user_id' end;
  parent_owner := case when r.parent_table='profiles' then 'parent.id' when paths ? r.parent_table then format('(select p.user_id from public.%I p where p.id=parent.%I)',paths->r.parent_table->>0,paths->r.parent_table->>1) else 'parent.user_id' end;
  execute format('select exists(select 1 from public.%I child join public.%I parent on %s where ((%s)=$1 or (%s)=$1) and (%s) is distinct from (%s) %s)',r.child_table,r.parent_table,r.join_condition,child_owner,parent_owner,child_owner,parent_owner,case when r.parent_table='exercises' then 'and parent.user_id is not null' else '' end) into invalid_link using old.id;
  if invalid_link then raise exception 'ACCOUNT_RELATIONSHIP_REVIEW_REQUIRED'; end if;
 end loop;
 foreach t in array array['experiments','condition_episodes','user_symptom_events','user_symptoms','user_conditions','workout_sessions','planned_workouts','user_protocols','planned_activities','protocol_templates','workout_templates','exercises','nutrition_entries','saved_meals','user_foods','user_food_preferences','nutrition_targets','user_insights','weekly_recaps','health_events','daily_checkins','subscriptions','product_events'] loop
  if t='user_insights' and to_regclass('public.user_insights') is null then continue; end if;
  execute format('delete from public.%I where user_id=$1',t) using old.id;
 end loop;
 delete from public.profiles where id=old.id;
 return old;
end $$;
revoke all on function public.axvital_cleanup_deleted_account() from public,anon,authenticated;
-- Auth service deletion and all application cleanup occur in the SAME transaction.
create trigger axvital_account_cleanup before delete on auth.users for each row execute function public.axvital_cleanup_deleted_account();
-- Abort the whole unapplied migration cleanly if the declared contract is unmet.
select public.axvital_assert_account_schema(false);
commit;
