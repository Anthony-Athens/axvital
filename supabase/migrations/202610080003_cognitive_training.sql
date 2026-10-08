begin;
-- Native arithmetic practice: standard tracking is available to authenticated
-- AXVital users, like workouts. No new premium entitlement or billing product.
create table public.cognitive_sessions (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 config jsonb not null,
 scoring_version text not null,
 generator_version text not null,
 started_at timestamptz not null,
 ended_at timestamptz not null,
 elapsed_ms integer not null check(elapsed_ms between 1 and 86400000),
 answered integer not null check(answered between 0 and 10000),
 correct integer not null check(correct between 0 and answered),
 accuracy numeric not null check(accuracy between 0 and 100),
 qpm numeric not null check(qpm >= 0),
 score numeric not null check(score >= 0),
 answers jsonb not null check(jsonb_typeof(answers)='array'),
 created_at timestamptz not null default now(),
 check(ended_at > started_at)
);
create index cognitive_sessions_owner_time on public.cognitive_sessions(user_id,ended_at desc,id desc);
alter table public.cognitive_sessions enable row level security;
create policy cognitive_sessions_owner_select on public.cognitive_sessions for select to authenticated using(user_id=auth.uid());
-- Clients cannot bypass validation, change scores, or overwrite completed sessions.
revoke all on public.cognitive_sessions from public,anon,authenticated;
grant select on public.cognitive_sessions to authenticated;

create function public.save_cognitive_session_v1(p_session jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 owner_id uuid := auth.uid(); session_id uuid; cfg jsonb; mode text; difficulty text; operation text;
 mode_value integer; cap integer; factor integer; elapsed integer; started timestamptz; ended timestamptz;
 detail jsonb; clean_answers jsonb := '[]'::jsonb; a integer; b integer; op text; answer integer; answer_at integer;
 previous_at integer := 0; expected integer; answered_count integer; correct_count integer := 0;
 accuracy_value numeric; qpm_value numeric; existing public.cognitive_sessions;
begin
 if owner_id is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_session is null or jsonb_typeof(p_session)<>'object' or octet_length(p_session::text)>2000000
 or not p_session ?& array['id','config','scoringVersion','generatorVersion','startedAt','elapsedMs','answers']
 or (p_session - array['id','config','scoringVersion','generatorVersion','startedAt','elapsedMs','answers'])<>'{}'::jsonb
 or p_session->>'scoringVersion' is distinct from 'mental-mathletics-percent-qpm-v1'
 or p_session->>'generatorVersion' is distinct from 'axvital-arithmetic-v1' then raise exception 'INVALID_SESSION'; end if;
 session_id := (p_session->>'id')::uuid;
 cfg := p_session->'config';
 if jsonb_typeof(cfg)<>'object' or not cfg ?& array['mode','value','operation','difficulty']
 or (cfg-array['mode','value','operation','difficulty'])<>'{}'::jsonb then raise exception 'INVALID_CONFIG'; end if;
 mode := cfg->>'mode'; difficulty := cfg->>'difficulty'; operation := cfg->>'operation';
 if mode is null or mode not in ('time','count') or difficulty is null or difficulty not in ('easy','standard','hard')
 or operation is null or operation not in ('mixed','+','-','*','/') or jsonb_typeof(cfg->'value')<>'number'
 or (cfg->>'value') !~ '^[0-9]+$' then raise exception 'INVALID_CONFIG'; end if;
 mode_value := (cfg->>'value')::integer;
 if (mode='time' and mode_value not in (2,5,10)) or (mode='count' and mode_value not in (20,50,100)) then raise exception 'INVALID_CONFIG'; end if;
 cap := case difficulty when 'easy' then 20 when 'standard' then 99 else 999 end;
 factor := case difficulty when 'easy' then 5 when 'standard' then 12 else 25 end;
 if jsonb_typeof(p_session->'elapsedMs')<>'number' or (p_session->>'elapsedMs') !~ '^[0-9]+$'
 or jsonb_typeof(p_session->'answers')<>'array' then raise exception 'INVALID_SESSION'; end if;
 elapsed := (p_session->>'elapsedMs')::integer;
 if elapsed is null or elapsed<1 or elapsed>86400000 then raise exception 'INVALID_SESSION'; end if;
 if p_session->>'startedAt' is null or (p_session->>'startedAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then raise exception 'INVALID_TIME'; end if;
 started := (p_session->>'startedAt')::timestamptz;
 ended := started + elapsed * interval '1 millisecond';
 -- Modest client clock tolerance; results may be retried later with the same ID.
 if not isfinite(started) or started > now()+interval '5 minutes' or ended > now()+interval '5 minutes' then raise exception 'INVALID_TIME'; end if;
 answered_count := jsonb_array_length(p_session->'answers');
 if answered_count>10000 or (mode='count' and answered_count<>mode_value) or (mode='time' and elapsed<>mode_value*60000) then raise exception 'INCOMPLETE_SESSION'; end if;
 for detail in select value from jsonb_array_elements(p_session->'answers') loop
  if jsonb_typeof(detail)<>'object' or not detail ?& array['a','b','operator','answer','atMs']
  or (detail-array['a','b','operator','answer','atMs'])<>'{}'::jsonb then raise exception 'INVALID_ANSWER'; end if;
  if exists(select 1 from jsonb_each(detail) e where e.key in ('a','b','answer','atMs') and (jsonb_typeof(e.value)<>'number' or e.value::text !~ '^-?[0-9]+$')) then raise exception 'INVALID_ANSWER'; end if;
  a := (detail->>'a')::integer; b := (detail->>'b')::integer; op := detail->>'operator';
  answer := (detail->>'answer')::integer; answer_at := (detail->>'atMs')::integer;
  if a is null or b is null or op is null or answer is null or answer_at is null
  or a<0 or a>cap or b<0 or b>cap or op not in ('+','-','*','/') or (operation<>'mixed' and op<>operation)
  or answer not between -1000000 and 1000000 or answer_at<previous_at or answer_at>elapsed or (mode='time' and answer_at>=elapsed)
  or (op='*' and a>factor) or (op='/' and (b=0 or b>factor)) then raise exception 'INVALID_ANSWER'; end if;
  if op='/' and a % b <> 0 then raise exception 'INVALID_QUESTION'; end if;
  expected := case op when '+' then a+b when '-' then a-b when '*' then a*b else a/b end;
  if expected<0 or expected>cap then raise exception 'INVALID_QUESTION'; end if;
  if answer=expected then correct_count:=correct_count+1; end if;
  previous_at := answer_at;
  clean_answers := clean_answers || jsonb_build_array(jsonb_build_object('a',a,'b',b,'operator',op,'answer',answer,'atMs',answer_at));
 end loop;
 if mode='count' and previous_at<>elapsed then raise exception 'INVALID_TIME'; end if;
 accuracy_value := case when answered_count=0 then 0 else correct_count::numeric/answered_count*100 end;
 qpm_value := answered_count::numeric*60000/elapsed;
 insert into public.cognitive_sessions(id,user_id,config,scoring_version,generator_version,started_at,ended_at,elapsed_ms,answered,correct,accuracy,qpm,score,answers)
 values(session_id,owner_id,cfg,p_session->>'scoringVersion',p_session->>'generatorVersion',started,ended,elapsed,answered_count,correct_count,accuracy_value,qpm_value,accuracy_value*qpm_value,clean_answers)
 on conflict(id) do nothing;
 select * into existing from public.cognitive_sessions where id=session_id and user_id=owner_id;
 if existing.id is null or existing.config<>cfg or existing.started_at<>started or existing.elapsed_ms<>elapsed
 or existing.answers<>clean_answers or existing.scoring_version<>p_session->>'scoringVersion' or existing.generator_version<>p_session->>'generatorVersion'
 then raise exception 'SESSION_CONFLICT' using errcode='23505'; end if;
 return session_id;
end $$;
revoke all on function public.save_cognitive_session_v1(jsonb) from public,anon;
grant execute on function public.save_cognitive_session_v1(jsonb) to authenticated;

-- Include native sessions in existing account exports and deletion schema checks.
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('public.axvital_account_schema_issues(boolean)'::regprocedure);
 if position('(''workout_sessions'',''user_id'',''auth.users'',''c'',false,false)' in definition)=0 then raise exception 'COGNITIVE_ACCOUNT_SCHEMA_PATCH_MISMATCH'; end if;
 definition:=replace(definition,'(''workout_sessions'',''user_id'',''auth.users'',''c'',false,false)',
 '(''cognitive_sessions'',''user_id'',''auth.users'',''c'',false,false),(''workout_sessions'',''user_id'',''auth.users'',''c'',false,false)');
 execute definition;
 definition:=pg_get_functiondef('public.axvital_export_account()'::regprocedure);
 if position('(''workout_sessions'',''r.user_id=auth.uid()'')' in definition)=0 then raise exception 'COGNITIVE_ACCOUNT_EXPORT_PATCH_MISMATCH'; end if;
 definition:=replace(definition,'(''workout_sessions'',''r.user_id=auth.uid()'')',
 '(''cognitive_sessions'',''r.user_id=auth.uid()''),(''workout_sessions'',''r.user_id=auth.uid()'')');
 execute definition;
end $patch$;
commit;
