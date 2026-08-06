-- The original food upsert and serving insert shared a statement snapshot.
-- Resolve the now-persisted foods by slug in this later migration.
with catalog(slug,calories,protein,carbohydrates,fat) as (values
('ground-beef-80-lean-cooked',307,29,0,21),
('ground-beef-85-lean-cooked',285,29,0,18),
('ground-beef-90-lean-cooked',254,29,0,15),
('ground-beef-93-lean-cooked',236,30,0,12),
('sirloin-steak-cooked',233,31,0,11),
('ribeye-steak-cooked',330,27,0,24),
('new-york-strip-steak-cooked',286,30,0,18),
('filet-mignon-cooked',257,30,0,14),
('flank-steak-cooked',219,32,0,9),
('skirt-steak-cooked',269,29,0,17),
('flat-iron-steak-cooked',275,29,0,17),
('chuck-roast-cooked',287,29,0,19),
('beef-tenderloin-cooked',247,31,0,13),
('london-broil-cooked',219,31,0,9),
('beef-brisket-cooked',323,27,0,23),
('beef-short-ribs-cooked',382,25,0,31),
('beef-roast-cooked',250,31,0,14),
('beef-stew-meat-cooked',240,31,0,12),
('corned-beef-cooked',284,21,0,22),
('beef-burger-patty-cooked',287,28,0,20),
('lamb-chop-cooked',319,28,0,23),
('ground-lamb-cooked',319,25,0,24),
('pork-tenderloin-cooked',187,30,0,6),
('pork-chop-cooked',231,30,0,12),
('pork-loin-cooked',220,31,0,10),
('ground-pork-cooked',297,27,0,21),
('ground-bison-cooked',229,29,0,12),
('venison-cooked',180,34,0,4)
)
insert into public.food_servings(
  food_id,serving_name,serving_quantity,serving_unit,grams_equivalent,
  calories,protein_grams,carbohydrate_grams,fat_grams,is_default,display_order
)
select food.id,'4 oz',4,'oz',113,catalog.calories,catalog.protein,catalog.carbohydrates,catalog.fat,
  not exists(select 1 from public.food_servings existing where existing.food_id=food.id and existing.is_default),0
from catalog join public.foods food on food.slug=catalog.slug
where not exists(
  select 1 from public.food_servings existing
  where existing.food_id=food.id
    and existing.serving_quantity=4
    and lower(existing.serving_unit)='oz'
);

-- If an equivalent serving predated this repair but no default existed, choose
-- the deterministic first serving without disturbing an existing default.
with affected as (
  select food.id
  from public.foods food
  where food.slug in (
    'ground-beef-80-lean-cooked','ground-beef-85-lean-cooked','ground-beef-90-lean-cooked','ground-beef-93-lean-cooked',
    'sirloin-steak-cooked','ribeye-steak-cooked','new-york-strip-steak-cooked','filet-mignon-cooked',
    'flank-steak-cooked','skirt-steak-cooked','flat-iron-steak-cooked','chuck-roast-cooked',
    'beef-tenderloin-cooked','london-broil-cooked','beef-brisket-cooked','beef-short-ribs-cooked',
    'beef-roast-cooked','beef-stew-meat-cooked','corned-beef-cooked','beef-burger-patty-cooked',
    'lamb-chop-cooked','ground-lamb-cooked','pork-tenderloin-cooked','pork-chop-cooked',
    'pork-loin-cooked','ground-pork-cooked','ground-bison-cooked','venison-cooked'
  )
),
first_serving as (
  select distinct on (serving.food_id) serving.id
  from public.food_servings serving join affected on affected.id=serving.food_id
  where not exists(
    select 1 from public.food_servings current_default
    where current_default.food_id=serving.food_id and current_default.is_default
  )
  order by serving.food_id,serving.display_order,serving.created_at,serving.id
)
update public.food_servings serving set is_default=true
from first_serving where serving.id=first_serving.id;
