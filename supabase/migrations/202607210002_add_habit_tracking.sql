alter table public.planned_activities
  add column tracking_type text not null default 'binary',
  add column target_value numeric,
  add column target_unit text,
  add column minimum_value numeric,
  add column allow_partial_completion boolean not null default false,
  add column habit_color text,
  add column habit_icon text,
  add column sort_order integer,
  add column paused_at timestamptz,
  add column reactivated_at timestamptz,
  add column recurrence_active_from date,
  add constraint planned_activities_tracking_type check (tracking_type in ('binary','quantity','duration')),
  add constraint planned_activities_target_positive check (target_value is null or target_value > 0),
  add constraint planned_activities_minimum_nonnegative check (minimum_value is null or minimum_value >= 0),
  add constraint planned_activities_minimum_within_target check (minimum_value is null or target_value is null or minimum_value <= target_value),
  add constraint planned_activities_measurable_target check (tracking_type = 'binary' or target_value is not null),
  add constraint planned_activities_duration_unit check (
    tracking_type <> 'duration' or (target_unit is not null and target_unit = 'minutes')
  );

comment on column public.planned_activities.recurrence_active_from is
  'Date-only lower bound for occurrence generation after reactivation; prevents backfilling paused periods.';
comment on column public.planned_activities.target_unit is
  'Duration is stored internally in minutes. Quantity units are user-facing text.';

alter table public.planned_activity_occurrences
  add column actual_value numeric,
  add column completion_percentage numeric,
  add column completion_note text,
  add column first_completed_at timestamptz,
  add column last_updated_at timestamptz,
  add constraint planned_activity_occurrences_actual_nonnegative check (actual_value is null or actual_value >= 0),
  add constraint planned_activity_occurrences_percentage_nonnegative check (completion_percentage is null or completion_percentage >= 0);

create index planned_activities_habit_user_sort_idx
  on public.planned_activities (user_id, is_active, sort_order, scheduled_time)
  where activity_type = 'habit';
create index planned_activity_occurrences_habit_analytics_idx
  on public.planned_activity_occurrences (planned_activity_id, scheduled_date, status);
