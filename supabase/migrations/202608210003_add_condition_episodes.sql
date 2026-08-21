-- Sprint 7: generic, self-reported condition episodes and immutable progress updates.
alter table public.conditions add column preferred_episode_label text;
alter table public.conditions add constraint conditions_episode_label_length check (preferred_episode_label is null or char_length(btrim(preferred_episode_label)) between 2 and 40);
update public.conditions set preferred_episode_label=case slug when 'multiple-sclerosis' then 'Flare' when 'herpes-simplex-virus-type-1' then 'Outbreak' when 'herpes-simplex-virus-type-2' then 'Outbreak' when 'migraine-disorder' then 'Migraine Episode' when 'asthma' then 'Attack' when 'rheumatoid-arthritis' then 'Flare' else preferred_episode_label end;

create table public.condition_episodes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 user_condition_id uuid not null references public.user_conditions(id) on delete cascade,
 episode_type text not null default 'episode' check(episode_type in('flare','outbreak','attack','episode','exacerbation','relapse','custom')),
 title text check(title is null or char_length(btrim(title)) between 2 and 120), started_at timestamptz not null, ended_at timestamptz,
 status text not null default 'ongoing' check(status in('ongoing','resolved','archived')),
 overall_severity smallint check(overall_severity between 1 and 10),
 functional_impact text check(functional_impact in('none','mild','moderate','significant','severe')),
 notes text check(notes is null or char_length(notes)<=2000), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
 unique(id,user_id), check(ended_at is null or ended_at>=started_at), check(status<>'resolved' or ended_at is not null), check((status='archived')=(archived_at is not null))
);
create table public.episode_symptom_links (
 id uuid primary key default gen_random_uuid(), condition_episode_id uuid not null references public.condition_episodes(id) on delete cascade,
 user_symptom_event_id uuid not null references public.user_symptom_events(id) on delete cascade, created_at timestamptz not null default now(), unique(condition_episode_id,user_symptom_event_id)
);
create table public.episode_updates (
 id uuid primary key default gen_random_uuid(), condition_episode_id uuid not null references public.condition_episodes(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, recorded_at timestamptz not null default now(),
 overall_severity smallint check(overall_severity between 1 and 10), functional_impact text check(functional_impact in('none','mild','moderate','significant','severe')),
 status text check(status in('ongoing','improving','stable','worsening','resolved')), notes text check(notes is null or char_length(notes)<=2000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index condition_episodes_user_idx on public.condition_episodes(user_id);
create index condition_episodes_condition_started_idx on public.condition_episodes(user_condition_id,started_at desc);
create index condition_episodes_user_status_idx on public.condition_episodes(user_id,status) where archived_at is null;
create index condition_episodes_started_idx on public.condition_episodes(started_at desc);
create index condition_episodes_ended_idx on public.condition_episodes(ended_at) where ended_at is not null;
create index condition_episodes_archived_idx on public.condition_episodes(archived_at) where archived_at is not null;
create index episode_symptom_links_episode_idx on public.episode_symptom_links(condition_episode_id);
create index episode_symptom_links_symptom_idx on public.episode_symptom_links(user_symptom_event_id);
create index episode_updates_episode_recorded_idx on public.episode_updates(condition_episode_id,recorded_at);
create index episode_updates_user_idx on public.episode_updates(user_id);
create trigger condition_episodes_set_updated_at before update on public.condition_episodes for each row execute function public.axvital_planning_set_updated_at();
create trigger episode_updates_set_updated_at before update on public.episode_updates for each row execute function public.axvital_planning_set_updated_at();
alter table public.condition_episodes enable row level security; alter table public.episode_symptom_links enable row level security; alter table public.episode_updates enable row level security;
create policy "Users manage own episodes" on public.condition_episodes for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.user_conditions c where c.id=user_condition_id and c.user_id=(select auth.uid())));
create policy "Users manage own episode symptom links" on public.episode_symptom_links for all to authenticated using(exists(select 1 from public.condition_episodes e join public.user_symptom_events s on s.id=user_symptom_event_id where e.id=condition_episode_id and e.user_id=(select auth.uid()) and s.user_id=(select auth.uid()))) with check(exists(select 1 from public.condition_episodes e join public.user_symptom_events s on s.id=user_symptom_event_id where e.id=condition_episode_id and e.user_id=(select auth.uid()) and s.user_id=(select auth.uid())));
create policy "Users manage own episode updates" on public.episode_updates for all to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.condition_episodes e where e.id=condition_episode_id and e.user_id=(select auth.uid()))) with check(user_id=(select auth.uid()) and exists(select 1 from public.condition_episodes e where e.id=condition_episode_id and e.user_id=(select auth.uid())));

create function public.create_condition_episode(input jsonb) returns public.condition_episodes language plpgsql security invoker set search_path='' as $$
declare uid uuid:=(select auth.uid()); ep public.condition_episodes; symptom jsonb; symptom_id uuid; existing_id uuid;
begin
 if uid is null or not exists(select 1 from public.user_conditions c where c.id=(input->>'user_condition_id')::uuid and c.user_id=uid and c.archived_at is null) then raise exception 'Condition not found'; end if;
 insert into public.condition_episodes(user_id,user_condition_id,episode_type,title,started_at,overall_severity,functional_impact,notes)
 values(uid,(input->>'user_condition_id')::uuid,coalesce(input->>'episode_type','episode'),nullif(btrim(input->>'title'),''),(input->>'started_at')::timestamptz,nullif(input->>'overall_severity','')::smallint,nullif(input->>'functional_impact',''),nullif(btrim(input->>'notes'),'')) returning * into ep;
 for existing_id in select value::text::uuid from jsonb_array_elements_text(coalesce(input->'existing_symptom_event_ids','[]')) loop
  if not exists(select 1 from public.user_symptom_events where id=existing_id and user_id=uid and deleted_at is null) then raise exception 'Symptom event not found'; end if;
  insert into public.episode_symptom_links(condition_episode_id,user_symptom_event_id) values(ep.id,existing_id);
 end loop;
 for symptom in select value from jsonb_array_elements(coalesce(input->'new_symptoms','[]')) loop
  if (symptom->>'symptom_id') is not null and not exists(select 1 from public.symptoms where id=(symptom->>'symptom_id')::uuid and is_active) then raise exception 'Symptom not found'; end if;
  insert into public.user_symptom_events(user_id,symptom_id,custom_symptom_name,started_at,severity,notes,source)
  values(uid,nullif(symptom->>'symptom_id','')::uuid,nullif(btrim(symptom->>'custom_name'),''),coalesce(nullif(symptom->>'started_at','')::timestamptz,ep.started_at),nullif(symptom->>'severity','')::smallint,nullif(btrim(symptom->>'notes'),''),'my_health') returning id into symptom_id;
  insert into public.symptom_event_conditions(symptom_event_id,user_condition_id) values(symptom_id,ep.user_condition_id);
  insert into public.episode_symptom_links(condition_episode_id,user_symptom_event_id) values(ep.id,symptom_id);
 end loop;
 insert into public.episode_updates(condition_episode_id,user_id,recorded_at,overall_severity,functional_impact,status,notes) values(ep.id,uid,ep.started_at,ep.overall_severity,ep.functional_impact,'ongoing','Episode started');
 return ep;
end$$;
grant execute on function public.create_condition_episode(jsonb) to authenticated;

create function public.update_condition_episode(target_id uuid,input jsonb) returns public.condition_episodes language plpgsql security invoker set search_path='' as $$
declare uid uuid:=(select auth.uid()); ep public.condition_episodes; next_status text:=coalesce(input->>'status','ongoing'); stamp timestamptz:=coalesce(nullif(input->>'recorded_at','')::timestamptz,now()); symptom_id uuid;
begin
 select * into ep from public.condition_episodes where id=target_id and user_id=uid and archived_at is null for update; if ep.id is null then raise exception 'Episode not found'; end if;
 update public.condition_episodes set overall_severity=coalesce(nullif(input->>'overall_severity','')::smallint,overall_severity),functional_impact=coalesce(nullif(input->>'functional_impact',''),functional_impact),status=case when next_status='resolved' then 'resolved' else 'ongoing' end,ended_at=case when next_status='resolved' then stamp else ended_at end where id=ep.id returning * into ep;
 insert into public.episode_updates(condition_episode_id,user_id,recorded_at,overall_severity,functional_impact,status,notes) values(ep.id,uid,stamp,nullif(input->>'overall_severity','')::smallint,nullif(input->>'functional_impact',''),next_status,nullif(btrim(input->>'notes'),''));
 for symptom_id in select value::text::uuid from jsonb_array_elements_text(coalesce(input->'symptom_event_ids','[]')) loop
  if not exists(select 1 from public.user_symptom_events where id=symptom_id and user_id=uid and deleted_at is null) then raise exception 'Symptom event not found'; end if;
  insert into public.episode_symptom_links(condition_episode_id,user_symptom_event_id) values(ep.id,symptom_id) on conflict do nothing;
 end loop;
 return ep;
end$$;
grant execute on function public.update_condition_episode(uuid,jsonb) to authenticated;

alter table public.experiment_outcomes drop constraint experiment_outcomes_outcome_type_check;
alter table public.experiment_outcomes add constraint experiment_outcomes_outcome_type_check check(outcome_type in('symptom_occurrence','symptom_severity','symptom_duration','sleep_quality','mood','energy','weight','habit_adherence','protocol_adherence','workout_performance','episode_frequency','episode_duration','episode_severity','episode_impact','custom_numeric','custom_binary'));
alter table public.experiment_outcomes add column user_condition_id uuid references public.user_conditions(id) on delete restrict;
alter table public.experiment_outcomes add constraint experiment_episode_outcome_condition check(outcome_type not like 'episode_%' or user_condition_id is not null);
