-- Optional operator-run rollback. Roll application code back first and export new
-- input_method / alias / map data before running: those additions will be removed.
-- Existing foods, categories, servings, events and their relationships survive.
-- Retain seeded categories (they may now be referenced) and tightened write grants.
begin;
drop table public.food_category_map;
drop table public.food_aliases;
alter table public.foods drop column normalized_name;
drop function public.axvital_normalize_food_name(text);
alter table public.health_events drop column input_method;
commit;
