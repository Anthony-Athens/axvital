begin;
create table public.observation_metrics (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 version integer not null default 1 check(version=1), name text not null check(length(trim(name)) between 2 and 120),
 description text not null default '' check(length(description)<=500), kind text not null check(kind in ('numeric','rating','boolean')),
 unit text not null check(length(unit)<=40), min integer, max integer,
 anchors jsonb not null default '{}' check(jsonb_typeof(anchors)='object'),
 direction text not null check(direction in ('higher','lower','neither')), instructions text not null default '' check(length(instructions)<=1000),
 unique(id,user_id), check((kind='rating' and min is not null and max is not null and min>=-100 and max<=100 and max>min and max-min<=20) or (kind<>'rating' and min is null and max is null)),
 check(kind<>'numeric' or length(trim(unit))>0)
);
create table public.observational_studies (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(trim(title)) between 2 and 120), question text not null default '' check(length(question)<=500),
 start_date date not null, end_date date not null, timezone text not null, entry_offset integer not null default 0 check(entry_offset in (0,-1)), finished_on date,
 metric_id uuid, outcome_source text check(outcome_source in ('body_weight','energy_score','mood_score','sleep_quality_score')),
 factors jsonb not null default '[]' check(jsonb_typeof(factors)='array'),
 status text not null default 'draft' check(status in ('draft','active','paused','completed','ended_early','abandoned')),
 revision integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(metric_id,user_id) references public.observation_metrics(id,user_id),
 check((metric_id is null)<>(outcome_source is null)), check(end_date>=start_date and end_date-start_date<=366)
);
create table public.metric_observations (
 user_id uuid not null references auth.users(id) on delete cascade, metric_id uuid not null,
 observed_date date not null, status text not null check(status in ('recorded','not_observed')), value double precision,
 observer text not null default '' check(length(observer)<=120), coverage text not null default 'unknown' check(coverage in ('brief','partial','most','unknown')),
 note text not null default '' check(length(note)<=2000), submitted_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(user_id,metric_id,observed_date), foreign key(metric_id,user_id) references public.observation_metrics(id,user_id) on delete cascade,
 check((status='not_observed' and value is null) or (status='recorded' and value is not null and value not in ('NaN'::float8,'Infinity'::float8,'-Infinity'::float8)))
);
do $$ declare t text; begin
 foreach t in array array['observation_metrics','observational_studies','metric_observations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy owner_select on public.%I for select to authenticated using(user_id=auth.uid())',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
-- Only validated RPC writes. Definitions are immutable: create a new metric for a new scale/unit.
create function public.save_observational_v1(action text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); sid uuid; mid uuid; s public.observational_studies; m public.observation_metrics;
 f jsonb; a record; result jsonb; v double precision; d date; today date;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 perform public.axvital_require_full_experiments();
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>20000 then raise exception 'INVALID_INPUT'; end if;
 if action='metric' then
  if not payload ?& array['name','description','kind','unit','min','max','anchors','direction','instructions'] then raise exception 'INVALID_METRIC'; end if;
  if (payload-array['name','description','kind','unit','min','max','anchors','direction','instructions'])<>'{}'::jsonb then raise exception 'INVALID_METRIC'; end if;
  insert into public.observation_metrics(user_id,name,description,kind,unit,min,max,anchors,direction,instructions)
  values(uid,payload->>'name',payload->>'description',payload->>'kind',payload->>'unit',(payload->>'min')::integer,(payload->>'max')::integer,payload->'anchors',payload->>'direction',payload->>'instructions') returning * into m;
  for a in select * from jsonb_each(m.anchors) loop
   if m.kind<>'rating' or a.key !~ '^-?[0-9]+$' or a.key<>((a.key)::integer)::text or (a.key)::integer<m.min or (a.key)::integer>m.max or jsonb_typeof(a.value)<>'string' or length(a.value#>>'{}')>120 then raise exception 'INVALID_ANCHORS'; end if;
  end loop;
  return to_jsonb(m);
 elsif action='study' then
  if not payload ?& array['id','title','question','start_date','end_date','timezone','entry_offset','metric_id','outcome_source','factors','status','revision'] or jsonb_typeof(payload->'revision')<>'number' or (payload->>'revision') !~ '^[0-9]+$' or (payload->>'start_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (payload->>'end_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'INVALID_STUDY'; end if;
  if (payload-array['id','title','question','start_date','end_date','timezone','entry_offset','metric_id','outcome_source','factors','status','revision'])<>'{}'::jsonb then raise exception 'INVALID_STUDY'; end if;
  sid:=(payload->>'id')::uuid;
  if sid is null or not exists(select 1 from pg_timezone_names where name=payload->>'timezone') then raise exception 'INVALID_STUDY'; end if;
  if jsonb_typeof(payload->'factors')<>'array' or jsonb_array_length(payload->'factors')>4 then raise exception 'INVALID_FACTORS'; end if;
  for f in select * from jsonb_array_elements(payload->'factors') loop
   if jsonb_typeof(f)<>'object' or (f-array['source','offset'])<>'{}'::jsonb or not f ?& array['source','offset'] or coalesce(f->>'source','') not in ('body_weight','energy_score','mood_score','sleep_quality_score') or f->'offset' not in ('0'::jsonb,'-1'::jsonb) then raise exception 'INVALID_FACTOR'; end if;
  end loop;
  if (select count(*)<>count(distinct x->>'source') from jsonb_array_elements(payload->'factors') x) then raise exception 'DUPLICATE_FACTOR'; end if;
  perform pg_advisory_xact_lock(hashtextextended(sid::text,1));
  select * into s from public.observational_studies where id=sid for update;
  if found then
   if s.user_id<>uid then raise exception 'NOT_FOUND'; end if;
   if s.revision<>(payload->>'revision')::integer then raise exception 'REVISION_CONFLICT'; end if;
   if s.status<>'draft' and (s.title<>payload->>'title' or s.question<>payload->>'question' or s.start_date<>(payload->>'start_date')::date or s.end_date<>(payload->>'end_date')::date or s.timezone<>payload->>'timezone' or s.entry_offset<>coalesce((payload->>'entry_offset')::integer,0) or s.metric_id is distinct from (payload->>'metric_id')::uuid or s.outcome_source is distinct from payload->>'outcome_source' or s.factors<>payload->'factors') then raise exception 'CONFIG_LOCKED'; end if;
   if not ((s.status='draft' and payload->>'status' in ('draft','active','abandoned')) or (s.status='active' and payload->>'status' in ('active','paused','completed','ended_early','abandoned')) or (s.status='paused' and payload->>'status' in ('paused','active','ended_early','abandoned'))) then raise exception 'INVALID_TRANSITION'; end if;
  else
   if payload->>'status'<>'draft' or payload->'revision'<>'0'::jsonb then raise exception 'INVALID_TRANSITION'; end if;
  end if;
  insert into public.observational_studies(id,user_id,title,question,start_date,end_date,timezone,entry_offset,metric_id,outcome_source,factors,status,finished_on)
  values(sid,uid,payload->>'title',payload->>'question',(payload->>'start_date')::date,(payload->>'end_date')::date,payload->>'timezone',coalesce((payload->>'entry_offset')::integer,0),(payload->>'metric_id')::uuid,payload->>'outcome_source',payload->'factors',payload->>'status',case when payload->>'status' in ('completed','ended_early','abandoned') then (now() at time zone (payload->>'timezone'))::date + coalesce((payload->>'entry_offset')::integer,0) else null end)
  on conflict(id) do update set title=excluded.title,question=excluded.question,start_date=excluded.start_date,end_date=excluded.end_date,timezone=excluded.timezone,entry_offset=excluded.entry_offset,metric_id=excluded.metric_id,outcome_source=excluded.outcome_source,factors=excluded.factors,status=excluded.status,finished_on=excluded.finished_on,revision=public.observational_studies.revision+1,updated_at=now() returning to_jsonb(public.observational_studies.*) into result;
  return result;
 elsif action='observation' then
  if not payload ?& array['study_id','observed_date','status','value','observer','coverage','note','expected_updated_at'] or (payload->>'observed_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (payload->>'status'='recorded' and jsonb_typeof(payload->'value')<>'number') then raise exception 'INVALID_OBSERVATION'; end if;
  if (payload-array['study_id','observed_date','status','value','observer','coverage','note','expected_updated_at'])<>'{}'::jsonb then raise exception 'INVALID_OBSERVATION'; end if;
  select * into s from public.observational_studies where id=(payload->>'study_id')::uuid and user_id=uid;
  if not found or s.metric_id is null or s.status not in ('active','paused','completed','ended_early') then raise exception 'NOT_FOUND'; end if;
  select * into m from public.observation_metrics where id=s.metric_id and user_id=uid;
  d:=(payload->>'observed_date')::date; today:=(now() at time zone s.timezone)::date;
  if d is null or d>s.end_date or d<s.start_date or d>today then raise exception 'INVALID_DATE'; end if;
  v:=(payload->>'value')::float8;
  if payload->>'status'='recorded' and ((m.kind='rating' and (v<m.min or v>m.max or v<>trunc(v))) or (m.kind='boolean' and v not in (0,1))) then raise exception 'INVALID_VALUE'; end if;
  -- Serialize same metric/day writes including first insert to detect stale editors.
  perform pg_advisory_xact_lock(hashtextextended(uid::text||m.id::text||d::text,0));
  if exists(select 1 from public.metric_observations o where o.user_id=uid and o.metric_id=m.id and o.observed_date=d and o.updated_at is distinct from (payload->>'expected_updated_at')::timestamptz) then raise exception 'OBSERVATION_CONFLICT'; end if;
  insert into public.metric_observations(user_id,metric_id,observed_date,status,value,observer,coverage,note)
  values(uid,m.id,d,payload->>'status',v,payload->>'observer',payload->>'coverage',payload->>'note')
  on conflict(user_id,metric_id,observed_date) do update set status=excluded.status,value=excluded.value,observer=excluded.observer,coverage=excluded.coverage,note=excluded.note,updated_at=now() returning to_jsonb(public.metric_observations.*) into result;
  return result;
 end if;
 raise exception 'INVALID_ACTION';
end $$;
revoke all on function public.save_observational_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.save_observational_v1(text,jsonb) to authenticated;
-- Extend the reviewed deletion contract and the existing export; preserve prior extensions.
do $patch$
declare definition text; t text;
begin
 definition:=pg_get_functiondef('public.axvital_account_schema_issues(boolean)'::regprocedure);
 if position('(''workout_sessions'',''user_id'',''auth.users'',''c'',false,false)' in definition)=0 then raise exception 'ACCOUNT_PATCH_MISMATCH'; end if;
 foreach t in array array['observation_metrics','observational_studies','metric_observations'] loop
 definition:=replace(definition,'(''workout_sessions'',''user_id'',''auth.users'',''c'',false,false)',format('(%L,''user_id'',''auth.users'',''c'',false,false),(%L,''user_id'',''auth.users'',''c'',false,false)',t,'workout_sessions'));
 end loop;
 execute definition;
 definition:=pg_get_functiondef('public.axvital_export_account()'::regprocedure);
 if position('(''workout_sessions'',''r.user_id=auth.uid()'')' in definition)=0 then raise exception 'EXPORT_PATCH_MISMATCH'; end if;
 foreach t in array array['observation_metrics','observational_studies','metric_observations'] loop
 definition:=replace(definition,'(''workout_sessions'',''r.user_id=auth.uid()'')',format('(%L,''r.user_id=auth.uid()''),(%L,''r.user_id=auth.uid()'')',t,'workout_sessions'));
 end loop;
 execute definition;
end $patch$;
commit;




