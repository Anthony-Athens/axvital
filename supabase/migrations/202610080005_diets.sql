begin;
create table public.diet_definitions (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 draft jsonb not null, archived boolean not null default false, revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id)
);
create table public.diet_enrollments (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 diet_id uuid not null references public.diet_definitions(id) on delete cascade,
 start_date date not null, end_date date, timezone text not null, stopped boolean not null default false, cancelled boolean not null default false,
 revision integer not null default 1, created_at timestamptz not null default now(),
 foreign key(diet_id,user_id) references public.diet_definitions(id,user_id) on delete cascade,
 unique(id,user_id),check(end_date is null or end_date>=start_date)
);
create table public.diet_rule_versions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 enrollment_id uuid not null references public.diet_enrollments(id) on delete cascade,
 effective_from date not null, plan jsonb not null, revision integer not null,
 created_at timestamptz not null default now(), foreign key(enrollment_id,user_id) references public.diet_enrollments(id,user_id) on delete cascade,
 unique(enrollment_id,revision)
);
create index diet_version_effective on public.diet_rule_versions(enrollment_id,effective_from,revision);
do $$ declare t text;begin
 foreach t in array array['diet_definitions','diet_enrollments','diet_rule_versions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy diet_owner on public.%I for select to authenticated using(user_id=auth.uid())',t);
 end loop;
end $$;
-- Extend, rather than duplicate, the existing evidence and completeness stores.
alter table public.nutrition_log_days add column diet_intake_fingerprint text, add column diet_no_intake boolean not null default false;
alter table public.user_foods add column reviewed_canonical_food_id uuid references public.foods(id) on delete set null,
 add column review_provenance text check(length(review_provenance)<=500);
alter table public.health_event_foods add column review_history jsonb not null default '[]';
alter table public.health_event_food_components add column review_history jsonb not null default '[]';
alter table public.food_classification_assertions drop constraint food_classification_assertions_classification_key_check;
alter table public.food_classification_assertions add constraint food_classification_assertions_classification_key_check check(classification_key in ('dairy','gluten','meat','fish','egg','animal_derived','plant_derived','grain','legume','added_sugar','alcohol'));
alter table public.user_food_classification_assertions drop constraint user_food_classification_assertions_classification_key_check;
alter table public.user_food_classification_assertions add constraint user_food_classification_assertions_classification_key_check check(classification_key in ('dairy','gluten','meat','fish','egg','animal_derived','plant_derived','grain','legume','added_sugar','alcohol'));
alter table public.user_food_classification_assertions add column component_id uuid references public.health_event_food_components(id) on delete cascade,
 add column event_food_id uuid references public.health_event_foods(id) on delete cascade,
 add column health_event_id uuid references public.health_events(id) on delete cascade;
do $$ declare n text;begin
 select conname into n from pg_constraint where conrelid='public.user_food_classification_assertions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%num_nonnulls%';
 if n is null then raise exception 'EVIDENCE_PATCH_MISMATCH';end if;
 execute format('alter table public.user_food_classification_assertions drop constraint %I',n);
end $$;
alter table public.user_food_classification_assertions add constraint one_private_evidence_subject check(num_nonnulls(food_id,user_food_id,nutrition_entry_item_id,component_id,event_food_id,health_event_id)=1);
create unique index private_component_assertion_idx on public.user_food_classification_assertions(user_id,component_id,classification_key) where component_id is not null;
create unique index private_anchor_assertion_idx on public.user_food_classification_assertions(user_id,event_food_id,classification_key) where event_food_id is not null;
create unique index private_event_assertion_idx on public.user_food_classification_assertions(user_id,health_event_id,classification_key) where health_event_id is not null;
create policy diet_evidence_subject_owner on public.user_food_classification_assertions as restrictive for all to authenticated
 using((component_id is null or exists(select 1 from public.health_event_food_components c where c.id=component_id and c.user_id=auth.uid())) and (event_food_id is null or exists(select 1 from public.health_event_foods f where f.id=event_food_id and f.user_id=auth.uid())) and (health_event_id is null or exists(select 1 from public.health_events h where h.id=health_event_id and h.user_id=auth.uid())))
 with check((component_id is null or exists(select 1 from public.health_event_food_components c where c.id=component_id and c.user_id=auth.uid())) and (event_food_id is null or exists(select 1 from public.health_event_foods f where f.id=event_food_id and f.user_id=auth.uid())) and (health_event_id is null or exists(select 1 from public.health_events h where h.id=health_event_id and h.user_id=auth.uid())));

create function public.axvital_validate_diet_plan(p jsonb,activate boolean) returns void language plpgsql security definer set search_path='' as $$
declare rule jsonb; ref uuid; cats uuid[];
begin
 if p is null or not public.axvital_json_keys(p,array['name','instructions','mode','rules','weekly_exceptions','dated_exceptions']) or jsonb_typeof(p->'name')<>'string' or length(p->>'name')>120 or jsonb_typeof(p->'instructions')<>'string' or length(p->>'instructions')>2000 or coalesce(p->>'mode','') not in ('illustrative','exhaustive') or jsonb_typeof(p->'rules')<>'array' or jsonb_array_length(p->'rules')>100 or jsonb_typeof(p->'weekly_exceptions')<>'array' or jsonb_array_length(p->'weekly_exceptions')>7 or jsonb_typeof(p->'dated_exceptions')<>'array' or jsonb_array_length(p->'dated_exceptions')>100 then raise exception 'INVALID_PLAN'; end if;
 for rule in select * from jsonb_array_elements(p->'weekly_exceptions') loop
  if rule not in ('0','1','2','3','4','5','6') then raise exception 'INVALID_SCHEDULE';end if;
 end loop;
 if (select count(*)<>count(distinct x) from jsonb_array_elements(p->'weekly_exceptions') x) then raise exception 'INVALID_SCHEDULE';end if;
 for rule in select * from jsonb_array_elements(p->'dated_exceptions') loop
  if jsonb_typeof(rule)<>'string' or (rule#>>'{}') !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' then raise exception 'INVALID_DATE';end if;
  perform (rule#>>'{}')::date;
 end loop;
 if (select count(*)<>count(distinct x) from jsonb_array_elements(p->'dated_exceptions') x) then raise exception 'INVALID_SCHEDULE';end if;
 for rule in select * from jsonb_array_elements(p->'rules') loop
  if not public.axvital_json_keys(rule,array['kind','ref','action']) or coalesce(rule->>'kind','') not in ('food','category','ingredient') or coalesce(rule->>'action','') not in ('allow','exclude') or jsonb_typeof(rule->'ref')<>'string' then raise exception 'INVALID_RULE';end if;
  if rule->>'ref'='' and not activate then continue;end if;
  if rule->>'kind'='ingredient' then
   if rule->>'action'<>'exclude' or rule->>'ref' not in ('dairy','gluten','meat','fish','egg','animal_derived','plant_derived','grain','legume','added_sugar','alcohol') then raise exception 'INVALID_RULE';end if;
  else
   ref:=(rule->>'ref')::uuid;
   if rule->>'kind'='food' and not exists(select 1 from public.foods f where f.id=ref and f.is_active) then raise exception 'FOOD_NOT_FOUND';end if;
   if rule->>'kind'='category' and not exists(select 1 from public.food_categories c where c.id=ref and c.is_active) then raise exception 'CATEGORY_NOT_FOUND';end if;
  end if;
 end loop;
 if activate then
  if length(trim(p->>'name'))<1 or jsonb_array_length(p->'rules')=0 then raise exception 'INCOMPLETE_DIET';end if;
  if exists(select 1 from jsonb_array_elements(p->'rules') r group by r->>'kind',r->>'ref' having count(*)>1) then raise exception 'CONTRADICTORY_RULES';end if;
  if p->>'mode'='exhaustive' and not exists(select 1 from jsonb_array_elements(p->'rules') r where r->>'action'='allow') then raise exception 'ALLOW_LIST_REQUIRED';end if;
  if exists(select 1 from public.food_category_map m join jsonb_array_elements(p->'rules') r on r->>'kind'='category' and (case when r->>'kind'='category' then r->>'ref' end)::uuid=m.category_id where not exists(select 1 from jsonb_array_elements(p->'rules') f where f->>'kind'='food' and (case when f->>'kind'='food' then f->>'ref' end)::uuid=m.food_id) group by m.food_id having count(distinct r->>'action')>1) then raise exception 'CATEGORY_CONFLICT';end if;
 end if;
end $$;
revoke all on function public.axvital_validate_diet_plan(jsonb,boolean) from public,anon,authenticated;

-- Single-statement source snapshot. Derived assessment identity is enrollment/date; no duplicate cache rows.
create function public.read_diet_day_v1(enrollment_id uuid,local_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.diet_enrollments; v public.diet_rule_versions; intake jsonb; cat jsonb; cov jsonb; ids uuid[]; prior uuid[]; depth integer;
begin
 select * into e from public.diet_enrollments x where x.id=enrollment_id and x.user_id=auth.uid();
 if not found then raise exception 'NOT_FOUND';end if;
 if e.cancelled or local_date is null or local_date<e.start_date or (e.end_date is not null and local_date>e.end_date) or local_date>(now() at time zone e.timezone)::date then raise exception 'INVALID_DATE';end if;
 select * into v from public.diet_rule_versions x where x.enrollment_id=e.id and x.effective_from<=local_date order by x.effective_from desc,x.revision desc limit 1;
 if not found then raise exception 'VERSION_NOT_FOUND';end if;
 select jsonb_build_object(
  'entries',coalesce((select jsonb_agg(to_jsonb(n) order by n.id) from public.nutrition_entries n where n.user_id=e.user_id and n.deleted_at is null and (n.consumed_at at time zone e.timezone)::date=local_date),'[]'),
  'events',coalesce((select jsonb_agg(to_jsonb(h) order by h.id) from public.health_events h where h.user_id=e.user_id and h.event_date=local_date and h.event_type in ('food','fluid')),'[]')
 ) into intake;
 intake:=intake||jsonb_build_object(
  'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.nutrition_entry_items i where i.nutrition_entry_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'entries') x)),'[]'),
  'anchors',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.health_event_foods a where a.user_id=e.user_id and (a.nutrition_entry_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'entries') x) or a.health_event_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'events') x))),'[]')
 );
 intake:=intake||jsonb_build_object('components',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.health_event_food_components c where c.user_id=e.user_id and c.event_food_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'anchors') x)),'[]'),
  'userFoods',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'reviewed_canonical_food_id',u.reviewed_canonical_food_id,'review_provenance',u.review_provenance) order by u.id) from public.user_foods u where u.user_id=e.user_id and u.id in (select (x->>'user_food_id')::uuid from jsonb_array_elements(intake->'items') x)),'[]'));
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
  'private',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.user_food_classification_assertions a where a.user_id=e.user_id and (a.food_id=any(ids) or a.user_food_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'userFoods') x) or a.nutrition_entry_item_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'items') x) or a.component_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'components') x) or a.event_food_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'anchors') x) or a.health_event_id in (select (x->>'id')::uuid from jsonb_array_elements(intake->'events') x))),'[]'));
 if octet_length(intake::text)>2000000 then raise exception 'INTAKE_TOO_LARGE';end if;
 select to_jsonb(d) into cov from public.nutrition_log_days d where d.user_id=e.user_id and d.local_date=read_diet_day_v1.local_date and d.time_zone=e.timezone;
 return intake||jsonb_build_object('date',local_date,'enrollment',to_jsonb(e),'version',to_jsonb(v),'fingerprint',md5(intake::text),'coverage',cov);
end $$;
revoke all on function public.read_diet_day_v1(uuid,date) from public,anon,authenticated;
grant execute on function public.read_diet_day_v1(uuid,date) to authenticated;

create function public.save_diet_v1(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); d public.diet_definitions; e public.diet_enrollments; sid uuid; ref uuid; day date; plan jsonb; bundle jsonb; subject text; prior jsonb; evidence_id uuid;
begin
 if uid is null then raise exception 'AUTH_REQUIRED';end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>30000 then raise exception 'INVALID_INPUT';end if;
 -- Shared nutrition owner lock serializes confirmations with standard ingestion.
 perform pg_advisory_xact_lock(hashtextextended(uid::text,1302));
 if action='definition' then
  if not public.axvital_json_keys(payload,array['id','revision','draft','archived']) then raise exception 'INVALID_INPUT';end if;
  sid:=(payload->>'id')::uuid;if sid is null then raise exception 'INVALID_ID';end if;
  perform pg_advisory_xact_lock(hashtextextended(sid::text,2));
  perform public.axvital_validate_diet_plan(payload->'draft',false);
  select * into d from public.diet_definitions where id=sid for update;
  if found then
   if d.user_id<>uid then raise exception 'NOT_FOUND';end if;
   if d.revision is distinct from (payload->>'revision')::integer then raise exception 'REVISION_CONFLICT';end if;
  elsif payload->'revision'<>'0'::jsonb then raise exception 'REVISION_CONFLICT';end if;
  insert into public.diet_definitions(id,user_id,draft,archived) values(sid,uid,payload->'draft',(payload->>'archived')::boolean)
  on conflict(id) do update set draft=excluded.draft,archived=excluded.archived,revision=public.diet_definitions.revision+1,updated_at=now() returning * into d;
  return to_jsonb(d);
 elsif action='enroll' then
  if not public.axvital_json_keys(payload,array['id','diet_id','definition_revision','start_date','end_date','timezone']) then raise exception 'INVALID_INPUT';end if;
  sid:=(payload->>'id')::uuid;ref:=(payload->>'diet_id')::uuid;
  select * into d from public.diet_definitions where id=ref and user_id=uid and not archived for update;
  if not found then raise exception 'NOT_FOUND';end if;
  if d.revision is distinct from (payload->>'definition_revision')::integer then raise exception 'REVISION_CONFLICT';end if;
  perform public.axvital_validate_diet_plan(d.draft,true);
  if not exists(select 1 from pg_timezone_names where name=payload->>'timezone') or (payload->>'start_date') !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' or ((payload->>'end_date') is not null and (payload->>'end_date') !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$') then raise exception 'INVALID_SCHEDULE';end if;
  insert into public.diet_enrollments(id,user_id,diet_id,start_date,end_date,timezone) values(sid,uid,d.id,(payload->>'start_date')::date,(payload->>'end_date')::date,payload->>'timezone') returning * into e;
  insert into public.diet_rule_versions(user_id,enrollment_id,effective_from,plan,revision) values(uid,e.id,e.start_date,d.draft,1);
  return to_jsonb(e);
 elsif action in ('version','stop','confirm') then
  sid:=(payload->>'enrollment_id')::uuid;
  select * into e from public.diet_enrollments where id=sid and user_id=uid for update;
  if not found then raise exception 'NOT_FOUND';end if;
  if action='confirm' then
   if not public.axvital_json_keys(payload,array['enrollment_id','date','fingerprint','no_intake']) or jsonb_typeof(payload->'no_intake')<>'boolean' then raise exception 'INVALID_INPUT';end if;
   bundle:=public.read_diet_day_v1(e.id,(payload->>'date')::date);
   if bundle->>'fingerprint' is distinct from payload->>'fingerprint' then raise exception 'INTAKE_CHANGED';end if;
   if jsonb_array_length(bundle->'entries')+jsonb_array_length(bundle->'events')=0 and payload->'no_intake'<>'true'::jsonb then raise exception 'CONFIRM_NO_INTAKE';end if;
   if jsonb_array_length(bundle->'entries')+jsonb_array_length(bundle->'events')>0 and payload->'no_intake'='true'::jsonb then raise exception 'INTAKE_EXISTS';end if;
   insert into public.nutrition_log_days(user_id,local_date,time_zone,coverage_status,diet_intake_fingerprint,diet_no_intake)
   values(uid,(payload->>'date')::date,e.timezone,'complete',bundle->>'fingerprint',(payload->>'no_intake')::boolean)
   on conflict(user_id,local_date,time_zone) do update set coverage_status='complete',diet_intake_fingerprint=excluded.diet_intake_fingerprint,diet_no_intake=excluded.diet_no_intake;
   return jsonb_build_object('confirmed',true);
  end if;
  if e.revision is distinct from (payload->>'revision')::integer then raise exception 'REVISION_CONFLICT';end if;
  if action='stop' then
   if not public.axvital_json_keys(payload,array['enrollment_id','revision','end_date','historical_ack']) then raise exception 'INVALID_INPUT';end if;
   day:=(payload->>'end_date')::date;
   if e.stopped or day is null or day<e.start_date or (day>(now() at time zone e.timezone)::date and not (e.start_date>(now() at time zone e.timezone)::date and day=e.start_date)) or (day<(now() at time zone e.timezone)::date and payload->'historical_ack' is distinct from 'true'::jsonb) then raise exception 'INVALID_DATE';end if;
   update public.diet_enrollments set end_date=day,stopped=true,cancelled=e.start_date>(now() at time zone e.timezone)::date,revision=revision+1 where id=e.id returning * into e;return to_jsonb(e);
  end if;
  if not public.axvital_json_keys(payload,array['enrollment_id','revision','effective_from','plan','historical_ack']) then raise exception 'INVALID_INPUT';end if;
  day:=(payload->>'effective_from')::date;plan:=payload->'plan';
  if e.cancelled or day is null or day<e.start_date or (e.end_date is not null and day>e.end_date) or (day<(now() at time zone e.timezone)::date and payload->'historical_ack' is distinct from 'true'::jsonb) then raise exception 'HISTORICAL_SCOPE_REQUIRED';end if;
  perform public.axvital_validate_diet_plan(plan,true);
  update public.diet_enrollments set revision=revision+1 where id=e.id returning * into e;
  insert into public.diet_rule_versions(user_id,enrollment_id,effective_from,plan,revision) values(uid,e.id,day,plan,e.revision);
  return to_jsonb(e);
 elsif action='classification' then
  if not public.axvital_json_keys(payload,array['subject','id','key','state','provenance','historical_ack']) or payload->'historical_ack' is distinct from 'true'::jsonb or length(trim(coalesce(payload->>'provenance',''))) not between 1 and 500 or coalesce(payload->>'key','') not in ('dairy','gluten','meat','fish','egg','animal_derived','plant_derived','grain','legume','added_sugar','alcohol') or coalesce(payload->>'state','') not in ('present','absent','unknown') then raise exception 'INVALID_EVIDENCE';end if;
  subject:=payload->>'subject';sid:=(payload->>'id')::uuid;
  if subject='food_id' then
   if not exists(select 1 from public.foods where id=sid and is_active) then raise exception 'NOT_FOUND';end if;
  elsif subject='user_food_id' then
   if not exists(select 1 from public.user_foods where id=sid and user_id=uid) then raise exception 'NOT_FOUND';end if;
  elsif subject='component_id' then
   if not exists(select 1 from public.health_event_food_components where id=sid and user_id=uid) then raise exception 'NOT_FOUND';end if;
  elsif subject='event_food_id' then
   if not exists(select 1 from public.health_event_foods where id=sid and user_id=uid) then raise exception 'NOT_FOUND';end if;
  elsif subject='health_event_id' then
   if not exists(select 1 from public.health_events where id=sid and user_id=uid and event_type in ('food','fluid')) then raise exception 'NOT_FOUND';end if;
  elsif subject='nutrition_entry_item_id' then
   if not exists(select 1 from public.nutrition_entry_items i join public.nutrition_entries n on n.id=i.nutrition_entry_id where i.id=sid and n.user_id=uid) then raise exception 'NOT_FOUND';end if;
  else raise exception 'INVALID_SUBJECT';end if;
  execute format('select id from public.user_food_classification_assertions where user_id=$1 and %I=$2 and classification_key=$3',subject) into evidence_id using uid,sid,payload->>'key';
  if evidence_id is not null then update public.user_food_classification_assertions set state=payload->>'state',provenance=payload->>'provenance',updated_at=now() where id=evidence_id;
  else execute format('insert into public.user_food_classification_assertions(user_id,%I,classification_key,state,provenance,definition_version) values($1,$2,$3,$4,$5,1)',subject) using uid,sid,payload->>'key',payload->>'state',payload->>'provenance';end if;
  return jsonb_build_object('reviewed',true);
 elsif action='identity' then
  if not public.axvital_json_keys(payload,array['subject','id','food_id','provenance','historical_ack']) or payload->'historical_ack' is distinct from 'true'::jsonb or length(trim(coalesce(payload->>'provenance',''))) not between 1 and 500 then raise exception 'INVALID_REVIEW';end if;
  sid:=(payload->>'id')::uuid;ref:=(payload->>'food_id')::uuid;subject:=payload->>'subject';
  if not exists(select 1 from public.foods where id=ref and is_active) then raise exception 'FOOD_NOT_FOUND';end if;
  if subject='component_id' then
   select to_jsonb(c) into prior from public.health_event_food_components c where c.id=sid and c.user_id=uid;
   if prior is null then raise exception 'NOT_FOUND';end if;
   update public.health_event_food_components set food_id=ref,source='user_confirmed',confirmed=true,review_history=review_history||jsonb_build_array(jsonb_build_object('prior',prior-'review_history','at',now(),'provenance',payload->>'provenance')) where id=sid;
  elsif subject='event_food_id' then
   select to_jsonb(f) into prior from public.health_event_foods f where f.id=sid and f.user_id=uid;
   if prior is null then raise exception 'NOT_FOUND';end if;
   update public.health_event_foods set food_id=ref,method='exact',confirmed=true,review_history=review_history||jsonb_build_array(jsonb_build_object('prior',prior-'review_history','at',now(),'provenance',payload->>'provenance')) where id=sid;
  elsif subject='health_event_id' then
   if not exists(select 1 from public.health_events where id=sid and user_id=uid and event_type in ('food','fluid')) then raise exception 'NOT_FOUND';end if;
   insert into public.health_event_foods(user_id,health_event_id,food_id,label,method,confirmed,review_history) select uid,sid,ref,f.name,'exact',true,jsonb_build_array(jsonb_build_object('at',now(),'provenance',payload->>'provenance')) from public.foods f where f.id=ref;
  elsif subject='user_food_id' then
   update public.user_foods set reviewed_canonical_food_id=ref,review_provenance=payload->>'provenance' where id=sid and user_id=uid;
   if not found then raise exception 'NOT_FOUND';end if;
  else raise exception 'INVALID_SUBJECT';end if;
  return jsonb_build_object('reviewed',true);
 end if;
 raise exception 'INVALID_ACTION';
end $$;
revoke all on function public.save_diet_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.save_diet_v1(text,jsonb) to authenticated;

-- Existing entry/item triggers handle both sides of moved timestamps. Add missing beverage,
-- component and private-classification invalidation; do not change macros or ingestion RPCs.
create function public.axvital_diet_coverage_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; u uuid; a public.health_event_foods; at_time timestamptz; day date;
begin
 for r in select x from unnest(array[case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end]) x where x is not null loop
  u:=(r->>'user_id')::uuid;at_time:=null;day:=null;
  if tg_table_name='health_events' then if r->>'event_type' not in ('food','fluid') then continue;end if;day:=(r->>'event_date')::date;
  elsif tg_table_name in ('user_food_classification_assertions','user_foods') then
   if tg_table_name='user_foods' then
    if tg_op='INSERT' then continue;end if;
    if tg_op='UPDATE' then if new.reviewed_canonical_food_id is not distinct from old.reviewed_canonical_food_id and new.review_provenance is not distinct from old.review_provenance and new.name is not distinct from old.name then continue;end if;end if;
   end if;
   update public.nutrition_log_days set coverage_status='unknown',diet_no_intake=false where user_id=u and coverage_status<>'unknown';continue;
  else
   if tg_table_name='health_event_food_components' then select * into a from public.health_event_foods where id=(r->>'event_food_id')::uuid;else a:=jsonb_populate_record(null::public.health_event_foods,r);end if;
   if a.nutrition_entry_id is not null then select consumed_at into at_time from public.nutrition_entries where id=a.nutrition_entry_id;else select event_date into day from public.health_events where id=a.health_event_id;end if;
  end if;
  update public.nutrition_log_days set coverage_status='unknown',diet_no_intake=false where user_id=u and (local_date=day or local_date=(at_time at time zone time_zone)::date) and coverage_status<>'unknown';
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.axvital_diet_coverage_changed() from public,anon,authenticated;
do $$ declare t text;begin
 foreach t in array array['health_events','health_event_foods','health_event_food_components','user_food_classification_assertions','user_foods'] loop
 execute format('create trigger a_diet_owner_lock before insert or update or delete on public.%I for each row execute function public.axvital_domain_owner_lock()',t);
 execute format('create trigger diet_coverage_changed before insert or update or delete on public.%I for each row execute function public.axvital_diet_coverage_changed()',t);
 end loop;
end $$;

-- Extend the reviewed account contract/export without replacing prior sprint additions.
do $patch$ declare definition text;t text;begin
 definition:=pg_get_functiondef('public.axvital_account_schema_issues(boolean)'::regprocedure);
 if position('(''workout_sessions'',''user_id'',''auth.users'',''c'',false,false)' in definition)=0 then raise exception 'ACCOUNT_PATCH_MISMATCH';end if;
 foreach t in array array['diet_definitions','diet_enrollments','diet_rule_versions'] loop
 definition:=replace(definition,'(''workout_sessions'',''user_id'',''auth.users'',''c'',false,false)',format('(%L,''user_id'',''auth.users'',''c'',false,false),(%L,''user_id'',''auth.users'',''c'',false,false)',t,'workout_sessions'));
 end loop;execute definition;
 definition:=pg_get_functiondef('public.axvital_export_account()'::regprocedure);
 if position('(''workout_sessions'',''r.user_id=auth.uid()'')' in definition)=0 then raise exception 'EXPORT_PATCH_MISMATCH';end if;
 foreach t in array array['diet_definitions','diet_enrollments','diet_rule_versions'] loop
 definition:=replace(definition,'(''workout_sessions'',''r.user_id=auth.uid()'')',format('(%L,''r.user_id=auth.uid()''),(%L,''r.user_id=auth.uid()'')',t,'workout_sessions'));
 end loop;execute definition;
end $patch$;
create function public.read_diet_window_v1(enrollment_id uuid,start_date date,end_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.diet_enrollments; d date; result jsonb:='[]';last date;
begin
 select * into e from public.diet_enrollments where id=enrollment_id and user_id=auth.uid();
 if not found then raise exception 'NOT_FOUND';end if;
 if start_date is null or end_date is null or end_date<start_date or end_date-start_date>30 then raise exception 'INVALID_WINDOW';end if;
 if e.cancelled then return '[]'::jsonb;end if;
 last:=least(end_date,coalesce(e.end_date,end_date),(now() at time zone e.timezone)::date);
 d:=greatest(start_date,e.start_date);
 while d<=last loop result:=result||jsonb_build_array(public.read_diet_day_v1(e.id,d));d:=d+1;end loop;
 return result;
end $$;
revoke all on function public.read_diet_window_v1(uuid,date,date) from public,anon,authenticated;
grant execute on function public.read_diet_window_v1(uuid,date,date) to authenticated;
commit;


