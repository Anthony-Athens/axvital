-- Forward-only hardening. Baseline profiles/checkins/events/recaps already exist in the deployed schema.
-- Run on a staging copy first; unknown/missing baseline columns fail closed.
begin;
alter table public.profiles enable row level security;
create policy sprint12_owner_guard on public.profiles as restrictive for all to public using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter table public.daily_checkins enable row level security;
create policy sprint12_owner_guard on public.daily_checkins as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.health_events enable row level security;
create policy sprint12_owner_guard on public.health_events as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.weekly_recaps enable row level security;
create policy sprint12_owner_guard on public.weekly_recaps as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.planned_activities enable row level security;
create policy sprint12_owner_guard on public.planned_activities as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.planned_activity_occurrences enable row level security;
create policy sprint12_owner_guard on public.planned_activity_occurrences as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.protocol_templates enable row level security;
create policy sprint12_owner_guard on public.protocol_templates as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.protocol_template_activities enable row level security;
create policy sprint12_owner_guard on public.protocol_template_activities as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.user_protocols enable row level security;
create policy sprint12_owner_guard on public.user_protocols as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.user_protocol_activities enable row level security;
create policy sprint12_owner_guard on public.user_protocol_activities as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.protocol_pause_periods enable row level security;
create policy sprint12_owner_guard on public.protocol_pause_periods as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.workout_templates enable row level security;
create policy sprint12_owner_guard on public.workout_templates as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.workout_template_groups enable row level security;
create policy sprint12_owner_guard on public.workout_template_groups as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.workout_template_exercises enable row level security;
create policy sprint12_owner_guard on public.workout_template_exercises as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.workout_template_sets enable row level security;
create policy sprint12_owner_guard on public.workout_template_sets as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.planned_workouts enable row level security;
create policy sprint12_owner_guard on public.planned_workouts as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.planned_workout_exercises enable row level security;
create policy sprint12_owner_guard on public.planned_workout_exercises as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.planned_workout_sets enable row level security;
create policy sprint12_owner_guard on public.planned_workout_sets as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.workout_sessions enable row level security;
create policy sprint12_owner_guard on public.workout_sessions as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.workout_session_exercises enable row level security;
create policy sprint12_owner_guard on public.workout_session_exercises as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.workout_session_sets enable row level security;
create policy sprint12_owner_guard on public.workout_session_sets as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.user_conditions enable row level security;
create policy sprint12_owner_guard on public.user_conditions as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.user_symptoms enable row level security;
create policy sprint12_owner_guard on public.user_symptoms as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.user_symptom_events enable row level security;
create policy sprint12_owner_guard on public.user_symptom_events as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.experiments enable row level security;
create policy sprint12_owner_guard on public.experiments as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.experiment_phase_events enable row level security;
create policy sprint12_owner_guard on public.experiment_phase_events as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.experiment_measurements enable row level security;
create policy sprint12_owner_guard on public.experiment_measurements as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.user_foods enable row level security;
create policy sprint12_owner_guard on public.user_foods as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.nutrition_entries enable row level security;
create policy sprint12_owner_guard on public.nutrition_entries as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.user_food_preferences enable row level security;
create policy sprint12_owner_guard on public.user_food_preferences as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.saved_meals enable row level security;
create policy sprint12_owner_guard on public.saved_meals as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.nutrition_targets enable row level security;
create policy sprint12_owner_guard on public.nutrition_targets as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.condition_episodes enable row level security;
create policy sprint12_owner_guard on public.condition_episodes as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.episode_updates enable row level security;
create policy sprint12_owner_guard on public.episode_updates as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.subscriptions enable row level security;
create policy sprint12_owner_guard on public.subscriptions as restrictive for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.nutrition_entry_items enable row level security;
alter table public.saved_meal_items enable row level security;
alter table public.symptom_event_conditions enable row level security;
alter table public.experiment_interventions enable row level security;
alter table public.experiment_outcomes enable row level security;
alter table public.experiment_condition_links enable row level security;
alter table public.experiment_results enable row level security;
alter table public.episode_symptom_links enable row level security;

-- Existing owner policies and grants are retained; no new permissive CRUD access. Every private FK must also resolve through
-- the caller's SELECT policy. This covers optional links as well as direct parents.
-- The fixed table inventory intentionally excludes public catalogs and auth.users.
do $$
declare r record; predicate text; private_tables text[] := array['profiles','daily_checkins','health_events','weekly_recaps','planned_activities','planned_activity_occurrences','protocol_templates','protocol_template_activities','user_protocols','user_protocol_activities','protocol_pause_periods','workout_templates','workout_template_groups','workout_template_exercises','workout_template_sets','planned_workouts','planned_workout_exercises','planned_workout_sets','workout_sessions','workout_session_exercises','workout_session_sets','user_conditions','user_symptoms','user_symptom_events','experiments','experiment_phase_events','experiment_measurements','user_foods','nutrition_entries','user_food_preferences','saved_meals','nutrition_targets','condition_episodes','episode_updates','subscriptions','nutrition_entry_items','saved_meal_items','symptom_event_conditions','experiment_interventions','experiment_outcomes','experiment_condition_links','experiment_results','episode_symptom_links'];
begin
 for r in
  select c.oid, child.relname child_table, parent.relname parent_table,
         a.attname child_column, b.attname parent_column
  from pg_constraint c
  join pg_class child on child.oid=c.conrelid
  join pg_class parent on parent.oid=c.confrelid
  join pg_namespace ns on ns.oid=child.relnamespace
  join pg_namespace pn on pn.oid=parent.relnamespace
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  join pg_attribute b on b.attrelid=c.confrelid and b.attnum=c.confkey[1]
  where c.contype='f' and ns.nspname='public' and pn.nspname='public'
    and child.relname=any(private_tables) and parent.relname=any(private_tables)
    -- Composite owner FKs already enforce matching owners; single UUID FKs need this guard.
    and cardinality(c.conkey)=1
 loop
  predicate := format('(%I is null or exists (select 1 from public.%I parent where parent.%I = %I.%I))', r.child_column,r.parent_table,r.parent_column,r.child_table,r.child_column);
  execute format('create policy %I on public.%I as restrictive for all to public using (%s) with check (%s)', 'sprint12_link_'||r.child_column,r.child_table,predicate,predicate);
 end loop;
end $$;

-- Custom exercises are private; shared library exercises remain available.
do $$ declare t text; begin
 foreach t in array array['workout_template_exercises','planned_workout_exercises','workout_session_exercises'] loop
  execute format('create policy sprint12_exercise_link on public.%I as restrictive for all to public using (exercise_id is null or exists(select 1 from public.exercises e where e.id=exercise_id and (e.user_id is null or e.user_id=(select auth.uid())))) with check (exercise_id is null or exists(select 1 from public.exercises e where e.id=exercise_id and (e.user_id is null or e.user_id=(select auth.uid()))))',t);
 end loop;
end $$;

-- Same owner is not enough: a measurement must belong to its stated experiment.
alter table public.experiment_outcomes add constraint experiment_outcome_identity unique(id,experiment_id);
alter table public.experiment_measurements add constraint measurement_outcome_experiment
 foreign key(experiment_outcome_id,experiment_id) references public.experiment_outcomes(id,experiment_id) not valid;
create policy sprint12_measurement_outcome on public.experiment_measurements as restrictive for all to public
 using (exists(select 1 from public.experiment_outcomes o where o.id=experiment_outcome_id and o.experiment_id=experiment_measurements.experiment_id))
 with check (exists(select 1 from public.experiment_outcomes o where o.id=experiment_outcome_id and o.experiment_id=experiment_measurements.experiment_id));

-- Polymorphic references must resolve to an owned source. No definer/service bypass.
create function public.axvital_measurement_source_owned(source_type text, source_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select case
  when source_type in ('custom_manual','calculated_snapshot') then source_id is null
  when source_id is null then false
  when source_type='daily_checkin' then exists(select 1 from public.daily_checkins where id=source_id and user_id=auth.uid())
  when source_type='health_event' then exists(select 1 from public.health_events where id=source_id and user_id=auth.uid())
  when source_type='symptom_event' then exists(select 1 from public.user_symptom_events where id=source_id and user_id=auth.uid())
  when source_type='workout_session' then exists(select 1 from public.workout_sessions where id=source_id and user_id=auth.uid())
  when source_type in ('habit_completion','protocol_completion','planned_activity_occurrence') then exists(select 1 from public.planned_activity_occurrences where id=source_id and user_id=auth.uid())
  else false end;
$$;
revoke all on function public.axvital_measurement_source_owned(text,uuid) from public;
grant execute on function public.axvital_measurement_source_owned(text,uuid) to authenticated;
create policy sprint12_measurement_source on public.experiment_measurements as restrictive for all to authenticated
 using (public.axvital_measurement_source_owned(source_type,source_record_id))
 with check (public.axvital_measurement_source_owned(source_type,source_record_id));

-- Browser roles cannot write billing projections or read/write operational events,
-- even if a stale permissive policy exists in a deployed environment.
revoke insert,update,delete on public.subscriptions from anon,authenticated;
revoke all on public.product_events,public.stripe_webhook_events from anon,authenticated;

-- Partial answers are unknown, never invented defaults. Preserve all existing rows.
alter table public.daily_checkins alter column energy_score drop not null, alter column energy_score drop default;
alter table public.daily_checkins alter column mood_score drop not null, alter column mood_score drop default;
alter table public.daily_checkins alter column sleep_quality drop not null, alter column sleep_quality drop default;
alter table public.daily_checkins alter column exercise_level drop not null, alter column exercise_level drop default;
alter table public.daily_checkins alter column nutrition_quality drop not null, alter column nutrition_quality drop default;
alter table public.daily_checkins alter column stress_level drop not null, alter column stress_level drop default;
alter table public.daily_checkins alter column alcohol drop not null, alter column alcohol drop default;
-- Concurrent empty-day inserts must conflict rather than replace data.
create unique index if not exists daily_checkins_owner_date_unique on public.daily_checkins(user_id,checkin_date);
commit;
