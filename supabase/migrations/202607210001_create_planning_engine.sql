create table public.planned_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) > 0),
  description text,
  activity_type text not null check (activity_type in ('habit','workout','supplement','medication','nutrition','hydration','mobility','recovery','cardio','rehab','mindfulness','custom')),
  recurrence_type text not null check (recurrence_type in ('none','daily','weekdays','specific_days','weekly','interval')),
  start_date date not null,
  end_date date,
  scheduled_time time,
  days_of_week integer[],
  interval_days integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_activities_date_range check (end_date is null or end_date >= start_date),
  constraint planned_activities_specific_days check (
    recurrence_type <> 'specific_days' or
    (days_of_week is not null and cardinality(days_of_week) > 0 and days_of_week <@ array[0,1,2,3,4,5,6])
  ),
  constraint planned_activities_interval check (
    recurrence_type <> 'interval' or (interval_days is not null and interval_days > 0)
  ),
  constraint planned_activities_user_identity unique (id, user_id)
);

comment on column public.planned_activities.days_of_week is
  'Weekday convention: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday.';

create table public.planned_activity_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_activity_id uuid not null,
  scheduled_date date not null,
  scheduled_time time,
  status text not null default 'planned' check (status in ('planned','completed','skipped')),
  completed_at timestamptz,
  skipped_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_activity_occurrences_activity_user_fkey
    foreign key (planned_activity_id, user_id)
    references public.planned_activities(id, user_id) on delete cascade,
  constraint planned_activity_occurrences_unique_date unique (planned_activity_id, scheduled_date),
  constraint planned_activity_occurrences_status_timestamps check (
    (status = 'planned' and completed_at is null and skipped_at is null) or
    (status = 'completed' and completed_at is not null and skipped_at is null) or
    (status = 'skipped' and skipped_at is not null and completed_at is null)
  )
);

create index planned_activities_active_user_idx
  on public.planned_activities (user_id, is_active) where is_active;
create index planned_activity_occurrences_user_date_idx
  on public.planned_activity_occurrences (user_id, scheduled_date);
create index planned_activity_occurrences_activity_idx
  on public.planned_activity_occurrences (planned_activity_id);
create index planned_activity_occurrences_status_idx
  on public.planned_activity_occurrences (status);

create function public.axvital_planning_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger planned_activities_set_updated_at
before update on public.planned_activities
for each row execute function public.axvital_planning_set_updated_at();

create trigger planned_activity_occurrences_set_updated_at
before update on public.planned_activity_occurrences
for each row execute function public.axvital_planning_set_updated_at();

alter table public.planned_activities enable row level security;
alter table public.planned_activity_occurrences enable row level security;

create policy "Users select own planned activities" on public.planned_activities for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own planned activities" on public.planned_activities for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own planned activities" on public.planned_activities for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own planned activities" on public.planned_activities for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users select own planned occurrences" on public.planned_activity_occurrences for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own planned occurrences" on public.planned_activity_occurrences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own planned occurrences" on public.planned_activity_occurrences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own planned occurrences" on public.planned_activity_occurrences for delete to authenticated using ((select auth.uid()) = user_id);
