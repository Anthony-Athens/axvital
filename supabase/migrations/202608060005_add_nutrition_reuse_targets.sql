create table public.user_food_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  is_favorite boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, food_id)
);

create table public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(char_length(btrim(name)) between 2 and 120),
  description text check(description is null or char_length(description) <= 1000),
  default_meal_type text check(default_meal_type in ('breakfast','lunch','dinner','snack','pre_workout','post_workout','other')),
  is_favorite boolean not null default false,
  is_active boolean not null default true,
  last_logged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.saved_meal_items (
  id uuid primary key default gen_random_uuid(),
  saved_meal_id uuid not null references public.saved_meals(id) on delete cascade,
  food_id uuid references public.foods(id) on delete cascade,
  food_serving_id uuid references public.food_servings(id) on delete cascade,
  user_food_id uuid references public.user_foods(id) on delete cascade,
  quantity_multiplier numeric not null default 1 check(quantity_multiplier > 0),
  display_order integer not null default 0 check(display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (food_id is not null and food_serving_id is not null and user_food_id is null)
    or (food_id is null and food_serving_id is null and user_food_id is not null)
  )
);

create table public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check(target_type in ('calories','protein','carbohydrates','fat','fiber','caffeine_maximum','alcohol_maximum')),
  target_value numeric not null check(target_value > 0),
  unit text not null,
  source_type text not null default 'user' check(source_type in ('user','protocol','experiment','imported','other')),
  source_label text,
  source_record_id uuid,
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  priority integer not null default 0,
  notes text check(notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check(ends_on is null or starts_on is null or ends_on >= starts_on),
  check(
    (target_type = 'calories' and unit = 'kcal')
    or (target_type in ('protein','carbohydrates','fat','fiber','alcohol_maximum') and unit = 'g')
    or (target_type = 'caffeine_maximum' and unit = 'mg')
  )
);

alter table public.nutrition_entries
  add column saved_meal_id uuid references public.saved_meals(id) on delete set null;
alter table public.nutrition_entries drop constraint nutrition_entries_meal_type_check;
alter table public.nutrition_entries add constraint nutrition_entries_meal_type_check
  check(meal_type in ('breakfast','lunch','dinner','snack','pre_workout','post_workout','other'));

create index user_food_preferences_user_favorite_idx on public.user_food_preferences(user_id) where is_favorite;
create index saved_meals_user_active_recent_idx on public.saved_meals(user_id, is_active, last_logged_at desc);
create index saved_meal_items_meal_order_idx on public.saved_meal_items(saved_meal_id, display_order);
create index saved_meal_items_food_idx on public.saved_meal_items(food_id) where food_id is not null;
create index saved_meal_items_user_food_idx on public.saved_meal_items(user_food_id) where user_food_id is not null;
create index nutrition_targets_resolution_idx on public.nutrition_targets(user_id, target_type, priority desc, created_at desc)
  where is_active and archived_at is null;
create index nutrition_entries_saved_meal_idx on public.nutrition_entries(saved_meal_id) where saved_meal_id is not null;

do $$ declare table_name text; begin
  foreach table_name in array array['user_food_preferences','saved_meals','saved_meal_items','nutrition_targets'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.axvital_planning_set_updated_at()', table_name || '_set_updated_at', table_name);
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

create policy "Users manage own food preferences" on public.user_food_preferences for all to authenticated
  using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));
create policy "Users manage own saved meals" on public.saved_meals for all to authenticated
  using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));
create policy "Users manage items in own saved meals" on public.saved_meal_items for all to authenticated
  using(exists(select 1 from public.saved_meals meal where meal.id = saved_meal_id and meal.user_id = (select auth.uid())))
  with check(
    exists(select 1 from public.saved_meals meal where meal.id = saved_meal_id and meal.user_id = (select auth.uid()))
    and (user_food_id is null or exists(select 1 from public.user_foods food where food.id = user_food_id and food.user_id = (select auth.uid())))
    and (food_serving_id is null or exists(select 1 from public.food_servings serving where serving.id = food_serving_id and serving.food_id = food_id))
  );
create policy "Users manage own nutrition targets" on public.nutrition_targets for all to authenticated
  using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));

create function public.log_saved_meal_atomic(
  selected_saved_meal_id uuid,
  consumed timestamptz,
  meal_override text default null,
  title_override text default null,
  note text default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  entry_id uuid;
  meal_record record;
  component record;
  component_count integer := 0;
begin
  select * into meal_record from public.saved_meals
  where id = selected_saved_meal_id and user_id = current_user_id and is_active and archived_at is null
  for update;
  if meal_record.id is null then raise exception 'Saved meal not found'; end if;

  insert into public.nutrition_entries(user_id, entry_type, meal_type, title, consumed_at, source_type, notes, saved_meal_id)
  values(current_user_id, 'meal', coalesce(meal_override, meal_record.default_meal_type), coalesce(nullif(btrim(title_override),''), meal_record.name), consumed, 'manual', note, meal_record.id)
  returning id into entry_id;

  for component in
    select item.*, coalesce(food.name, user_food.name) source_name,
      coalesce(food.brand_name, user_food.brand_name) source_brand_name,
      coalesce(serving.serving_name, user_food.serving_name) serving_name,
      coalesce(serving.serving_quantity, user_food.serving_quantity) serving_quantity,
      coalesce(serving.serving_unit, user_food.serving_unit) serving_unit,
      coalesce(serving.grams_equivalent, user_food.grams_equivalent) grams,
      coalesce(serving.calories, user_food.calories) calories_value,
      coalesce(serving.protein_grams, user_food.protein_grams) protein_value,
      coalesce(serving.carbohydrate_grams, user_food.carbohydrate_grams) carbohydrate_value,
      coalesce(serving.fat_grams, user_food.fat_grams) fat_value,
      coalesce(serving.fiber_grams, user_food.fiber_grams) fiber_value,
      coalesce(serving.sugar_grams, user_food.sugar_grams) sugar_value,
      coalesce(serving.sodium_mg, user_food.sodium_mg) sodium_value,
      coalesce(serving.caffeine_mg, user_food.caffeine_mg) caffeine_value,
      coalesce(serving.alcohol_grams, user_food.alcohol_grams) alcohol_value
    from public.saved_meal_items item
    left join public.foods food on food.id = item.food_id and food.is_active
    left join public.food_servings serving on serving.id = item.food_serving_id and serving.food_id = item.food_id
    left join public.user_foods user_food on user_food.id = item.user_food_id and user_food.user_id = current_user_id
    where item.saved_meal_id = meal_record.id order by item.display_order
  loop
    if component.source_name is null then raise exception 'Saved meal contains an unavailable food'; end if;
    component_count := component_count + 1;
    insert into public.nutrition_entry_items(
      nutrition_entry_id,food_id,food_serving_id,user_food_id,source_name,source_brand_name,
      serving_name_snapshot,serving_quantity_snapshot,serving_unit_snapshot,quantity_multiplier,
      grams_consumed,calories,protein_grams,carbohydrate_grams,fat_grams,fiber_grams,sugar_grams,sodium_mg,caffeine_mg,alcohol_grams
    ) values(
      entry_id,component.food_id,component.food_serving_id,component.user_food_id,component.source_name,component.source_brand_name,
      component.serving_name,component.serving_quantity,component.serving_unit,component.quantity_multiplier,
      component.grams * component.quantity_multiplier,component.calories_value * component.quantity_multiplier,
      component.protein_value * component.quantity_multiplier,component.carbohydrate_value * component.quantity_multiplier,
      component.fat_value * component.quantity_multiplier,component.fiber_value * component.quantity_multiplier,
      component.sugar_value * component.quantity_multiplier,component.sodium_value * component.quantity_multiplier,
      component.caffeine_value * component.quantity_multiplier,component.alcohol_value * component.quantity_multiplier
    );
  end loop;
  if component_count = 0 then raise exception 'Saved meal has no items'; end if;
  update public.saved_meals set last_logged_at = consumed where id = meal_record.id;
  return entry_id;
end $$;
grant execute on function public.log_saved_meal_atomic(uuid,timestamptz,text,text,text) to authenticated;

create function public.resolve_nutrition_targets(effective_on date default current_date)
returns setof public.nutrition_targets language sql stable security invoker set search_path = ''
as $$
  select distinct on (target_type) target.*
  from public.nutrition_targets target
  where target.user_id = (select auth.uid()) and target.is_active and target.archived_at is null
    and target.source_type = 'user'
    and (target.starts_on is null or target.starts_on <= effective_on)
    and (target.ends_on is null or target.ends_on >= effective_on)
  order by target_type, target.priority desc, target.created_at desc
$$;
grant execute on function public.resolve_nutrition_targets(date) to authenticated;
