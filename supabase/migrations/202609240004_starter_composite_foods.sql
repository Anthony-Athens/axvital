begin;
-- Reference-only foods have no invented servings or nutrients. Manual nutrition continues to use its serving-backed library.
create temporary table starter_foods(slug text,name text,category text) on commit drop;
insert into starter_foods values
 ('pepperoni-pizza','Pepperoni Pizza',null),('cheese-pizza','Cheese Pizza',null),
 ('turkey-sandwich','Turkey Sandwich',null),('cheeseburger','Cheeseburger',null),
 ('peanut-butter-sandwich','Peanut Butter Sandwich',null),('greek-yogurt-with-berries','Greek Yogurt with Berries',null),
 ('salad-with-chicken','Salad with Chicken',null),('tacos','Tacos',null),('cereal-with-milk','Cereal with Milk',null),
 ('pizza-crust','Pizza Crust','grains'),('cheese','Cheese','dairy'),('tomato-sauce','Tomato Sauce','vegetables'),
 ('pepperoni','Pepperoni','processed_meat'),('bread','Bread','grains'),('turkey','Turkey','poultry'),
 ('mayonnaise','Mayonnaise','condiments'),('lettuce','Lettuce','vegetables'),('beef-patty','Beef Patty','beef'),
 ('burger-bun','Burger Bun','grains'),('berries','Berries','fruits'),('chicken','Chicken','poultry'),
 ('tortilla','Tortilla','grains'),('cereal','Cereal','grains'),('coca-cola-zero-sugar','Coca-Cola Zero Sugar','beverages');
insert into public.foods(slug,name,source_reference)
 select s.slug,s.name,'axvital:component-library:v1' from starter_foods s
 where not exists(select 1 from public.foods f where public.axvital_normalize_food_name(regexp_replace(f.name,'[-,]',' ','g'))=public.axvital_normalize_food_name(regexp_replace(s.name,'[-,]',' ','g')))
 on conflict(slug) do nothing;
insert into public.food_category_map(food_id,category_id)
 select f.id,c.id from starter_foods s join public.foods f on f.slug=s.slug join public.food_categories c on c.slug=s.category on conflict do nothing;
insert into public.food_category_map(food_id,category_id)
 select f.id,c.id from public.foods f cross join public.food_categories c where f.slug='coca-cola-zero-sugar' and c.slug='artificial_sweetener' on conflict do nothing;
with aliases(slug,alias) as(values
 ('coca-cola-zero-sugar','coke zero'),('coca-cola-zero-sugar','coca cola zero'),('coca-cola-zero-sugar','coca-cola zero sugar'),
 ('mayonnaise','mayo'),('pizza-crust','crust'),('berries','mixed berries'),('burger-bun','bun'))
insert into public.food_aliases(food_id,alias) select f.id,a.alias from aliases a join public.foods f on f.slug=a.slug on conflict(food_id,normalized_alias) do nothing;
-- Typical structural components, never proof of intake. Optional sauces/toppings omitted.
with links(parent,child) as(values
 ('pepperoni-pizza','pizza-crust'),('pepperoni-pizza','cheese'),('pepperoni-pizza','tomato-sauce'),('pepperoni-pizza','pepperoni'),
 ('cheese-pizza','pizza-crust'),('cheese-pizza','cheese'),('cheese-pizza','tomato-sauce'),
 ('turkey-sandwich','bread'),('turkey-sandwich','turkey'),
 ('cheeseburger','burger-bun'),('cheeseburger','beef-patty'),('cheeseburger','cheese'),
 ('peanut-butter-sandwich','bread'),('peanut-butter-sandwich','peanut-butter'),
 ('greek-yogurt-with-berries','greek-yogurt'),('greek-yogurt-with-berries','berries'),
 ('salad-with-chicken','mixed-greens'),('salad-with-chicken','chicken'),
 ('tacos','tortilla'),('cereal-with-milk','cereal'),('cereal-with-milk','milk'))
insert into public.food_components(parent_food_id,component_food_id,source)
 select p.id,c.id,'library' from links l join public.foods p on p.slug=l.parent join public.foods c on c.slug=l.child on conflict do nothing;
commit;
