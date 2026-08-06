-- Repair catalogs where foods were present before their serving seed completed.
-- Existing serving rows are preserved; only foods with no serving receive one.
with serving_seed(slug,serving_name,quantity,unit,grams,calories,protein,carbohydrates,fat) as (values
('chicken-breast-cooked','4 oz',4,'oz',113,187,35,0,4),
('chicken-thigh-cooked','4 oz',4,'oz',113,237,28,0,13),
('ground-beef-90','4 oz',4,'oz',113,200,23,0,11),
('ground-turkey','4 oz',4,'oz',113,170,22,0,8),
('salmon','4 oz',4,'oz',113,233,25,0,14),
('tuna','3 oz',3,'oz',85,100,22,0,1),
('egg','1 large',1,'each',50,72,6.3,0.4,4.8),
('egg-whites','3 tbsp',3,'tbsp',46,25,5,0.3,0),
('greek-yogurt','1 cup',1,'cup',227,130,23,9,0),
('cottage-cheese','1 cup',1,'cup',226,206,28,8,9),
('white-rice-cooked','1 cup',1,'cup',158,205,4.3,44.5,0.4),
('brown-rice-cooked','1 cup',1,'cup',195,216,5,44.8,1.8),
('oatmeal','1 cup cooked',1,'cup',234,166,5.9,28.1,3.6),
('quinoa','1 cup cooked',1,'cup',185,222,8.1,39.4,3.6),
('sweet-potato','1 medium',1,'each',130,112,2,26,0.1),
('white-potato','1 medium',1,'each',173,161,4.3,36.6,0.2),
('sourdough-bread','1 slice',1,'slice',50,130,4,25,1),
('whole-wheat-bread','1 slice',1,'slice',43,100,4,19,1.5),
('banana','1 medium',1,'each',118,105,1.3,27,0.4),
('apple','1 medium',1,'each',182,95,0.5,25,0.3),
('blueberries','1 cup',1,'cup',148,84,1.1,21.4,0.5),
('strawberries','1 cup',1,'cup',152,49,1,11.7,0.5),
('avocado','1 medium',1,'each',150,240,3,12.8,22),
('broccoli','1 cup',1,'cup',91,31,2.5,6,0.3),
('spinach','2 cups',2,'cup',60,14,1.7,2.2,0.2),
('mixed-greens','2 cups',2,'cup',85,20,2,4,0),
('carrots','1 cup',1,'cup',128,52,1.2,12.3,0.3),
('olive-oil','1 tbsp',1,'tbsp',14,119,0,0,13.5),
('butter','1 tbsp',1,'tbsp',14,102,0.1,0,11.5),
('peanut-butter','2 tbsp',2,'tbsp',32,190,7,7,16),
('almonds','1 oz',1,'oz',28,164,6,6,14),
('water','8 fl oz',8,'fl oz',237,0,0,0,0),
('coffee','8 fl oz',8,'fl oz',237,2,0.3,0,0),
('milk','1 cup',1,'cup',244,149,7.7,12,8),
('almond-milk','1 cup',1,'cup',240,39,1.5,3.4,2.8),
('whey-protein-powder','1 scoop',1,'scoop',30,120,24,3,2)
)
insert into public.food_servings(
  food_id,serving_name,serving_quantity,serving_unit,grams_equivalent,
  calories,protein_grams,carbohydrate_grams,fat_grams,is_default,display_order
)
select food.id,seed.serving_name,seed.quantity,seed.unit,seed.grams,
  seed.calories,seed.protein,seed.carbohydrates,seed.fat,true,0
from serving_seed seed join public.foods food on food.slug=seed.slug
where not exists(select 1 from public.food_servings serving where serving.food_id=food.id);

-- Normalize catalogs that have servings but no designated default.
with first_serving as (
  select distinct on (food_id) id
  from public.food_servings
  where food_id not in (select food_id from public.food_servings where is_default)
  order by food_id,display_order,id
)
update public.food_servings serving set is_default=true
from first_serving where serving.id=first_serving.id;
