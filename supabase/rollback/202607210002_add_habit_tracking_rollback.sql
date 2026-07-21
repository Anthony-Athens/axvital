drop index if exists public.planned_activity_occurrences_habit_analytics_idx;
drop index if exists public.planned_activities_habit_user_sort_idx;
alter table public.planned_activity_occurrences
  drop column if exists last_updated_at,
  drop column if exists first_completed_at,
  drop column if exists completion_note,
  drop column if exists completion_percentage,
  drop column if exists actual_value;
alter table public.planned_activities
  drop column if exists recurrence_active_from,
  drop column if exists reactivated_at,
  drop column if exists paused_at,
  drop column if exists sort_order,
  drop column if exists habit_icon,
  drop column if exists habit_color,
  drop column if exists allow_partial_completion,
  drop column if exists minimum_value,
  drop column if exists target_unit,
  drop column if exists target_value,
  drop column if exists tracking_type;
