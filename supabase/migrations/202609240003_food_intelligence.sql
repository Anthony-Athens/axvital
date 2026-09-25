begin;
create table public.food_components (
 parent_food_id uuid not null references public.foods(id) on delete cascade,
 component_food_id uuid not null references public.foods(id) on delete cascade,
 source text not null default 'library' check(source in ('library','explicit','ai_inferred','user_confirmed')),
 confidence numeric check(confidence between 0 and 1),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(parent_food_id,component_food_id), check(parent_food_id<>component_food_id)
);
create index food_components_child_idx on public.food_components(component_food_id);
alter table public.food_components enable row level security;
revoke all on public.food_components from public,anon,authenticated;
grant select on public.food_components to authenticated;
grant all on public.food_components to service_role;
create policy food_components_read on public.food_components for select to authenticated using (
 exists(select 1 from public.foods f where f.id=parent_food_id and f.is_active) and
 exists(select 1 from public.foods f where f.id=component_food_id and f.is_active));
create trigger food_components_updated before update on public.food_components for each row execute function public.axvital_planning_set_updated_at();

alter table public.health_events add constraint health_events_food_owner_identity unique(id,user_id);
create table public.health_event_foods (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 health_event_id uuid not null unique references public.health_events(id) on delete cascade,
 food_id uuid references public.foods(id) on delete set null,
 label text not null check(char_length(btrim(label)) between 1 and 160),
 method text not null check(method in ('exact','alias','normalized','fuzzy','ai','provisional')),
 confirmed boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,user_id),
 foreign key(health_event_id,user_id) references public.health_events(id,user_id) on delete cascade
);
create table public.health_event_food_components (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 event_food_id uuid not null references public.health_event_foods(id) on delete cascade,
 food_id uuid references public.foods(id) on delete set null,
 label text not null check(char_length(btrim(label)) between 1 and 160),
 source text not null check(source in ('library','explicit','ai_inferred','user_confirmed')),
 confidence numeric check(confidence between 0 and 1),
 included boolean not null default true, confirmed boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(event_food_id,user_id) references public.health_event_foods(id,user_id) on delete cascade
);
create unique index event_component_food_unique on public.health_event_food_components(event_food_id,food_id) where food_id is not null;
create unique index event_component_label_unique on public.health_event_food_components(event_food_id,public.axvital_normalize_food_name(label)) where food_id is null;
create index health_event_foods_owner_idx on public.health_event_foods(user_id,created_at);
create index health_event_foods_food_idx on public.health_event_foods(food_id);
create index event_components_owner_idx on public.health_event_food_components(user_id,event_food_id);
create index event_components_food_idx on public.health_event_food_components(food_id);
do $$ declare t text; begin
 foreach t in array array['health_event_foods','health_event_food_components'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy own_food_data on public.%I for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()))',t);
  execute format('create policy visible_canonical_food on public.%I as restrictive for insert to authenticated with check(food_id is null or exists(select 1 from public.foods f where f.id=food_id and f.is_active))',t);
  execute format('create policy visible_canonical_food_update on public.%I as restrictive for update to authenticated using(true) with check(food_id is null or exists(select 1 from public.foods f where f.id=food_id and f.is_active))',t);
  execute format('create trigger food_updated before update on public.%I for each row execute function public.axvital_planning_set_updated_at()',t);
 end loop;
end $$;

-- Restrict relationship creation to the owner's visible parent, including any future restrictive health policy.
create policy visible_event_parent on public.health_event_foods as restrictive for all to authenticated
 using(exists(select 1 from public.health_events h where h.id=health_event_id and h.user_id=auth.uid()))
 with check(exists(select 1 from public.health_events h where h.id=health_event_id and h.user_id=auth.uid()));
create policy visible_food_parent on public.health_event_food_components as restrictive for all to authenticated
 using(exists(select 1 from public.health_event_foods f where f.id=event_food_id and f.user_id=auth.uid()))
 with check(exists(select 1 from public.health_event_foods f where f.id=event_food_id and f.user_id=auth.uid()));

-- One category row per source component; absence/exclusion never becomes a positive exposure.
-- Simple-food categories apply only when there are no component selections.
create view public.health_event_food_category_exposures with(security_invoker=true) as
 select f.user_id,f.health_event_id,f.id event_food_id,c.id component_id,m.category_id,c.source,c.confirmed,c.confidence
 from public.health_event_foods f join public.health_event_food_components c on c.event_food_id=f.id
 join public.food_category_map m on m.food_id=c.food_id where c.included and (c.source<>'ai_inferred' or c.confirmed)
 union all
 select f.user_id,f.health_event_id,f.id,null::uuid,m.category_id,
 case when f.method in ('ai','fuzzy') then 'ai_inferred' else 'library' end,f.confirmed,null::numeric
 from public.health_event_foods f join public.food_category_map m on m.food_id=f.food_id
 where (f.method not in ('ai','fuzzy') or f.confirmed)
 and not exists(select 1 from public.health_event_food_components c where c.event_food_id=f.id);
revoke all on public.health_event_food_category_exposures from public,anon,authenticated;
grant select on public.health_event_food_category_exposures to authenticated;

-- Canonical ingestion extension: all events + relationship rows share one transaction and invoker RLS.
-- Explicitly whitelisted columns preserve defaults even though the original baseline CREATE TABLE is absent.
create function public.ingest_health_events_with_food(rows jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb; payload jsonb; food jsonb; component jsonb; cols text; event_id uuid; parent_id uuid;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if rows is null or jsonb_typeof(rows) is distinct from 'array' then raise exception 'INVALID_EVENT'; end if;
 if jsonb_array_length(rows) not between 1 and 12 or octet_length(rows::text)>65536 then raise exception 'INVALID_EVENT'; end if;
 for item in select value from jsonb_array_elements(rows) loop
  payload:=item->'event'; food:=item->'food';
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'INVALID_EVENT'; end if;
  if (payload->>'user_id')::uuid is distinct from auth.uid()
   or not payload ?& array['user_id','event_date','event_time','event_type']
   or coalesce(payload->>'event_type','') not in ('food','fluid','supplement','exercise','symptom','medication','note')
   or coalesce(payload->>'event_date','') !~ '^\d{4}-\d{2}-\d{2}$'
   or coalesce(payload->>'event_time','') !~ '^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,6})?)?$'
   or exists(select 1 from jsonb_object_keys(payload) key where key not in ('user_id','event_date','event_time','event_type','title','description','amount','dose','duration','intensity','severity','notes','tags','calories','protein_g','carbs_g','fat_g','supplement_name','dose_amount','dose_unit','exercise_type','duration_minutes','distance','distance_unit','input_method'))
   then raise exception 'INVALID_EVENT'; end if;
  select string_agg(format('%I',key),',' order by key) into cols from jsonb_object_keys(payload) key;
  execute format('insert into public.health_events(%s) select %s from jsonb_populate_record(null::public.health_events,$1) returning id',cols,cols) into event_id using payload;
  if food is null or food='null'::jsonb then continue; end if;
  if payload->>'event_type' not in ('food','fluid') or jsonb_typeof(food) is distinct from 'object' or jsonb_typeof(food->'components') is distinct from 'array' then raise exception 'INVALID_FOOD'; end if;
  if jsonb_array_length(food->'components')>16 or food->>'label' is distinct from payload->>'title'
    or ((food->>'food_id' is null) <> (food->>'method'='provisional')) then raise exception 'INVALID_FOOD'; end if;
  insert into public.health_event_foods(user_id,health_event_id,food_id,label,method,confirmed)
   values(auth.uid(),event_id,(food->>'food_id')::uuid,food->>'label',food->>'method',(food->>'confirmed')::boolean) returning id into parent_id;
  for component in select value from jsonb_array_elements(food->'components') loop
   insert into public.health_event_food_components(user_id,event_food_id,food_id,label,source,confidence,included,confirmed)
   values(auth.uid(),parent_id,(component->>'food_id')::uuid,component->>'label',component->>'source',(component->>'confidence')::numeric,(component->>'included')::boolean,(component->>'confirmed')::boolean);
  end loop;
 end loop;
end $$;
revoke all on function public.ingest_health_events_with_food(jsonb) from public,anon,authenticated;
grant execute on function public.ingest_health_events_with_food(jsonb) to authenticated;

-- Extend fail-closed account inventory/export/deletion alongside the new private tables.
do $patch$ declare definition text; begin
 definition:=pg_get_functiondef('public.axvital_account_schema_issues(boolean)'::regprocedure);
 if position('(''health_events'',''user_id'',''auth.users'',''c'',false,false)' in definition)=0 then raise exception 'FOOD_ACCOUNT_PATCH_MISMATCH'; end if;
 definition:=replace(definition,'(''health_events'',''user_id'',''auth.users'',''c'',false,false)',
 '(''health_event_foods'',''user_id'',''auth.users'',''c'',false,false),(''health_event_food_components'',''user_id'',''auth.users'',''c'',false,false),(''health_events'',''user_id'',''auth.users'',''c'',false,false)');
 definition:=replace(definition,'(''target_rules'',''exercise_id'',''exercises'',''r'',false)',
 '(''health_event_foods'',''health_event_id'',''health_events'',''c'',true),(''health_event_food_components'',''event_food_id'',''health_event_foods'',''c'',true),(''target_rules'',''exercise_id'',''exercises'',''r'',false)');
 execute definition;
 definition:=pg_get_functiondef('public.axvital_export_account()'::regprocedure);
 if position('(''health_events'',''r.user_id=auth.uid()'')' in definition)=0 then raise exception 'FOOD_EXPORT_PATCH_MISMATCH';end if;
 definition:=replace(definition,'(''health_events'',''r.user_id=auth.uid()'')','(''health_event_foods'',''r.user_id=auth.uid()''),(''health_event_food_components'',''r.user_id=auth.uid()''),(''health_events'',''r.user_id=auth.uid()'')');
 execute definition;
 -- Existing cleanup checks every FK with a user_id and cascades from health_events.
 definition:=pg_get_functiondef('public.axvital_consume_api_budget(text)'::regprocedure);
 if position('else null end;' in definition)=0 then raise exception 'FOOD_BUDGET_PATCH_MISMATCH';end if;
 definition:=replace(definition,'else null end;','when ''http/nutrition/resolve:POST'' then 6 else null end;');
 execute definition;
end $patch$;
select public.axvital_assert_account_schema(true);
commit;
