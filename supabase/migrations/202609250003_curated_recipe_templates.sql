begin;
-- Structural reference recipes, not claims about a user's ingredients or portion.
-- No new nutrient values. Missing ingredient servings intentionally remain incomplete.
create temporary table recipe_seeds(slug text,name text,unit text) on commit drop;
insert into recipe_seeds values
 ('turkey-sandwich','Turkey Sandwich','each'),('ham-sandwich','Ham Sandwich','each'),
 ('peanut-butter-sandwich','Peanut Butter Sandwich','each'),('hamburger','Hamburger','each'),
 ('cheeseburger','Cheeseburger','each'),('pepperoni-pizza','Pepperoni Pizza','slice'),('cheese-pizza','Cheese Pizza','slice'),
 ('chicken-burrito','Chicken Burrito','each'),('chicken-tacos','Chicken Tacos','each'),('chicken-salad','Chicken Salad','serving'),
 ('cereal-with-milk','Cereal with Milk','serving'),('oatmeal-with-fruit','Oatmeal with Fruit','serving'),
 ('greek-yogurt-with-berries','Greek Yogurt with Berries','serving'),('eggs-and-toast','Eggs and Toast','serving'),
 ('grilled-chicken-with-rice','Grilled Chicken with Rice','serving');
insert into public.foods(slug,name,source_reference,recipe_unit)
 select s.slug,s.name,'axvital:component-library:v1',s.unit from recipe_seeds s
 where not exists(select 1 from public.foods f where f.slug=s.slug or public.axvital_normalize_food_name(f.name)=public.axvital_normalize_food_name(s.name))
 on conflict(slug) do nothing;
update public.foods f set recipe_unit=s.unit from recipe_seeds s where f.slug=s.slug and f.recipe_unit is null;
insert into public.foods(slug,name,source_reference)
 select 'ham','Ham','axvital:component-library:v1' where not exists(select 1 from public.foods where slug='ham' or public.axvital_normalize_food_name(name)='ham') on conflict(slug) do nothing;
insert into public.food_category_map(food_id,category_id)
 select f.id,c.id from public.foods f cross join public.food_categories c where f.slug='ham' and c.slug='processed_meat' on conflict do nothing;

-- Keep existing generic bread/turkey/cheese references distinct from specific varieties.
-- These portions are reviewable template quantities, never AI estimates of nutrients.
with links(parent,child,quantity,unit) as(values
 ('turkey-sandwich','bread',2::numeric,'slice'),('turkey-sandwich','turkey',4,'oz'),
 ('ham-sandwich','bread',2,'slice'),('ham-sandwich','ham',3,'oz'),
 ('peanut-butter-sandwich','bread',2,'slice'),('peanut-butter-sandwich','peanut-butter',2,'tbsp'),
 ('hamburger','burger-bun',1,'each'),('hamburger','beef-burger-patty-cooked',4,'oz'),
 ('cheeseburger','burger-bun',1,'each'),('cheeseburger','beef-patty',4,'oz'),('cheeseburger','cheese',1,'oz'),
 ('pepperoni-pizza','pizza-crust',null,null),('pepperoni-pizza','cheese',null,null),('pepperoni-pizza','tomato-sauce',null,null),('pepperoni-pizza','pepperoni',null,null),
 ('cheese-pizza','pizza-crust',null,null),('cheese-pizza','cheese',null,null),('cheese-pizza','tomato-sauce',null,null),
 ('chicken-burrito','tortilla',1,'each'),('chicken-burrito','chicken-breast-cooked',4,'oz'),('chicken-burrito','white-rice-cooked',0.5,'cup'),
 ('chicken-tacos','tortilla',1,'each'),('chicken-tacos','chicken-breast-cooked',2,'oz'),
 ('chicken-salad','chicken',4,'oz'),('chicken-salad','mayonnaise',1,'tbsp'),
 ('cereal-with-milk','cereal',1,'cup'),('cereal-with-milk','milk',1,'cup'),
 ('oatmeal-with-fruit','oatmeal',1,'cup'),('oatmeal-with-fruit','blueberries',0.5,'cup'),
 ('greek-yogurt-with-berries','greek-yogurt',1,'cup'),('greek-yogurt-with-berries','berries',0.5,'cup'),
 ('eggs-and-toast','egg',2,'each'),('eggs-and-toast','whole-wheat-bread',2,'slice'),
 ('grilled-chicken-with-rice','chicken-breast-cooked',4,'oz'),('grilled-chicken-with-rice','white-rice-cooked',1,'cup'))
insert into public.food_components(parent_food_id,component_food_id,source,quantity,unit)
 select p.id,c.id,'library',l.quantity,l.unit from links l join public.foods p on p.slug=l.parent join public.foods c on c.slug=l.child
 on conflict(parent_food_id,component_food_id) do update set quantity=excluded.quantity,unit=excluded.unit
 where public.food_components.quantity is null and public.food_components.source='library';

with aliases(slug,alias) as(values
 ('eggs-and-toast','eggs with toast'),
 ('grilled-chicken-with-rice','grilled chicken and rice'))
insert into public.food_aliases(food_id,alias)
 select f.id,a.alias from aliases a join public.foods f on f.slug=a.slug
 where not exists(select 1 from public.food_aliases other where other.normalized_alias=public.axvital_normalize_food_name(a.alias) and other.food_id<>f.id)
 on conflict(food_id,normalized_alias) do nothing;
commit;
