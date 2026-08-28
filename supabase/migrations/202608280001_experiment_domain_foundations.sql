-- Sprint 13A.2. NOT production-approved until sprint13a2_preflight.sql is reviewed.
-- All new private tables and their account-control integration commit together.
begin;

-- TRUNCATE bypasses row policies and row triggers; API roles need neither it nor
-- the ability to install triggers on these protected data paths.
revoke truncate,trigger on public.experiments,public.experiment_interventions,public.experiment_outcomes,
 public.experiment_condition_links,public.experiment_phase_events,public.experiment_measurements,public.experiment_results,
 public.nutrition_entries,public.nutrition_entry_items from anon,authenticated;

create function public.axvital_json_keys(value jsonb, required text[], optional text[] default '{}') returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(value)='object' and value ?& required and not exists(
 select 1 from jsonb_object_keys(case when jsonb_typeof(value)='object' then value else '{}' end) k where not k=any(required||optional)),false)
$$;
create function public.axvital_valid_rule(d jsonb) returns boolean language plpgsql stable set search_path='' as $$
declare base text[]:=array['version','domain','kind','metric','operator','period']; unit_name text; v numeric;
begin
 if jsonb_typeof(d)<>'object' or octet_length(d::text)>2048 or d->'version'<>'1'::jsonb then return false;end if;
 if d->>'domain'='nutrition' and d->>'period'='day' then
  if d->>'kind'='numeric' then
   if not public.axvital_json_keys(d,base||array['value','unit']) or jsonb_typeof(d->'value')<>'number' then return false;end if;
   v:=(d->>'value')::numeric;
   unit_name:=case d->>'metric' when 'calories' then 'kcal' when 'protein_grams' then 'g' when 'carbohydrate_grams' then 'g' when 'fat_grams' then 'g' when 'fiber_grams' then 'g' when 'alcohol_occurrences' then 'count' end;
   return coalesce(v between 0 and 1000000 and d->>'unit'=unit_name and d->>'operator' in('gte','lte','eq') and (d->>'metric'<>'alcohol_occurrences' or (v=0 and d->>'operator'='eq')),false);
  elsif d->>'kind'='exclusion' then
   return public.axvital_json_keys(d,base||array['classification']) and d->>'metric'='food_classification' and d->>'operator'='excludes' and d->>'classification' in('dairy','meat','fish','egg','animal_derived','plant_derived','grain','legume','added_sugar','alcohol');
  elsif d->>'kind'='cutoff' then
   return public.axvital_json_keys(d,base||array['local_time','time_zone']) and d->>'metric'='food_time' and d->>'operator'='not_after' and d->>'local_time' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and exists(select 1 from pg_timezone_names where name=d->>'time_zone');
  end if;
 elsif d->>'domain'='exercise' then
  if not public.axvital_json_keys(d,base||array['value','unit','exercise_id']) or jsonb_typeof(d->'value')<>'number' then return false;end if;
  v:=(d->>'value')::numeric;
  return d->>'kind'='numeric' and d->>'metric'='exercise_sessions' and d->>'operator'='gte' and d->>'unit'='count' and d->>'period'='week' and v between 0 and 1000000 and trunc(v)=v and d->>'exercise_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
 end if;
 return false;
end $$;

create table public.target_rules(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 2 and 120),definition jsonb not null check(public.axvital_valid_rule(definition) is true),
 exercise_id uuid references public.exercises(id) on delete restrict,
 revision integer not null default 1 check(revision>0),archived_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,user_id),
 check((definition->>'domain'='exercise' and exercise_id is not null and exercise_id=(definition->>'exercise_id')::uuid) or (definition->>'domain'='nutrition' and exercise_id is null))
);
create table public.nutrition_patterns(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 2 and 120),description text check(char_length(description)<=1000),
 template_key text,template_version integer,revision integer not null default 1 check(revision>0),archived_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,user_id),
 check((template_key is null and template_version is null) or (template_key in('ketogenic','low_carb','vegan','vegetarian','carnivore','dairy_free') and template_version=1))
);
create table public.nutrition_pattern_rules(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 nutrition_pattern_id uuid not null,rule_id uuid not null,display_order integer not null check(display_order between 0 and 19),
 created_at timestamptz not null default now(),
 foreign key(nutrition_pattern_id,user_id) references public.nutrition_patterns(id,user_id) on delete cascade,
 foreign key(rule_id,user_id) references public.target_rules(id,user_id) on delete restrict,
 unique(nutrition_pattern_id,rule_id),unique(nutrition_pattern_id,display_order)
);
alter table public.nutrition_targets add column rule_id uuid references public.target_rules(id) on delete restrict;
create unique index nutrition_targets_rule_idx on public.nutrition_targets(rule_id) where rule_id is not null;
alter table public.nutrition_targets drop constraint nutrition_targets_target_value_check;
alter table public.nutrition_targets add constraint nutrition_targets_target_value_check check(target_value>0 or (rule_id is not null and target_value=0));

create table public.food_classification_assertions(
 id uuid primary key default gen_random_uuid(),food_id uuid not null references public.foods(id) on delete cascade,
 classification_key text not null check(classification_key in('dairy','meat','fish','egg','animal_derived','plant_derived','grain','legume','added_sugar','alcohol')),
 state text not null check(state in('present','absent','unknown')),provenance text not null check(char_length(btrim(provenance)) between 1 and 500),
 definition_version integer not null check(definition_version=1),reviewed_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(food_id,classification_key)
);
create table public.user_food_classification_assertions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 food_id uuid references public.foods(id) on delete cascade,user_food_id uuid references public.user_foods(id) on delete cascade,
 nutrition_entry_item_id uuid references public.nutrition_entry_items(id) on delete cascade,
 classification_key text not null check(classification_key in('dairy','meat','fish','egg','animal_derived','plant_derived','grain','legume','added_sugar','alcohol')),
 state text not null check(state in('present','absent','unknown')),provenance text not null check(char_length(btrim(provenance)) between 1 and 500),
 definition_version integer not null check(definition_version=1),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(num_nonnulls(food_id,user_food_id,nutrition_entry_item_id)=1)
);
create unique index private_food_global_assertion_idx on public.user_food_classification_assertions(user_id,food_id,classification_key) where food_id is not null;
create unique index private_food_owned_assertion_idx on public.user_food_classification_assertions(user_id,user_food_id,classification_key) where user_food_id is not null;
create unique index private_food_item_assertion_idx on public.user_food_classification_assertions(user_id,nutrition_entry_item_id,classification_key) where nutrition_entry_item_id is not null;
create table public.nutrition_log_days(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 local_date date not null,time_zone text not null,coverage_status text not null default 'unknown' check(coverage_status in('unknown','partial','complete')),
 confirmed_at timestamptz,revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,local_date,time_zone),
 check((coverage_status='complete')=(confirmed_at is not null))
);
-- NULL for every old log is deliberately unknown. Captured evidence is not food classification inference.
alter table public.nutrition_entry_items add column classification_snapshot jsonb check(classification_snapshot is null or (jsonb_typeof(classification_snapshot)='object' and octet_length(classification_snapshot::text)<=16384));

alter table public.experiments
 add column model_version integer not null default 1 check(model_version in(1,2)),
 add column config_revision integer not null default 1 check(config_revision>0),
 add column question text check(question is null or char_length(question)<=500),
 add column question_is_custom boolean not null default false,
 add column analysis_timezone text,
 add column baseline_mode text check(baseline_mode in('historical','prospective','none'));
alter table public.experiment_interventions
 add column rule_id uuid references public.target_rules(id) on delete restrict,
 add column nutrition_pattern_id uuid references public.nutrition_patterns(id) on delete restrict;
alter table public.experiment_interventions drop constraint experiment_interventions_intervention_type_check;
alter table public.experiment_interventions add constraint experiment_interventions_intervention_type_check check(intervention_type in('supplement','nutrition_target','nutrition_pattern','hydration_target','sleep_target','habit','protocol','workout','exposure_reduction','medication_observation','custom'));
alter table public.experiment_outcomes
 add column registry_key text,add column registry_version integer,
 add column source_config jsonb check(source_config is null or (jsonb_typeof(source_config)='object' and octet_length(source_config::text)<=2048)),
 add column exercise_id uuid references public.exercises(id) on delete restrict,
 add column user_symptom_id uuid references public.user_symptoms(id) on delete restrict,
 add column success_criterion jsonb check(success_criterion is null or (jsonb_typeof(success_criterion)='object' and octet_length(success_criterion::text)<=2048));
alter table public.experiment_outcomes drop constraint experiment_outcomes_outcome_type_check;
alter table public.experiment_outcomes add constraint experiment_outcomes_outcome_type_check check(outcome_type in('symptom_occurrence','symptom_severity','symptom_duration','sleep_quality','mood','energy','weight','habit_adherence','protocol_adherence','workout_performance','episode_frequency','episode_duration','episode_severity','episode_impact','custom_numeric','custom_binary','nutrition'));
-- No historical matching/backfill. New durable identity is explicit and owner-consistent.
alter table public.user_symptom_events add column user_symptom_id uuid;
alter table public.user_symptom_events add constraint symptom_event_user_symptom_owner foreign key(user_symptom_id,user_id) references public.user_symptoms(id,user_id) on delete restrict;
create table public.experiment_start_snapshots(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 experiment_id uuid not null unique,config_revision integer not null check(config_revision>0),snapshot_version integer not null check(snapshot_version=1),
 captured_at timestamptz not null default now(),configuration jsonb not null check(jsonb_typeof(configuration)='object' and octet_length(configuration::text)<=65536),
 source_fingerprint text not null,
 foreign key(experiment_id,user_id) references public.experiments(id,user_id) on delete cascade
);
comment on column public.experiment_start_snapshots.source_fingerprint is
 'Intervention-source-only change marker: md5 of canonical PostgreSQL JSONB source configuration with ordered arrays. Includes selected source labels, definitions, revisions and captured prescription metadata; excludes question, outcomes, experiment dates/timezone and lifecycle. Not a security primitive or full experiment digest.';

-- API roles cannot forge v2 mutations; definer RPCs below own a narrowly validated write path.
-- No caller-controlled GUC, role name argument or browser flag acts as a bypass.
create function public.axvital_v2_write_guard() returns trigger language plpgsql set search_path='' as $$
declare e public.experiments;parent_id uuid;before_row jsonb;after_row jsonb;table_owner name;
begin
 if tg_op<>'INSERT' then before_row:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then after_row:=to_jsonb(new);end if;
 -- Authoring functions and this guard are owned by the migration role, which need
 -- not own the original pre-migration domain tables. No API role can assume it.
 select pg_get_userbyid(proowner) into table_owner from pg_proc where oid='public.axvital_v2_write_guard()'::regprocedure;
 if tg_table_name='experiments' then
  if tg_op='UPDATE' and old.model_version<>new.model_version then raise exception 'MODEL_VERSION_IMMUTABLE';end if;
  if coalesce((before_row->>'model_version')::integer,1)=2 or coalesce((after_row->>'model_version')::integer,1)=2 then
   if tg_op<>'DELETE' and current_user<>table_owner then raise exception 'USE_V2_TRANSACTION';end if;
   -- Fail closed for configuration, legacy/result columns and any future column.
   -- Only migration-owned, owner-validating transactional lifecycle functions may
   -- change this runtime allowlist. Direct API writes remain rejected above.
   if tg_op='UPDATE' and exists(select 1 from public.experiment_start_snapshots where experiment_id=old.id)
    and (before_row-array['status','current_phase','actual_completed_at','paused_at','ended_early_at','archived_at','updated_at'])
     is distinct from (after_row-array['status','current_phase','actual_completed_at','paused_at','ended_early_at','archived_at','updated_at'])
    then raise exception 'STARTED_CONFIGURATION_IMMUTABLE';end if;
  end if;
 else
  foreach before_row in array array[before_row,after_row] loop
   if before_row is null then continue;end if;
   parent_id:=(before_row->>'experiment_id')::uuid;
   select * into e from public.experiments where id=parent_id for update;
   -- Parent removal permits cascade erasure, including immutable snapshot removal.
   if not found and tg_op='DELETE' then continue;end if;
   if tg_table_name='experiment_start_snapshots' then
    if tg_op<>'INSERT' then raise exception 'SNAPSHOT_IMMUTABLE';end if;
    if current_user<>table_owner then raise exception 'USE_V2_TRANSACTION';end if;
   elsif e.model_version=2 then
    if current_user<>table_owner then raise exception 'USE_V2_TRANSACTION';end if;
    if tg_table_name='experiment_phase_events' and tg_op<>'INSERT' then raise exception 'V2_EVENT_APPEND_ONLY';end if;
    if exists(select 1 from public.experiment_start_snapshots where experiment_id=parent_id) and tg_table_name<>'experiment_phase_events' then raise exception 'STARTED_CONFIGURATION_IMMUTABLE';end if;
   end if;
  end loop;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.axvital_v2_write_guard() from public,anon,authenticated;
do $$declare t text;begin foreach t in array array['experiments','experiment_interventions','experiment_outcomes','experiment_condition_links','experiment_phase_events','experiment_start_snapshots','experiment_measurements','experiment_results'] loop
 execute format('create trigger v2_write_guard before insert or update or delete on public.%I for each row execute function public.axvital_v2_write_guard()',t);
end loop;end $$;

create function public.axvital_symptom_identity_check() returns trigger language plpgsql set search_path='' as $$
declare s public.user_symptoms;
begin
 if new.user_symptom_id is null then return new;end if;
 select * into s from public.user_symptoms where id=new.user_symptom_id and user_id=new.user_id;
 if not found or new.symptom_id is distinct from s.symptom_id or (s.symptom_id is null and (tg_op='INSERT' or new.user_symptom_id is distinct from old.user_symptom_id) and new.custom_symptom_name is distinct from s.custom_symptom_name) then raise exception 'SYMPTOM_IDENTITY_MISMATCH';end if;
 return new;
end $$;
create trigger symptom_identity_check before insert or update on public.user_symptom_events for each row execute function public.axvital_symptom_identity_check();

-- Serialize selected-source mutation with start, including child insertion/deletion.
-- Per-owner locks are transient and never change source entities or schedules.
create function public.axvital_domain_owner_lock() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; owner_id uuid; ids uuid[]:='{}';
begin
 if tg_op<>'INSERT' then before_row:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then after_row:=to_jsonb(new);end if;
 foreach before_row in array array[before_row,after_row] loop
  if before_row is null then continue;end if;
  owner_id:=nullif(before_row->>'user_id','')::uuid;
  if owner_id is null and tg_table_name='nutrition_entry_items' then select user_id into owner_id from public.nutrition_entries where id=(before_row->>'nutrition_entry_id')::uuid;end if;
  if owner_id is not null then ids:=array_append(ids,owner_id);end if;
 end loop;
 for owner_id in select distinct x from unnest(ids) x order by x loop perform pg_advisory_xact_lock(hashtextextended(owner_id::text,1302));end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.axvital_domain_owner_lock() from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['target_rules','nutrition_patterns','nutrition_pattern_rules','nutrition_targets','user_food_classification_assertions','nutrition_log_days','nutrition_entries','nutrition_entry_items','planned_activities','protocol_templates','protocol_template_activities','user_protocols','user_protocol_activities','workout_templates','workout_template_groups','workout_template_exercises','workout_template_sets','user_conditions','user_symptoms'] loop
  execute format('create trigger a13_owner_lock before insert or update or delete on public.%I for each row execute function public.axvital_domain_owner_lock()',t);
 end loop;
 foreach t in array array['target_rules','nutrition_patterns','nutrition_pattern_rules','user_food_classification_assertions','nutrition_log_days','experiment_start_snapshots'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy owner_select on public.%I for select to authenticated using(user_id=(select auth.uid()))',t);
  if t<>'experiment_start_snapshots' then
   execute format('grant insert,update,delete on public.%I to authenticated',t);
   execute format('create policy owner_write on public.%I for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()))',t);
  end if;
  execute format('create index %I on public.%I(user_id)',t||'_owner_idx',t);
 end loop;
end $$;
alter table public.food_classification_assertions enable row level security;
revoke all on public.food_classification_assertions from public,anon,authenticated;
grant select on public.food_classification_assertions to authenticated;
create policy curated_read on public.food_classification_assertions for select to authenticated using(true);
create policy rule_exercise_owner on public.target_rules as restrictive for all to authenticated
 using(exercise_id is null or exists(select 1 from public.exercises e where e.id=exercise_id and (e.user_id is null or e.user_id=auth.uid())))
 with check(exercise_id is null or exists(select 1 from public.exercises e where e.id=exercise_id and (e.user_id is null or e.user_id=auth.uid())));
create policy private_evidence_subject on public.user_food_classification_assertions as restrictive for all to authenticated
 using((user_food_id is null or exists(select 1 from public.user_foods f where f.id=user_food_id and f.user_id=auth.uid())) and
 (nutrition_entry_item_id is null or exists(select 1 from public.nutrition_entry_items i join public.nutrition_entries e on e.id=i.nutrition_entry_id where i.id=nutrition_entry_item_id and e.user_id=auth.uid())))
 with check((user_food_id is null or exists(select 1 from public.user_foods f where f.id=user_food_id and f.user_id=auth.uid())) and
 (nutrition_entry_item_id is null or exists(select 1 from public.nutrition_entry_items i join public.nutrition_entries e on e.id=i.nutrition_entry_id where i.id=nutrition_entry_item_id and e.user_id=auth.uid())));
create policy nutrition_rule_owner on public.nutrition_targets as restrictive for all to authenticated
 using(rule_id is null or exists(select 1 from public.target_rules r where r.id=rule_id and r.user_id=auth.uid()))
 with check(rule_id is null or exists(select 1 from public.target_rules r where r.id=rule_id and r.user_id=auth.uid()));
create policy outcome_v2_links on public.experiment_outcomes as restrictive for all to authenticated
 using((exercise_id is null or exists(select 1 from public.exercises e where e.id=exercise_id and (e.user_id is null or e.user_id=auth.uid()))) and (user_symptom_id is null or exists(select 1 from public.user_symptoms s where s.id=user_symptom_id and s.user_id=auth.uid())))
 with check((exercise_id is null or exists(select 1 from public.exercises e where e.id=exercise_id and (e.user_id is null or e.user_id=auth.uid()))) and (user_symptom_id is null or exists(select 1 from public.user_symptoms s where s.id=user_symptom_id and s.user_id=auth.uid())));
create policy intervention_v2_links on public.experiment_interventions as restrictive for all to authenticated
 using((rule_id is null or exists(select 1 from public.target_rules r where r.id=rule_id and r.user_id=auth.uid())) and (nutrition_pattern_id is null or exists(select 1 from public.nutrition_patterns p where p.id=nutrition_pattern_id and p.user_id=auth.uid())))
 with check((rule_id is null or exists(select 1 from public.target_rules r where r.id=rule_id and r.user_id=auth.uid())) and (nutrition_pattern_id is null or exists(select 1 from public.nutrition_patterns p where p.id=nutrition_pattern_id and p.user_id=auth.uid())));

create function public.axvital_rule_projection() returns trigger language plpgsql set search_path='' as $$
declare d jsonb; target_name text;
begin
 if tg_op='UPDATE' and old.rule_id is not null and new.rule_id is distinct from old.rule_id then raise exception 'CANONICAL_RULE_LINK_IMMUTABLE';end if;
 if new.rule_id is null then return new;end if;
 select definition into d from public.target_rules where id=new.rule_id and user_id=new.user_id;
 if d is null or d->>'domain'<>'nutrition' or d->>'kind'<>'numeric' then raise exception 'INVALID_NUTRITION_RULE';end if;
 target_name:=case d->>'metric' when 'calories' then 'calories' when 'protein_grams' then 'protein' when 'carbohydrate_grams' then 'carbohydrates' when 'fat_grams' then 'fat' when 'fiber_grams' then 'fiber' end;
 if target_name is null then raise exception 'RULE_HAS_NO_LEGACY_PROJECTION';end if;
 if new.target_type is distinct from target_name or new.unit is distinct from d->>'unit' or new.target_value is distinct from (d->>'value')::numeric then raise exception 'EDIT_CANONICAL_RULE';end if;
 return new;
end $$;
create trigger nutrition_target_canonical before insert or update on public.nutrition_targets for each row execute function public.axvital_rule_projection();
create function public.axvital_rule_changed() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.user_id<>old.user_id or new.id<>old.id then raise exception 'RULE_IDENTITY_IMMUTABLE';end if;
  if exists(select 1 from public.nutrition_pattern_rules where rule_id=old.id) and new.definition->>'domain'<>'nutrition' then raise exception 'PATTERN_REQUIRES_NUTRITION_RULE';end if;
  if exists(select 1 from public.nutrition_targets where rule_id=old.id) and (new.definition->>'kind'<>'numeric' or new.definition->>'metric' not in('calories','protein_grams','carbohydrate_grams','fat_grams','fiber_grams')) then raise exception 'RULE_HAS_NO_LEGACY_PROJECTION';end if;
  new.revision:=old.revision+1;new.updated_at:=now();
 end if;return new;
end $$;
create trigger rule_revision before update on public.target_rules for each row execute function public.axvital_rule_changed();
create function public.axvital_refresh_rule_projection() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.nutrition_targets set target_type=case new.definition->>'metric' when 'calories' then 'calories' when 'protein_grams' then 'protein' when 'carbohydrate_grams' then 'carbohydrates' when 'fat_grams' then 'fat' when 'fiber_grams' then 'fiber' end,
 target_value=(new.definition->>'value')::numeric,unit=new.definition->>'unit'
 where rule_id=new.id and user_id=new.user_id;
 return new;
end $$;
revoke all on function public.axvital_refresh_rule_projection() from public,anon,authenticated;
create trigger rule_projection_refresh after update on public.target_rules for each row execute function public.axvital_refresh_rule_projection();
create function public.axvital_pattern_member_check() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.target_rules where id=new.rule_id and user_id=new.user_id and definition->>'domain'='nutrition') then raise exception 'PATTERN_REQUIRES_OWNED_NUTRITION_RULE';end if;
 return new;
end $$;
create trigger pattern_member_check before insert or update on public.nutrition_pattern_rules for each row execute function public.axvital_pattern_member_check();

create function public.axvital_pattern_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id<>old.id or new.user_id<>old.user_id then raise exception 'PATTERN_IDENTITY_IMMUTABLE';end if;
 new.revision:=old.revision+1;new.updated_at:=now();return new;
end $$;
create trigger pattern_revision before update on public.nutrition_patterns for each row execute function public.axvital_pattern_revision();
create function public.axvital_pattern_members_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op<>'INSERT' then update public.nutrition_patterns set updated_at=now() where id=old.nutrition_pattern_id and user_id=old.user_id;end if;
 if tg_op<>'DELETE' then update public.nutrition_patterns set updated_at=now() where id=new.nutrition_pattern_id and user_id=new.user_id;end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.axvital_pattern_members_changed() from public,anon,authenticated;
create trigger pattern_members_changed after insert or update or delete on public.nutrition_pattern_rules for each row execute function public.axvital_pattern_members_changed();

create function public.axvital_coverage_validate() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from pg_timezone_names where name=new.time_zone) then raise exception 'INVALID_TIME_ZONE';end if;
 if new.local_date>(now() at time zone new.time_zone)::date then raise exception 'FUTURE_COVERAGE';end if;
 if tg_op='UPDATE' then new.revision:=old.revision+1;end if;
 new.confirmed_at:=case when new.coverage_status='complete' then now() else null end;new.updated_at:=now();return new;
end $$;
create trigger coverage_validate before insert or update on public.nutrition_log_days for each row execute function public.axvital_coverage_validate();
create function public.axvital_invalidate_nutrition_coverage() returns trigger language plpgsql security definer set search_path='' as $$
declare entry_id uuid; row_data jsonb; owner_id uuid; consumed timestamptz;
begin
 for row_data in select x from unnest(array[case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end]) x where x is not null loop
  if tg_table_name='nutrition_entries' then owner_id:=(row_data->>'user_id')::uuid;consumed:=(row_data->>'consumed_at')::timestamptz;
  else entry_id:=(row_data->>'nutrition_entry_id')::uuid;select user_id,consumed_at into owner_id,consumed from public.nutrition_entries where id=entry_id;end if;
  update public.nutrition_log_days set coverage_status='unknown',confirmed_at=null where user_id=owner_id and local_date=(consumed at time zone time_zone)::date and coverage_status<>'unknown';
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.axvital_invalidate_nutrition_coverage() from public,anon,authenticated;
create trigger nutrition_entry_coverage before insert or update or delete on public.nutrition_entries for each row execute function public.axvital_invalidate_nutrition_coverage();
create trigger nutrition_item_coverage before insert or update or delete on public.nutrition_entry_items for each row execute function public.axvital_invalidate_nutrition_coverage();
create function public.axvital_capture_food_evidence() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid; evidence jsonb;
begin
 select user_id into owner_id from public.nutrition_entries where id=new.nutrition_entry_id;
 if tg_op='UPDATE' then
  if new.classification_snapshot is distinct from old.classification_snapshot or new.food_id is distinct from old.food_id or new.food_serving_id is distinct from old.food_serving_id or new.user_food_id is distinct from old.user_food_id or new.nutrition_entry_id<>old.nutrition_entry_id then raise exception 'LOG_SOURCE_EVIDENCE_IMMUTABLE';end if;
  return new;
 end if;
 if new.food_serving_id is not null and not exists(select 1 from public.food_servings where id=new.food_serving_id and food_id=new.food_id) then raise exception 'FOOD_SERVING_MISMATCH';end if;
 if new.user_food_id is not null and not exists(select 1 from public.user_foods where id=new.user_food_id and user_id=owner_id) then raise exception 'FOOD_OWNER_MISMATCH';end if;
 select coalesce(jsonb_agg(jsonb_build_object('classification_key',classification_key,'state',state,'provenance',provenance,'definition_version',definition_version) order by classification_key),'[]') into evidence from (
  select distinct on(classification_key) classification_key,state,provenance,definition_version from (
   select classification_key,state,provenance,definition_version,1 priority from public.user_food_classification_assertions where user_id=owner_id and ((food_id=new.food_id and food_id is not null) or (user_food_id=new.user_food_id and user_food_id is not null))
   union all select classification_key,state,provenance,definition_version,2 from public.food_classification_assertions where food_id=new.food_id
  ) all_evidence order by classification_key,priority
 ) selected;
 new.classification_snapshot:=jsonb_build_object('version',1,'missing_state','unknown','evidence',evidence);return new;
end $$;
revoke all on function public.axvital_capture_food_evidence() from public,anon,authenticated;
create trigger nutrition_item_evidence before insert or update on public.nutrition_entry_items for each row execute function public.axvital_capture_food_evidence();

create or replace function public.axvital_account_schema_issues(require_coordination boolean)
returns table(table_name text, issue text) language plpgsql stable security invoker set search_path='' as $$
declare entry record; relation oid; owner_att smallint; parent_id oid; parent_att smallint;
contract jsonb;
begin
 select jsonb_agg(to_jsonb(m)) into contract from (values
 ('target_rules','user_id','auth.users','c',false,false),
('nutrition_patterns','user_id','auth.users','c',false,false),
('nutrition_pattern_rules','user_id','auth.users','c',false,false),
('user_food_classification_assertions','user_id','auth.users','c',false,false),
('nutrition_log_days','user_id','auth.users','c',false,false),
('experiment_start_snapshots','user_id','auth.users','c',false,false), 
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
 -- 13A links are part of the deletion contract, not merely the Auth ownership FK.
 for entry in select * from (values
  ('target_rules','exercise_id','exercises','r',false),
  ('nutrition_pattern_rules','nutrition_pattern_id','nutrition_patterns','c',true),
  ('nutrition_pattern_rules','rule_id','target_rules','r',true),
  ('nutrition_targets','rule_id','target_rules','r',false),
  ('user_food_classification_assertions','user_food_id','user_foods','c',false),
  ('user_food_classification_assertions','nutrition_entry_item_id','nutrition_entry_items','c',false),
  ('experiment_start_snapshots','experiment_id','experiments','c',true),
  ('experiment_interventions','rule_id','target_rules','r',false),
  ('experiment_interventions','nutrition_pattern_id','nutrition_patterns','r',false),
  ('experiment_outcomes','exercise_id','exercises','r',false),
  ('experiment_outcomes','user_symptom_id','user_symptoms','r',false),
  ('user_symptom_events','user_symptom_id','user_symptoms','r',true)
 ) m(name,column_name,parent,delete_action,composite_owner) loop
  if not exists(
   select 1 from pg_constraint fk
   join pg_attribute ca on ca.attrelid=fk.conrelid and ca.attnum=fk.conkey[1]
   join pg_attribute pa on pa.attrelid=fk.confrelid and pa.attnum=fk.confkey[1]
   where fk.conrelid=to_regclass('public.'||entry.name) and fk.confrelid=to_regclass('public.'||entry.parent)
    and fk.contype='f' and fk.convalidated and ca.attname=entry.column_name and pa.attname='id' and fk.confdeltype::text=entry.delete_action
    and cardinality(fk.conkey)=case when entry.composite_owner then 2 else 1 end
    and (not entry.composite_owner or (
     exists(select 1 from pg_attribute where attrelid=fk.conrelid and attnum=fk.conkey[2] and attname='user_id') and
     exists(select 1 from pg_attribute where attrelid=fk.confrelid and attnum=fk.confkey[2] and attname='user_id')))
  ) then table_name:=entry.name;issue:='RELATIONSHIP_FK_REQUIRED:'||entry.column_name;return next;end if;
 end loop;
 -- Unknown public FK dependents require review; never cascade/delete them by guesswork.
 return query select child.relname::text,'UNREVIEWED_INCOMING_FK'::text
 from pg_constraint fk join pg_class child on child.oid=fk.conrelid join pg_namespace ns on ns.oid=child.relnamespace
 where fk.contype='f' and ns.nspname='public'
 and not exists(select 1 from jsonb_array_elements(contract) m where m->>'name'=child.relname)
 and (fk.confrelid='auth.users'::regclass or exists(select 1 from jsonb_array_elements(contract) m where to_regclass('public.'||(m->>'name'))=fk.confrelid));
end $$;

create or replace function public.axvital_export_account() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare source record; rows jsonb; result jsonb := '{}'::jsonb; manifest jsonb := '{}'::jsonb; row_count integer;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 perform public.axvital_assert_account_schema(false);
 for source in select * from (values
('target_rules','r.user_id=auth.uid()'),
('nutrition_patterns','r.user_id=auth.uid()'),
('nutrition_pattern_rules','r.user_id=auth.uid()'),
('user_food_classification_assertions','r.user_id=auth.uid()'),
('nutrition_log_days','r.user_id=auth.uid()'),
('experiment_start_snapshots','r.user_id=auth.uid()'),
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
 return jsonb_build_object('export_version','axvital.account.v2','generated_at',statement_timestamp(),'export_manifest',manifest,'data',result);
end $$;

create or replace function public.axvital_cleanup_deleted_account() returns trigger language plpgsql security definer set search_path='' as $$
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
 foreach t in array array['experiments','nutrition_patterns','nutrition_targets','target_rules','user_food_classification_assertions','nutrition_log_days','condition_episodes','user_symptom_events','user_symptoms','user_conditions','workout_sessions','planned_workouts','user_protocols','planned_activities','protocol_templates','workout_templates','exercises','nutrition_entries','saved_meals','user_foods','user_food_preferences','user_insights','weekly_recaps','health_events','daily_checkins','subscriptions','product_events'] loop
  if t='user_insights' and to_regclass('public.user_insights') is null then continue; end if;
  execute format('delete from public.%I where user_id=$1',t) using old.id;
 end loop;
 delete from public.profiles where id=old.id;
 return old;
end $$;

-- 005 billing coordination functions and feature flags are deliberately unchanged.

revoke all on function public.axvital_json_keys(jsonb,text[],text[]),public.axvital_valid_rule(jsonb) from public,anon,authenticated;
grant execute on function public.axvital_json_keys(jsonb,text[],text[]),public.axvital_valid_rule(jsonb) to authenticated;
revoke all on function public.axvital_symptom_identity_check(),public.axvital_rule_projection(),public.axvital_rule_changed(),public.axvital_pattern_member_check(),public.axvital_pattern_revision(),public.axvital_coverage_validate() from public,anon,authenticated;

select public.axvital_assert_account_schema(true);

commit;
