-- Curated starter values are approximate and intentionally not marked verified.
with catalog(slug,name,aliases,calories,protein,carbohydrates,fat) as (values
('ground-beef-80-lean-cooked','Ground Beef, 80% Lean, Cooked',array['hamburger','minced beef','beef mince'],307,29,0,21),
('ground-beef-85-lean-cooked','Ground Beef, 85% Lean, Cooked',array['hamburger','minced beef','beef mince'],285,29,0,18),
('ground-beef-90-lean-cooked','Ground Beef, 90% Lean, Cooked',array['hamburger','lean ground beef','beef mince'],254,29,0,15),
('ground-beef-93-lean-cooked','Ground Beef, 93% Lean, Cooked',array['hamburger','lean ground beef','beef mince'],236,30,0,12),
('sirloin-steak-cooked','Sirloin Steak, Cooked',array['sirloin','top sirloin'],233,31,0,11),
('ribeye-steak-cooked','Ribeye Steak, Cooked',array['rib eye','rib steak'],330,27,0,24),
('new-york-strip-steak-cooked','New York Strip Steak, Cooked',array['ny strip','strip steak','striploin'],286,30,0,18),
('filet-mignon-cooked','Filet Mignon, Cooked',array['filet','beef filet','tenderloin steak'],257,30,0,14),
('flank-steak-cooked','Flank Steak, Cooked',array['flank steak'],219,32,0,9),
('skirt-steak-cooked','Skirt Steak, Cooked',array['skirt steak'],269,29,0,17),
('flat-iron-steak-cooked','Flat Iron Steak, Cooked',array['flat iron','top blade steak'],275,29,0,17),
('chuck-roast-cooked','Chuck Roast, Cooked',array['beef chuck','pot roast'],287,29,0,19),
('beef-tenderloin-cooked','Beef Tenderloin, Cooked',array['tenderloin roast'],247,31,0,13),
('london-broil-cooked','London Broil, Cooked',array['london broil','top round steak'],219,31,0,9),
('beef-brisket-cooked','Beef Brisket, Cooked',array['brisket'],323,27,0,23),
('beef-short-ribs-cooked','Beef Short Ribs, Cooked',array['short ribs','beef ribs'],382,25,0,31),
('beef-roast-cooked','Beef Roast, Cooked',array['roast beef'],250,31,0,14),
('beef-stew-meat-cooked','Beef Stew Meat, Cooked',array['stew beef','beef cubes'],240,31,0,12),
('corned-beef-cooked','Corned Beef, Cooked',array['corned beef'],284,21,0,22),
('beef-burger-patty-cooked','Beef Burger Patty, Cooked',array['burger patty','hamburger patty'],287,28,0,20),
('lamb-chop-cooked','Lamb Chop, Cooked',array['lamb chops'],319,28,0,23),
('ground-lamb-cooked','Ground Lamb, Cooked',array['lamb mince','minced lamb'],319,25,0,24),
('pork-tenderloin-cooked','Pork Tenderloin, Cooked',array['pork tenderloin'],187,30,0,6),
('pork-chop-cooked','Pork Chop, Cooked',array['pork chops'],231,30,0,12),
('pork-loin-cooked','Pork Loin, Cooked',array['pork loin roast'],220,31,0,10),
('ground-pork-cooked','Ground Pork, Cooked',array['pork mince','minced pork'],297,27,0,21),
('ground-bison-cooked','Bison, Ground, Cooked',array['buffalo','bison burger','ground bison'],229,29,0,12),
('venison-cooked','Venison, Cooked',array['deer meat','deer'],180,34,0,4)
),
upserted as (
  insert into public.foods(category_id,slug,name,common_aliases,source_type,is_verified,is_active)
  select category.id,catalog.slug,catalog.name,catalog.aliases,'curated',false,true
  from catalog join public.food_categories category on category.slug='protein'
  on conflict(slug) do update set
    category_id=excluded.category_id,name=excluded.name,common_aliases=excluded.common_aliases,
    source_type='curated',is_verified=false,is_active=true
  returning id,slug
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
  where existing.food_id=food.id and existing.serving_quantity=4 and lower(existing.serving_unit)='oz'
);
