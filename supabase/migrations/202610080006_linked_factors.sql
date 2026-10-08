begin;
-- Same canonical source snapshot/fingerprint as Sprint 2, now independent of enrollment.
create function public.read_intake_day_v1(local_date date,time_zone text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); intake jsonb;cat jsonb;cov jsonb;ids uuid[];prior uuid[];depth integer;
begin
 if uid is null then raise exception 'AUTH_REQUIRED';end if;
 if not exists(select 1 from pg_timezone_names where name=time_zone) or local_date is null or local_date>(now() at time zone time_zone)::date then raise exception 'INVALID_DATE';end if;
 select jsonb_build_object(
  'entries',coalesce((select jsonb_agg(to_jsonb(n) order by n.id) from public.nutrition_entries n where n.user_id=uid and n.deleted_at is null and (n.consumed_at at time zone time_zone)::date=local_date),'[]'),
  'events',coalesce((select jsonb_agg(to_jsonb(h) order by h.id) from public.health_events h where h.user_id=uid and h.event_date=local_date and h.event_type in ('food','fluid')),'[]')
 ) into intake;
 intake:=intake||jsonb_build_object(
  'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.nutrition_entry_items i where i.nutrition_entry_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'entries') x)),'[]'),
  'anchors',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.health_event_foods a where a.user_id=uid and (a.nutrition_entry_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'entries') x) or a.health_event_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'events') x))),'[]')
 );
 intake:=intake||jsonb_build_object('components',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.health_event_food_components c where c.user_id=uid and c.event_food_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'anchors') x)),'[]'),
  'userFoods',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'reviewed_canonical_food_id',u.reviewed_canonical_food_id,'review_provenance',u.review_provenance) order by u.id) from public.user_foods u where u.user_id=uid and u.id in (select (x->>'user_food_id')::uuid from jsonb_array_elements(intake->'items') x)),'[]'));
 select array_agg(distinct id) into ids from (
  select (x->>'food_id')::uuid id from jsonb_array_elements((intake->'items')||(intake->'anchors')||(intake->'components')) x
  union select (x->>'reviewed_canonical_food_id')::uuid from jsonb_array_elements(intake->'userFoods') x
 ) q where id is not null;
 ids:=coalesce(ids,'{}');
 for depth in 1..6 loop
  prior:=ids;select array_agg(distinct x) into ids from unnest(ids||coalesce((select array_agg(component_food_id) from public.food_components where parent_food_id=any(ids)),'{}')) x;
  ids:=coalesce(ids,'{}');if ids=prior then exit;end if;
 end loop;
 select jsonb_build_object(
  'foods',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from public.foods f where f.id=any(ids)),'[]'),
  'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.food_categories c),'[]'),
  'maps',coalesce((select jsonb_agg(to_jsonb(m) order by m.food_id,m.category_id) from public.food_category_map m where m.food_id=any(ids)),'[]'),
  'library',coalesce((select jsonb_agg(to_jsonb(c) order by c.parent_food_id,c.component_food_id) from public.food_components c where c.parent_food_id=any(ids)),'[]')
 ) into cat;
 intake:=intake||jsonb_build_object('catalog',cat,
  'shared',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.food_classification_assertions a where a.food_id=any(ids)),'[]'),
  'private',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.user_food_classification_assertions a where a.user_id=uid and (a.food_id=any(ids) or a.user_food_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'userFoods') x) or a.nutrition_entry_item_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'items') x) or a.component_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'components') x) or a.event_food_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'anchors') x) or a.health_event_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'events') x))),'[]'));
 if octet_length(intake::text)>2000000 then raise exception 'INTAKE_TOO_LARGE';end if;
 select to_jsonb(d) into cov from public.nutrition_log_days d where d.user_id=uid and d.local_date=read_intake_day_v1.local_date and d.time_zone=read_intake_day_v1.time_zone;
 return intake||jsonb_build_object('date',local_date,'fingerprint',md5(intake::text),'coverage',cov);
end $$;
-- Explicit products/formulations reviewed by their owner; existing event logs remain the source.
create table public.supplement_products(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 2 and 120),formulation text not null check(length(trim(formulation)) between 1 and 200),
 created_at timestamptz not null default now(),unique(id,user_id),unique(user_id,name,formulation)
);
alter table public.health_events add column supplement_product_id uuid references public.supplement_products(id) on delete set null,
 add constraint supplement_product_owner foreign key(supplement_product_id,user_id) references public.supplement_products(id,user_id);
create table public.supplement_log_days(
 user_id uuid not null references auth.users(id) on delete cascade,local_date date not null,time_zone text not null,
 fingerprint text not null,complete boolean not null default true,confirmed_at timestamptz not null default now(),
 primary key(user_id,local_date,time_zone)
);
create table public.observational_factor_versions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 study_id uuid not null references public.observational_studies(id) on delete cascade,effective_from date not null,
 factors jsonb not null,revision integer not null,created_at timestamptz not null default now(),unique(study_id,revision)
);
alter table public.observational_studies add constraint observational_study_owner_unique unique(id,user_id);
alter table public.observational_factor_versions add constraint factor_version_owner foreign key(study_id,user_id) references public.observational_studies(id,user_id) on delete cascade;
do $$ declare t text;begin
 foreach t in array array['supplement_products','supplement_log_days','observational_factor_versions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy owner_read on public.%I for select to authenticated using(user_id=auth.uid())',t);
 end loop;
end $$;
create function public.read_supplement_day_v1(local_date date,time_zone text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid();rows jsonb;cov jsonb;
begin
 if uid is null then raise exception 'AUTH_REQUIRED';end if;
 if local_date is null or not exists(select 1 from pg_timezone_names where name=time_zone) or local_date>(now() at time zone time_zone)::date then raise exception 'INVALID_DATE';end if;
 select coalesce(jsonb_agg(to_jsonb(h) order by h.id),'[]') into rows from public.health_events h where h.user_id=uid and h.event_date=local_date and h.event_type='supplement';
 if octet_length(rows::text)>2000000 then raise exception 'INTAKE_TOO_LARGE';end if;
 select to_jsonb(d) into cov from public.supplement_log_days d where d.user_id=uid and d.local_date=read_supplement_day_v1.local_date and d.time_zone=read_supplement_day_v1.time_zone;
 return jsonb_build_object('date',local_date,'timezone',time_zone,'events',rows,'fingerprint',md5(rows::text),'coverage',cov);
end $$;
revoke all on function public.read_supplement_day_v1(date,text) from public,anon,authenticated;
grant execute on function public.read_supplement_day_v1(date,text) to authenticated;
create function public.axvital_supplement_invalidate() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 if tg_op<>'DELETE' and new.supplement_product_id is not null and coalesce(to_jsonb(new)->>'event_type','')<>'supplement' then
  if tg_op='UPDATE' and to_jsonb(old)->>'event_type'='supplement' then new.supplement_product_id:=null;else raise exception 'INVALID_SUPPLEMENT_DOMAIN';end if;
 end if;
 for r in select x from unnest(array[case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end]) x where x is not null loop
  if r->>'event_type'='supplement' then update public.supplement_log_days set complete=false where user_id=(r->>'user_id')::uuid and local_date=(r->>'event_date')::date;end if;
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.axvital_supplement_invalidate() from public,anon,authenticated;
create trigger supplement_log_changed before insert or update or delete on public.health_events for each row execute function public.axvital_supplement_invalidate();
create function public.save_supplement_review_v1(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();p public.supplement_products;b jsonb;
begin
 if uid is null then raise exception 'AUTH_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,1302));
 if action='product' then
  if not public.axvital_json_keys(payload,array['name','formulation']) then raise exception 'INVALID_INPUT';end if;
  insert into public.supplement_products(user_id,name,formulation) values(uid,trim(payload->>'name'),trim(payload->>'formulation')) returning * into p;return to_jsonb(p);
 elsif action='identity' then
  if not public.axvital_json_keys(payload,array['event_id','product_id']) or not exists(select 1 from public.supplement_products where id=(payload->>'product_id')::uuid and user_id=uid) then raise exception 'NOT_FOUND';end if;
  update public.health_events set supplement_product_id=(payload->>'product_id')::uuid where id=(payload->>'event_id')::uuid and user_id=uid and event_type='supplement';
  if not found then raise exception 'NOT_FOUND';end if;return jsonb_build_object('reviewed',true);
 elsif action='confirm' then
  if not public.axvital_json_keys(payload,array['date','timezone','fingerprint']) then raise exception 'INVALID_INPUT';end if;
  b:=public.read_supplement_day_v1((payload->>'date')::date,payload->>'timezone');
  if b->>'fingerprint' is distinct from payload->>'fingerprint' then raise exception 'INTAKE_CHANGED';end if;
  insert into public.supplement_log_days(user_id,local_date,time_zone,fingerprint) values(uid,(payload->>'date')::date,payload->>'timezone',b->>'fingerprint')
  on conflict(user_id,local_date,time_zone) do update set fingerprint=excluded.fingerprint,complete=true,confirmed_at=now();return jsonb_build_object('confirmed',true);
 end if;raise exception 'INVALID_ACTION';
end $$;
revoke all on function public.save_supplement_review_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.save_supplement_review_v1(text,jsonb) to authenticated;
revoke all on function public.read_intake_day_v1(date,text) from public,anon,authenticated;
grant execute on function public.read_intake_day_v1(date,text) to authenticated;
create or replace function public.read_diet_day_v1(enrollment_id uuid,local_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.diet_enrollments;v public.diet_rule_versions;
begin
 select * into e from public.diet_enrollments x where x.id=enrollment_id and x.user_id=auth.uid();
 if not found then raise exception 'NOT_FOUND';end if;
 if e.cancelled or local_date is null or local_date<e.start_date or (e.end_date is not null and local_date>e.end_date) then raise exception 'INVALID_DATE';end if;
 select * into v from public.diet_rule_versions x where x.enrollment_id=e.id and x.effective_from<=local_date order by x.effective_from desc,x.revision desc limit 1;
 if not found then raise exception 'VERSION_NOT_FOUND';end if;
 return public.read_intake_day_v1(local_date,e.timezone)||jsonb_build_object('enrollment',to_jsonb(e),'version',to_jsonb(v));
end $$;
create function public.axvital_validate_linked_factors(factors jsonb) returns void language plpgsql security definer set search_path='' as $$
declare factor jsonb;kind text;ref uuid;
begin
 if jsonb_typeof(factors) is distinct from 'array' or jsonb_array_length(factors)>10 then raise exception 'INVALID_FACTORS';end if;
 for factor in select * from jsonb_array_elements(factors) loop
  kind:=factor->>'source';
  if factor->'offset' not in ('0'::jsonb,'-1'::jsonb) or not factor ? 'offset' then raise exception 'INVALID_FACTOR';end if;
  if kind in ('body_weight','energy_score','mood_score','sleep_quality_score','alcohol') then
   if not public.axvital_json_keys(factor,array['source','offset']) then raise exception 'INVALID_FACTOR';end if;
  elsif kind='ingredient' then
   if not public.axvital_json_keys(factor,array['source','offset','ref']) or coalesce(factor->>'ref','') not in ('dairy','gluten','meat','fish','egg','animal_derived','plant_derived','grain','legume','added_sugar','alcohol') then raise exception 'INVALID_FACTOR';end if;
  elsif kind in ('diet','food','category','supplement') then
   if not public.axvital_json_keys(factor,array['source','offset','ref']) then raise exception 'INVALID_FACTOR';end if;ref:=(factor->>'ref')::uuid;
   if kind='diet' and not exists(select 1 from public.diet_enrollments where id=ref and user_id=auth.uid()) then raise exception 'NOT_FOUND';end if;
   if kind='supplement' and not exists(select 1 from public.supplement_products where id=ref and user_id=auth.uid()) then raise exception 'NOT_FOUND';end if;
   if kind='food' and not exists(select 1 from public.foods where id=ref and is_active) then raise exception 'NOT_FOUND';end if;
   if kind='category' and not exists(select 1 from public.food_categories where id=ref and is_active) then raise exception 'NOT_FOUND';end if;
  else raise exception 'INVALID_FACTOR';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(factors) x group by case when x->>'source'='ingredient' and x->>'ref'='alcohol' then 'alcohol:' else (x->>'source')||':'||coalesce(x->>'ref','') end having count(*)>1) then raise exception 'DUPLICATE_FACTOR';end if;
end $$;
revoke all on function public.axvital_validate_linked_factors(jsonb) from public,anon,authenticated;
-- Preserve the original paywall, lifecycle and immutable outcome implementation.
do $patch$ declare definition text;first integer;last integer;begin
 definition:=pg_get_functiondef('public.save_observational_v1(text,jsonb)'::regprocedure);
 first:=position('  if jsonb_typeof(payload->''factors'')' in definition);
 last:=position('  perform pg_advisory_xact_lock(hashtextextended(sid::text,1));' in definition);
 if first=0 or last<=first then raise exception 'FACTOR_PATCH_MISMATCH';end if;
 definition:=substr(definition,1,first-1)||'  perform public.axvital_validate_linked_factors(payload->''factors'');'||chr(10)||substr(definition,last);
 execute definition;
end $patch$;
create function public.save_factor_version_v1(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.observational_studies;day date;v public.observational_factor_versions;
begin
 perform public.axvital_require_full_experiments();
 if not public.axvital_json_keys(payload,array['study_id','revision','effective_from','factors','historical_ack']) then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended((payload->>'study_id')::uuid::text,1));
 select * into s from public.observational_studies where id=(payload->>'study_id')::uuid and user_id=auth.uid() for update;
 if not found or s.status='draft' then raise exception 'NOT_FOUND';end if;
 if s.revision is distinct from (payload->>'revision')::integer then raise exception 'REVISION_CONFLICT';end if;
 day:=(payload->>'effective_from')::date;
 if day is null or day<s.start_date or day>s.end_date or (day<(now() at time zone s.timezone)::date and payload->'historical_ack' is distinct from 'true'::jsonb) then raise exception 'HISTORICAL_SCOPE_REQUIRED';end if;
 perform public.axvital_validate_linked_factors(payload->'factors');
 update public.observational_studies set revision=revision+1,updated_at=now() where id=s.id returning * into s;
 insert into public.observational_factor_versions(user_id,study_id,effective_from,factors,revision) values(auth.uid(),s.id,day,payload->'factors',s.revision) returning * into v;return to_jsonb(s);
end $$;
revoke all on function public.save_factor_version_v1(jsonb) from public,anon,authenticated;
grant execute on function public.save_factor_version_v1(jsonb) to authenticated;
do $patch$ declare definition text;t text;begin
 definition:=pg_get_functiondef('public.axvital_account_schema_issues(boolean)'::regprocedure);
 if position('(''workout_sessions'',''user_id'',''auth.users'',''c'',false,false)' in definition)=0 then raise exception 'ACCOUNT_PATCH_MISMATCH';end if;
 foreach t in array array['supplement_products','supplement_log_days','observational_factor_versions'] loop
 definition:=replace(definition,'(''workout_sessions'',''user_id'',''auth.users'',''c'',false,false)',format('(%L,''user_id'',''auth.users'',''c'',false,false),(%L,''user_id'',''auth.users'',''c'',false,false)',t,'workout_sessions'));
 end loop;execute definition;
 definition:=pg_get_functiondef('public.axvital_export_account()'::regprocedure);
 foreach t in array array['supplement_products','supplement_log_days','observational_factor_versions'] loop
 definition:=replace(definition,'(''workout_sessions'',''r.user_id=auth.uid()'')',format('(%L,''r.user_id=auth.uid()''),(%L,''r.user_id=auth.uid()'')',t,'workout_sessions'));
 end loop;execute definition;
end $patch$;
create function public.confirm_intake_day_v1(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b jsonb;uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'AUTH_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,1302));
 if not public.axvital_json_keys(payload,array['date','timezone','fingerprint','no_intake']) or jsonb_typeof(payload->'no_intake') is distinct from 'boolean' then raise exception 'INVALID_INPUT';end if;
 b:=public.read_intake_day_v1((payload->>'date')::date,payload->>'timezone');
 if b->>'fingerprint' is distinct from payload->>'fingerprint' then raise exception 'INTAKE_CHANGED';end if;
 if jsonb_array_length(b->'entries')+jsonb_array_length(b->'events')=0 and payload->'no_intake'<>'true'::jsonb then raise exception 'CONFIRM_NO_INTAKE';end if;
 if jsonb_array_length(b->'entries')+jsonb_array_length(b->'events')>0 and payload->'no_intake'='true'::jsonb then raise exception 'INTAKE_EXISTS';end if;
 insert into public.nutrition_log_days(user_id,local_date,time_zone,coverage_status,diet_intake_fingerprint,diet_no_intake) values(uid,(payload->>'date')::date,payload->>'timezone','complete',b->>'fingerprint',(payload->>'no_intake')::boolean)
 on conflict(user_id,local_date,time_zone) do update set coverage_status='complete',diet_intake_fingerprint=excluded.diet_intake_fingerprint,diet_no_intake=excluded.diet_no_intake;
 return jsonb_build_object('confirmed',true);
end $$;
revoke all on function public.confirm_intake_day_v1(jsonb) from public,anon,authenticated;
grant execute on function public.confirm_intake_day_v1(jsonb) to authenticated;
commit;
