-- Sprint 13A.11: no guessed historical backfill. Existing weight values survive.
begin;
alter table public.daily_checkins
 add column if not exists weight_source_value numeric,
 add column if not exists weight_source_unit text,
 add column if not exists weight_provenance_version integer,
 add column if not exists weight_kg numeric generated always as
 (case when weight_provenance_version=1 and weight_source_unit='kg' then weight_source_value
       when weight_provenance_version=1 and weight_source_unit='lb' then weight_source_value*0.45359237 end) stored;

create or replace function public.axvital_weight_provenance() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 -- An older writer changing only the compatibility value cannot inherit proof.
 if tg_op='UPDATE' then
  if new.weight is distinct from old.weight
   and new.weight_source_value is not distinct from old.weight_source_value
   and new.weight_source_unit is not distinct from old.weight_source_unit
   and new.weight_provenance_version is not distinct from old.weight_provenance_version then
   new.weight_source_value:=null;new.weight_source_unit:=null;new.weight_provenance_version:=null;
  end if;
 end if;
 if num_nonnulls(new.weight_source_value,new.weight_source_unit,new.weight_provenance_version)=0 then return new;end if;
 if num_nonnulls(new.weight_source_value,new.weight_source_unit,new.weight_provenance_version)<>3
  or new.weight_source_unit not in('kg','lb') or new.weight_provenance_version<>1
  or new.weight_source_value<=0 or new.weight_source_value::text in('NaN','Infinity','-Infinity')
 then raise exception 'INVALID_WEIGHT_PROVENANCE';end if;
 -- Compatibility readers retain their existing pounds convention for NEW proof.
 new.weight:=case when new.weight_source_unit='lb' then new.weight_source_value else new.weight_source_value/0.45359237 end;
 return new;
end $$;
revoke all on function public.axvital_weight_provenance() from public,anon,authenticated,service_role;
drop trigger if exists axvital_weight_provenance on public.daily_checkins;
create trigger axvital_weight_provenance before insert or update on public.daily_checkins
for each row execute function public.axvital_weight_provenance();

-- Preserve every old version verbatim; only add an explicit v2 weight contract.
do $$ begin
 if to_regprocedure('public.axvital_outcome_definition_pre_weight(text,integer)') is null then
  alter function public.axvital_outcome_definition(text,integer) rename to axvital_outcome_definition_pre_weight;
 end if;
end $$;
create or replace function public.axvital_outcome_definition(key text,version integer) returns jsonb
language sql immutable set search_path='' as $$
 select case when key='body_weight' and version=2 then
 '{"key":"body_weight","version":2,"label":"Body Weight","target":"none","sourceAdapter":"checkins","unit":"kg","grain":"day","aggregations":["average","median"],"direction":["increase","decrease","maintain","unknown"],"scale":"ratio","eligibility":"Positive explicitly unit-verified daily check-in weight","limitations":"Unverified historical units are excluded; self-reported weight is not measurement accuracy","baselineRecommendation":{"windowDays":14,"observations":5},"enabled":true,"legacyType":"weight"}'::jsonb
 else public.axvital_outcome_definition_pre_weight(key,version) end;
$$;
revoke all on function public.axvital_outcome_definition(text,integer) from public,anon,authenticated,service_role;
revoke all on function public.axvital_outcome_definition_pre_weight(text,integer) from public,anon,authenticated,service_role;

-- Guarded edits keep the existing transaction, ownership and lifecycle contracts.
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('public.axvital_validate_outcome_input(jsonb,uuid)'::regprocedure);
 if position('o->''registry_version''<>''1''::jsonb' in definition)>0 then
  definition:=replace(definition,'o->''registry_version''<>''1''::jsonb','o->''registry_version''<>d->''version''');
  execute definition;
 elsif position('o->''registry_version''<>d->''version''' in definition)=0 then raise exception 'WEIGHT_VALIDATOR_PATCH_MISMATCH';end if;
 definition:=pg_get_functiondef('public.axvital_save_experiment_v2_internal(uuid,integer,jsonb)'::regprocedure);
 if position('o->>''registry_key'',1,''{}''' in definition)>0 then
  definition:=replace(definition,'o->>''registry_key'',1,''{}''','o->>''registry_key'',(o->>''registry_version'')::integer,''{}''');
  execute definition;
 elsif position('o->>''registry_key'',(o->>''registry_version'')::integer' in definition)=0 then raise exception 'WEIGHT_AUTHORING_PATCH_MISMATCH';end if;
 definition:=pg_get_functiondef('public.axvital_experiment_capture_input(uuid,timestamptz)'::regprocedure);
 if position('''body_weight''' in definition)=0 then
  if position('primary_key not in(''energy_score''' in definition)=0
    or position('''measurementRegistry'',1' in definition)=0
    or position('end sleep_quality from public.daily_checkins' in definition)=0
   then raise exception 'WEIGHT_CAPTURE_PATCH_MISMATCH';end if;
  definition:=replace(definition,'primary_key not in(''energy_score''','primary_key not in(''body_weight'',''energy_score''');
  definition:=replace(definition,'primary_key in(''energy_score''','primary_key in(''body_weight'',''energy_score''');
  definition:=replace(definition,'''measurementRegistry'',1','''measurementRegistry'',case when primary_key=''body_weight'' then 2 else 1 end');
  definition:=replace(definition,'end sleep_quality from public.daily_checkins',
   'end sleep_quality,case when primary_key=''body_weight'' then weight end weight,case when primary_key=''body_weight'' then weight_source_value end weight_source_value,case when primary_key=''body_weight'' then weight_source_unit end weight_source_unit,case when primary_key=''body_weight'' then weight_provenance_version end weight_provenance_version,case when primary_key=''body_weight'' then weight_kg end weight_kg from public.daily_checkins');
  execute definition;
 end if;
end $patch$;
commit;
