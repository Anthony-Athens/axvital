-- Exercise metadata is stored as lowercase snake_case. Shared exercises have a NULL user_id.
alter table public.exercises add column if not exists normalized_name text;
alter table public.exercises add column if not exists aliases text[] not null default '{}';

update public.exercises
set name = btrim(name),
    normalized_name = lower(regexp_replace(btrim(name), '[^a-zA-Z0-9]+', '', 'g')),
    movement_pattern = nullif(lower(regexp_replace(btrim(movement_pattern), '[ -]+', '_', 'g')), ''),
    equipment = nullif(lower(regexp_replace(btrim(equipment), '[ -]+', '_', 'g')), '')
where normalized_name is null;

update public.exercises set movement_pattern = 'custom'
where movement_pattern is not null and movement_pattern not in ('horizontal_push','horizontal_pull','vertical_push','vertical_pull','squat','hinge','lunge','carry','rotation','anti_rotation','anti_extension','locomotion','isolation','mobility','olympic_lift','custom');
update public.exercises set equipment = 'other'
where equipment is not null and equipment not in ('barbell','dumbbell','kettlebell','machine','cable','band','bodyweight','bench','pull_up_bar','treadmill','bike','rower','sled','stability_ball','other');

alter table public.exercises alter column normalized_name set not null;
alter table public.exercises add constraint exercises_normalized_name_not_blank check (length(normalized_name) > 0);
alter table public.exercises add constraint exercises_movement_pattern_check check (movement_pattern is null or movement_pattern in ('horizontal_push','horizontal_pull','vertical_push','vertical_pull','squat','hinge','lunge','carry','rotation','anti_rotation','anti_extension','locomotion','isolation','mobility','olympic_lift','custom'));
alter table public.exercises add constraint exercises_equipment_check check (equipment is null or equipment in ('barbell','dumbbell','kettlebell','machine','cable','band','bodyweight','bench','pull_up_bar','treadmill','bike','rower','sled','stability_ball','other'));

create or replace function public.set_exercise_normalized_name() returns trigger language plpgsql set search_path = '' as $$
begin
  new.name := btrim(new.name);
  new.normalized_name := lower(regexp_replace(new.name, '[^a-zA-Z0-9]+', '', 'g'));
  return new;
end;
$$;
create trigger exercises_set_normalized_name before insert or update of name on public.exercises for each row execute function public.set_exercise_normalized_name();

create unique index exercises_shared_normalized_name_key on public.exercises (normalized_name) where user_id is null;
create unique index exercises_user_normalized_name_key on public.exercises (user_id, normalized_name) where user_id is not null;
create index exercises_aliases_gin_idx on public.exercises using gin (aliases);

alter table public.exercises enable row level security;
drop policy if exists exercises_select on public.exercises;
drop policy if exists exercises_insert on public.exercises;
drop policy if exists exercises_update on public.exercises;
drop policy if exists exercises_delete on public.exercises;
create policy exercises_select on public.exercises for select to authenticated using (user_id is null or auth.uid() = user_id);
create policy exercises_insert on public.exercises for insert to authenticated with check (auth.uid() = user_id and user_id is not null);
create policy exercises_update on public.exercises for update to authenticated using (auth.uid() = user_id and user_id is not null) with check (auth.uid() = user_id and user_id is not null);
create policy exercises_delete on public.exercises for delete to authenticated using (auth.uid() = user_id and user_id is not null);

comment on column public.exercises.normalized_name is 'Trimmed lowercase exercise name with spaces and punctuation removed; maintained by trigger.';
comment on column public.exercises.aliases is 'Search aliases for shared or user-created exercises.';
