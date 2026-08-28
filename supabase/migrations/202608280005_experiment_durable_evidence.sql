-- 13A.8: narrow immutable source captures; existing append-only phase ledger.
begin;

create function public.transition_experiment_v2(target_id uuid,expected_lifecycle_revision integer,action text)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='10s' as $$
declare owner_id uuid:=auth.uid();e public.experiments;revision integer;next_status text;next_phase text;event_name text;stamp timestamptz:=now();
begin
 if owner_id is null then raise exception 'AUTH_REQUIRED';end if;
 select * into e from public.experiments where id=target_id and user_id=owner_id and model_version=2 for update;
 if not found then raise exception 'EXPERIMENT_NOT_FOUND';end if;
 if not exists(select 1 from public.experiment_start_snapshots where experiment_id=e.id and user_id=owner_id and config_revision=e.config_revision) then raise exception 'START_SNAPSHOT_REQUIRED';end if;
 select count(*) into revision from public.experiment_phase_events where experiment_id=e.id and user_id=owner_id and metadata->>'lifecycle_version'='1';
 if expected_lifecycle_revision is null or revision<>expected_lifecycle_revision then raise exception 'LIFECYCLE_REVISION_CONFLICT';end if;
 if revision>=100 then raise exception 'LIFECYCLE_LIMIT';end if;
 -- Old unversioned pause/resume/end history is not upgraded by inference.
 if exists(select 1 from public.experiment_phase_events where experiment_id=e.id and event_type not in('created','configuration_changed','intervention_started') and metadata->>'lifecycle_version' is distinct from '1') then raise exception 'UNVERIFIED_LIFECYCLE_HISTORY';end if;
 next_phase:=e.current_phase;
 if action='pause' and e.status='active' and e.current_phase='intervention' then next_status:='paused';event_name:='paused';
 elsif action='resume' and e.status='paused' and e.current_phase='intervention' then next_status:='active';event_name:='resumed';
 elsif action='complete' and e.status='active' and e.current_phase='intervention' then
  if stamp<((e.intervention_end_date+1)::timestamp at time zone e.analysis_timezone) then raise exception 'PLANNED_PERIOD_NOT_FINISHED';end if;
  next_status:='completed';next_phase:='complete';event_name:='completed';
 elsif action='end_early' and e.status='active' and e.current_phase='intervention' then
  if stamp>=((e.intervention_end_date+1)::timestamp at time zone e.analysis_timezone) then raise exception 'USE_NORMAL_COMPLETION';end if;
  next_status:='ended_early';next_phase:='analysis';event_name:='ended_early';
 elsif action='abandon' and e.status in('active','paused') then next_status:='abandoned';next_phase:='complete';event_name:='abandoned';
 elsif action='archive' and e.status in('completed','ended_early','abandoned') then next_status:='archived';event_name:='archived';
 else raise exception 'INVALID_TRANSITION';end if;
 update public.experiments set status=next_status,current_phase=next_phase,
  actual_completed_at=case when action='complete' then stamp else actual_completed_at end,
  ended_early_at=case when action='end_early' then stamp else ended_early_at end,
  paused_at=case when action='pause' then stamp when action='resume' then null else paused_at end,
  archived_at=case when action='archive' then stamp else archived_at end where id=e.id;
 insert into public.experiment_phase_events(experiment_id,user_id,event_type,from_status,to_status,from_phase,to_phase,occurred_at,metadata)
 values(e.id,owner_id,event_name,e.status,next_status,e.current_phase,next_phase,stamp,
 jsonb_build_object('lifecycle_version',1,'lifecycle_revision',revision+1,'provenance','v2_transition_rpc','config_revision',e.config_revision));
 return jsonb_build_object('status',next_status,'phase',next_phase,'lifecycleRevision',revision+1);
end $$;
revoke all on function public.transition_experiment_v2(uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.transition_experiment_v2(uuid,integer,text) to authenticated;

create table public.experiment_evidence_captures(
 id uuid primary key default gen_random_uuid(),experiment_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,
 analysis_revision integer not null check(analysis_revision between 1 and 32),config_revision integer not null,
 lifecycle_revision integer not null,analysis_policy_version integer not null check(analysis_policy_version=2),
 capture_version integer not null check(capture_version=1),captured_at timestamptz not null,
 evidence_text text not null check(octet_length(evidence_text)<=2097152),digest text not null check(digest~'^[a-f0-9]{64}$'),
 foreign key(experiment_id,user_id) references public.experiments(id,user_id) on delete cascade,
 unique(experiment_id,analysis_revision)
);
alter table public.experiment_evidence_captures enable row level security;
revoke all on public.experiment_evidence_captures from public,anon,authenticated,service_role;
grant select on public.experiment_evidence_captures to authenticated;
create policy evidence_owner_read on public.experiment_evidence_captures for select to authenticated using(user_id=auth.uid());
create function public.axvital_evidence_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' and not exists(select 1 from public.experiments where id=old.experiment_id) then return old;end if;
 raise exception 'EVIDENCE_CAPTURE_IMMUTABLE';
end $$;
revoke all on function public.axvital_evidence_immutable() from public,anon,authenticated,service_role;
create trigger evidence_immutable before update or delete on public.experiment_evidence_captures for each row execute function public.axvital_evidence_immutable();

-- STABLE helper: every source subquery, including the existing STABLE nutrition
-- reader, uses the caller SELECT's MVCC snapshot. No caller-supplied records.
create function public.axvital_experiment_capture_input(target_id uuid,cutoff timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare e public.experiments;s public.experiment_start_snapshots;zone text;bs date;be date;istart date;iend date;result jsonb;primary_key text;
begin
 select * into e from public.experiments where id=target_id and user_id=auth.uid() and model_version=2;
 select * into s from public.experiment_start_snapshots where experiment_id=target_id and user_id=auth.uid();
 if e.id is null or s.id is null or s.config_revision<>e.config_revision or s.snapshot_version<>1 then raise exception 'START_SNAPSHOT_REQUIRED';end if;
 if e.status not in('completed','ended_early') or s.configuration->>'baseline_mode'<>'historical' then raise exception 'UNSUPPORTED_CAPTURE_DESIGN';end if;
 if s.configuration#>>'{intervention,type}'<>'nutrition_target' then raise exception 'UNSUPPORTED_CAPTURE_SOURCE';end if;
 if (select count(*) from jsonb_array_elements(s.configuration->'outcomes') o where o->>'outcome_role'='primary')<>1 then raise exception 'PRIMARY_OUTCOME_REQUIRED';end if;
 select o->>'registry_key' into primary_key from jsonb_array_elements(s.configuration->'outcomes') o where o->>'outcome_role'='primary';
 if primary_key not in('energy_score','mood_score','sleep_quality_score','nutrition_calories','nutrition_protein_grams','nutrition_carbohydrate_grams','nutrition_fat_grams','nutrition_fiber_grams','nutrition_caffeine_mg','nutrition_alcohol_grams') then raise exception 'UNSUPPORTED_CAPTURE_OUTCOME';end if;
 zone:=s.configuration->>'analysis_timezone';bs:=(s.configuration->>'baseline_start_date')::date;be:=(s.configuration->>'baseline_end_date')::date+1;
 istart:=(s.configuration->>'intervention_start_date')::date;
 iend:=least((s.configuration->>'intervention_end_date')::date+1,(case when e.status='completed' then e.actual_completed_at else e.ended_early_at end at time zone zone)::date,(cutoff at time zone zone)::date);
 if iend is null or iend<=istart or iend-istart>366 or be-bs not between 1 and 366 then raise exception 'INVALID_CAPTURE_WINDOW';end if;
 select jsonb_build_object('captureVersion',1,'analysisPolicyVersion',2,'cutoff',cutoff,
  'versions',jsonb_build_object('analysisContract',2,'readinessPolicy',1,'sourceAdapter',1,'measurementRegistry',1,'exposureContract',1,'lifecycleContract',1),
  'experiment',jsonb_build_object('id',e.id,'user_id',e.user_id,'config_revision',e.config_revision,'model_version',e.model_version,'status',e.status,'current_phase',e.current_phase,'actual_started_at',e.actual_started_at,'actual_completed_at',e.actual_completed_at,'ended_early_at',e.ended_early_at),
  'startSnapshot',jsonb_build_object('snapshot_version',s.snapshot_version,'config_revision',s.config_revision,'configuration',s.configuration),
  'events',(select coalesce(jsonb_agg(to_jsonb(p) order by p.occurred_at,p.id),'[]') from
    (select event_type,occurred_at,from_status,to_status,from_phase,to_phase,metadata,id from public.experiment_phase_events where experiment_id=e.id and user_id=e.user_id order by occurred_at,id limit 1000) p),
  'baseline',jsonb_build_object('start',bs,'end',be,'nutrition',public.read_nutrition_observations_v1(bs,be,zone,cutoff),
    'checkins',(select coalesce(jsonb_agg(to_jsonb(c) order by c.checkin_date,c.id),'[]') from (select id,user_id,checkin_date,case when primary_key='energy_score' then energy_score end energy_score,case when primary_key='mood_score' then mood_score end mood_score,case when primary_key='sleep_quality_score' then sleep_quality end sleep_quality from public.daily_checkins where primary_key in('energy_score','mood_score','sleep_quality_score') and user_id=e.user_id and checkin_date>=bs and checkin_date<be order by checkin_date,id limit 1000)c)),
  'intervention',jsonb_build_object('start',istart,'end',iend,'nutrition',public.read_nutrition_observations_v1(istart,iend,zone,cutoff),
    'checkins',(select coalesce(jsonb_agg(to_jsonb(c) order by c.checkin_date,c.id),'[]') from (select id,user_id,checkin_date,case when primary_key='energy_score' then energy_score end energy_score,case when primary_key='mood_score' then mood_score end mood_score,case when primary_key='sleep_quality_score' then sleep_quality end sleep_quality from public.daily_checkins where primary_key in('energy_score','mood_score','sleep_quality_score') and user_id=e.user_id and checkin_date>=istart and checkin_date<iend order by checkin_date,id limit 1000)c))) into result;
 if jsonb_array_length(result->'events')>=1000 then raise exception 'LIFECYCLE_LIMIT';end if;
 return result;
end $$;
revoke all on function public.axvital_experiment_capture_input(uuid,timestamptz) from public,anon,authenticated,service_role;

create function public.capture_experiment_evidence_v1(target_id uuid,expected_analysis_revision integer,expected_lifecycle_revision integer)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='10s' as $$
declare owner_id uuid:=auth.uid();e public.experiments;rev integer;life integer;payload jsonb;encoded text;stamp timestamptz:=now();capture_id uuid;checksum text;
begin
 if owner_id is null then raise exception 'AUTH_REQUIRED';end if;
 select * into e from public.experiments where id=target_id and user_id=owner_id and model_version=2 for update;
 if not found then raise exception 'EXPERIMENT_NOT_FOUND';end if;
 select coalesce(max(analysis_revision),0) into rev from public.experiment_evidence_captures where experiment_id=e.id and user_id=owner_id;
 select count(*) into life from public.experiment_phase_events where experiment_id=e.id and user_id=owner_id and metadata->>'lifecycle_version'='1';
 if expected_analysis_revision is null or rev<>expected_analysis_revision or expected_lifecycle_revision is null or life<>expected_lifecycle_revision then raise exception 'CAPTURE_REVISION_CONFLICT';end if;
 if rev>=32 then raise exception 'CAPTURE_LIMIT';end if;
 payload:=public.axvital_experiment_capture_input(e.id,stamp);
 encoded:=payload::text;checksum:=encode(sha256(convert_to(encoded,'UTF8')),'hex');
 if octet_length(encoded)>2097152 then raise exception 'CAPTURE_TOO_LARGE';end if;
 insert into public.experiment_evidence_captures(experiment_id,user_id,analysis_revision,config_revision,lifecycle_revision,analysis_policy_version,capture_version,captured_at,evidence_text,digest)
 values(e.id,owner_id,rev+1,e.config_revision,life,2,1,stamp,encoded,checksum) returning id into capture_id;
 return jsonb_build_object('analysisRevision',rev+1,'lifecycleRevision',life,'captureId',capture_id);
end $$;
revoke all on function public.capture_experiment_evidence_v1(uuid,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.capture_experiment_evidence_v1(uuid,integer,integer) to authenticated;

-- Extend existing fail-closed export/deletion manifests rather than replacing
-- their audited checks. Exact anchors fail the migration if the contract drifted.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('public.axvital_account_schema_issues(boolean)'::regprocedure);
 anchor:='(''experiment_start_snapshots'',''user_id'',''auth.users'',''c'',false,false),';
 if position(anchor in definition)=0 then raise exception 'ACCOUNT_SCHEMA_ANCHOR_MISSING';end if;
 definition:=replace(definition,anchor,anchor||E'\n(''experiment_evidence_captures'',''user_id'',''auth.users'',''c'',false,false),');
 anchor:='(''experiment_start_snapshots'',''experiment_id'',''experiments'',''c'',true),';
 if position(anchor in definition)=0 then raise exception 'ACCOUNT_RELATIONSHIP_ANCHOR_MISSING';end if;
 execute replace(definition,anchor,anchor||E'\n(''experiment_evidence_captures'',''experiment_id'',''experiments'',''c'',true),');
 definition:=pg_get_functiondef('public.axvital_export_account()'::regprocedure);
 anchor:='(''experiment_start_snapshots'',''r.user_id=auth.uid()''),';
 if position(anchor in definition)=0 then raise exception 'ACCOUNT_EXPORT_ANCHOR_MISSING';end if;
 execute replace(definition,anchor,anchor||E'\n(''experiment_evidence_captures'',''r.user_id=auth.uid()''),');
end $$;
select public.axvital_assert_account_schema(true);
commit;
