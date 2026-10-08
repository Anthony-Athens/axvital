-- Keep the existing authorized activity-edit path, but commit linked workout dates
-- in the same PostgreSQL transaction. No existing data is reconciled automatically.
create or replace function public.update_planned_activity(
  target_id uuid, input jsonb, future_from date
) returns public.planned_activities
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  activity public.planned_activities;
  edited public.planned_activities;
  workout public.planned_workouts;
  occurrence public.planned_activity_occurrences;
  workout_ids uuid[];
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if input is null or jsonb_typeof(input) <> 'object' or future_from is null then
    raise exception 'INVALID_ACTIVITY_INPUT';
  end if;
  if exists (select 1 from jsonb_object_keys(input) k where k not in (
    'title','description','activity_type','recurrence_type','start_date','end_date',
    'scheduled_time','days_of_week','interval_days','is_active','tracking_type',
    'target_value','target_unit','minimum_value','allow_partial_completion',
    'habit_color','habit_icon','sort_order','recurrence_active_from'
  )) then raise exception 'INVALID_ACTIVITY_FIELD'; end if;

  select * into activity from public.planned_activities
  where id = target_id and user_id = owner_id for update;
  if not found then raise exception 'ACTIVITY_NOT_FOUND'; end if;
  edited := jsonb_populate_record(activity, input);

  select array_agg(w.id) into workout_ids from public.planned_workouts w
  where w.user_id = owner_id and (w.planned_activity_id = target_id or
    w.planned_activity_occurrence_id in (select o.id from public.planned_activity_occurrences o where o.planned_activity_id = target_id and o.user_id = owner_id));
  if cardinality(workout_ids) > 1 then raise exception 'WORKOUT_SCHEDULE_NEEDS_REVIEW'; end if;

  if cardinality(workout_ids) = 1 then
    select * into workout from public.planned_workouts
    where id = workout_ids[1] and user_id = owner_id for update;
    if workout.status not in ('draft','planned') or exists (
      select 1 from public.workout_sessions s where s.planned_workout_id = workout.id and s.user_id = owner_id
    ) then raise exception 'WORKOUT_ALREADY_STARTED'; end if;
    if workout.planned_activity_id is distinct from target_id or workout.planned_activity_occurrence_id is null then
      raise exception 'WORKOUT_SCHEDULE_NEEDS_REVIEW';
    end if;
    select * into occurrence from public.planned_activity_occurrences
    where id = workout.planned_activity_occurrence_id and planned_activity_id = target_id and user_id = owner_id for update;
    if not found then raise exception 'WORKOUT_SCHEDULE_NEEDS_REVIEW'; end if;
    if occurrence.status <> 'planned' or occurrence.first_completed_at is not null then
      raise exception 'WORKOUT_ALREADY_STARTED';
    end if;
    -- A scheduled workout is one instance, never a recurring activity series.
    if edited.activity_type <> 'workout' or edited.recurrence_type <> 'none' or edited.start_date is null then
      raise exception 'WORKOUT_MUST_REMAIN_SINGLE_INSTANCE';
    end if;
    -- Previously broken schedules require explicit review; never infer their dates.
    if activity.start_date <> workout.scheduled_date or occurrence.scheduled_date <> workout.scheduled_date then
      raise exception 'WORKOUT_SCHEDULE_NEEDS_REVIEW';
    end if;
    update public.planned_workouts set scheduled_date = edited.start_date, scheduled_time = edited.scheduled_time
    where id = workout.id and user_id = owner_id;
    update public.planned_activity_occurrences set scheduled_date = edited.start_date, scheduled_time = edited.scheduled_time
    where id = occurrence.id and user_id = owner_id;
  else
    -- Ordinary activity recurrence edits keep completed/skipped history as before.
    delete from public.planned_activity_occurrences
    where planned_activity_id = target_id and user_id = owner_id and status = 'planned' and scheduled_date >= future_from;
  end if;

  update public.planned_activities set
    title = edited.title, description = edited.description, activity_type = edited.activity_type,
    recurrence_type = edited.recurrence_type, start_date = edited.start_date, end_date = edited.end_date,
    scheduled_time = edited.scheduled_time, days_of_week = edited.days_of_week, interval_days = edited.interval_days,
    is_active = edited.is_active, tracking_type = edited.tracking_type, target_value = edited.target_value,
    target_unit = edited.target_unit, minimum_value = edited.minimum_value,
    allow_partial_completion = edited.allow_partial_completion, habit_color = edited.habit_color,
    habit_icon = edited.habit_icon, sort_order = edited.sort_order, recurrence_active_from = edited.recurrence_active_from
  where id = target_id and user_id = owner_id returning * into activity;
  return activity;
end;
$$;
revoke all on function public.update_planned_activity(uuid,jsonb,date) from public, anon;
grant execute on function public.update_planned_activity(uuid,jsonb,date) to authenticated;
