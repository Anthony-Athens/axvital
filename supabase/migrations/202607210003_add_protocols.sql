create table public.protocol_templates (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0), description text, goal text,
  duration_days integer check (duration_days is null or duration_days > 0),
  category text not null default 'custom' check (category in ('sleep','strength','cardio','mobility','recovery','nutrition','hydration','supplement','mindfulness','rehab','weight_management','performance','custom')),
  difficulty text check (difficulty is null or difficulty in ('beginner','intermediate','advanced','custom')),
  is_active boolean not null default true, is_archived boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.protocol_template_activities (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  protocol_template_id uuid not null, title text not null check (char_length(btrim(title)) > 0), description text,
  activity_type text not null check (activity_type in ('habit','workout','supplement','medication','nutrition','hydration','mobility','recovery','cardio','rehab','mindfulness','custom')),
  tracking_type text not null default 'binary' check (tracking_type in ('binary','quantity','duration')),
  target_value numeric check (target_value is null or target_value > 0), target_unit text,
  minimum_value numeric check (minimum_value is null or minimum_value >= 0), allow_partial_completion boolean not null default false,
  schedule_type text not null check (schedule_type in ('daily','weekdays','specific_days','weekly','interval','day_offset')),
  days_of_week integer[], interval_days integer, day_offset integer, scheduled_time time, sort_order integer,
  is_required boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint protocol_template_activities_template_user_fkey foreign key (protocol_template_id,user_id) references public.protocol_templates(id,user_id) on delete cascade,
  constraint protocol_template_activities_specific_days check (schedule_type <> 'specific_days' or (days_of_week is not null and cardinality(days_of_week) > 0 and days_of_week <@ array[0,1,2,3,4,5,6])),
  constraint protocol_template_activities_weekly_day check (schedule_type <> 'weekly' or (days_of_week is not null and cardinality(days_of_week) = 1 and days_of_week <@ array[0,1,2,3,4,5,6])),
  constraint protocol_template_activities_interval check (schedule_type <> 'interval' or (interval_days is not null and interval_days > 0)),
  constraint protocol_template_activities_offset check (schedule_type <> 'day_offset' or (day_offset is not null and day_offset >= 0)),
  constraint protocol_template_activities_target check (tracking_type = 'binary' or target_value is not null),
  constraint protocol_template_activities_minimum check (minimum_value is null or (target_value is not null and minimum_value <= target_value)),
  constraint protocol_template_activities_duration_unit check (tracking_type <> 'duration' or (target_unit is not null and target_unit = 'minutes')),
  unique (id,user_id)
);
comment on column public.protocol_template_activities.days_of_week is '0=Sunday through 6=Saturday. Weekly requires exactly one weekday.';
comment on column public.protocol_template_activities.day_offset is 'Zero-based relative protocol day: 0=start date, 6=Day 7.';

create table public.user_protocols (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  protocol_template_id uuid,
  name text not null check (char_length(btrim(name)) > 0), description text, goal text,
  category text not null default 'custom' check (category in ('sleep','strength','cardio','mobility','recovery','nutrition','hydration','supplement','mindfulness','rehab','weight_management','performance','custom')),
  start_date date not null, end_date date, status text not null default 'draft' check (status in ('draft','active','paused','completed','cancelled')),
  activated_at timestamptz, paused_at timestamptz, completed_at timestamptz, cancelled_at timestamptz, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint user_protocols_template_user_fkey foreign key (protocol_template_id,user_id) references public.protocol_templates(id,user_id) on delete set null (protocol_template_id),
  constraint user_protocols_date_range check (end_date is null or end_date >= start_date), unique (id,user_id)
);

create table public.protocol_pause_periods (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  user_protocol_id uuid not null, paused_on date not null, resumed_on date,
  paused_at timestamptz not null default now(), resumed_at timestamptz,
  constraint protocol_pause_periods_protocol_user_fkey foreign key (user_protocol_id,user_id) references public.user_protocols(id,user_id) on delete cascade,
  constraint protocol_pause_periods_range check (resumed_on is null or resumed_on >= paused_on), unique (id,user_id)
);

alter table public.planned_activities add column user_protocol_id uuid;
alter table public.planned_activities add constraint planned_activities_protocol_user_fkey
  foreign key (user_protocol_id,user_id) references public.user_protocols(id,user_id) on delete cascade;

create table public.user_protocol_activities (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  user_protocol_id uuid not null, protocol_template_activity_id uuid,
  planned_activity_id uuid not null, is_required boolean not null default true, sort_order integer,
  created_at timestamptz not null default now(),
  constraint user_protocol_activities_protocol_user_fkey foreign key (user_protocol_id,user_id) references public.user_protocols(id,user_id) on delete cascade,
  constraint user_protocol_activities_template_activity_user_fkey foreign key (protocol_template_activity_id,user_id) references public.protocol_template_activities(id,user_id) on delete set null (protocol_template_activity_id),
  constraint user_protocol_activities_planned_activity_user_fkey foreign key (planned_activity_id,user_id) references public.planned_activities(id,user_id) on delete cascade,
  unique (user_protocol_id,planned_activity_id), unique (id,user_id)
);

create index protocol_templates_user_archived_idx on public.protocol_templates(user_id,is_archived);
create index protocol_template_activities_template_sort_idx on public.protocol_template_activities(protocol_template_id,sort_order);
create index user_protocols_user_status_idx on public.user_protocols(user_id,status);
create index user_protocols_user_start_idx on public.user_protocols(user_id,start_date);
create index user_protocol_activities_protocol_idx on public.user_protocol_activities(user_protocol_id);
create index planned_activities_protocol_idx on public.planned_activities(user_protocol_id);
create index protocol_pause_periods_protocol_idx on public.protocol_pause_periods(user_protocol_id,paused_on);

create trigger protocol_templates_set_updated_at before update on public.protocol_templates for each row execute function public.axvital_planning_set_updated_at();
create trigger protocol_template_activities_set_updated_at before update on public.protocol_template_activities for each row execute function public.axvital_planning_set_updated_at();
create trigger user_protocols_set_updated_at before update on public.user_protocols for each row execute function public.axvital_planning_set_updated_at();

alter table public.protocol_templates enable row level security; alter table public.protocol_template_activities enable row level security;
alter table public.user_protocols enable row level security; alter table public.user_protocol_activities enable row level security;
alter table public.protocol_pause_periods enable row level security;

create policy "Users select own protocol templates" on public.protocol_templates for select to authenticated using ((select auth.uid())=user_id);
create policy "Users insert own protocol templates" on public.protocol_templates for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Users update own protocol templates" on public.protocol_templates for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Users delete own protocol templates" on public.protocol_templates for delete to authenticated using ((select auth.uid())=user_id);
create policy "Users select own protocol template activities" on public.protocol_template_activities for select to authenticated using ((select auth.uid())=user_id);
create policy "Users insert own protocol template activities" on public.protocol_template_activities for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Users update own protocol template activities" on public.protocol_template_activities for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Users delete own protocol template activities" on public.protocol_template_activities for delete to authenticated using ((select auth.uid())=user_id);
create policy "Users select own protocols" on public.user_protocols for select to authenticated using ((select auth.uid())=user_id);
create policy "Users insert own protocols" on public.user_protocols for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Users update own protocols" on public.user_protocols for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Users delete own protocols" on public.user_protocols for delete to authenticated using ((select auth.uid())=user_id);
create policy "Users select own protocol activity links" on public.user_protocol_activities for select to authenticated using ((select auth.uid())=user_id);
create policy "Users insert own protocol activity links" on public.user_protocol_activities for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Users update own protocol activity links" on public.user_protocol_activities for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Users delete own protocol activity links" on public.user_protocol_activities for delete to authenticated using ((select auth.uid())=user_id);
create policy "Users select own protocol pauses" on public.protocol_pause_periods for select to authenticated using ((select auth.uid())=user_id);
create policy "Users insert own protocol pauses" on public.protocol_pause_periods for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Users update own protocol pauses" on public.protocol_pause_periods for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Users delete own protocol pauses" on public.protocol_pause_periods for delete to authenticated using ((select auth.uid())=user_id);
