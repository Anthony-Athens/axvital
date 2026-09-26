begin;
create table if not exists public.food_external_sources (
 source_provider text not null check(source_provider='usda_fdc'), external_id bigint not null check(external_id>0),
 food_id uuid not null references public.foods(id) on delete cascade,
 external_data_type text not null check(external_data_type in ('Foundation','Survey (FNDDS)','SR Legacy')),
 source_description text not null, source_category text, source_updated_at timestamptz,
 per_100g jsonb not null, content_hash text not null,
 imported_at timestamptz not null default now(), last_refreshed_at timestamptz not null default now(),
 primary key(source_provider,external_id)
);
alter table public.food_external_sources enable row level security;
revoke all on public.food_external_sources from public,anon,authenticated;
grant select on public.food_external_sources to authenticated;
grant all on public.food_external_sources to service_role;
drop policy if exists visible_external_food on public.food_external_sources;
create policy visible_external_food on public.food_external_sources for select to authenticated using(exists(select 1 from public.foods f where f.id=food_id and f.is_active));
alter table public.food_servings add column if not exists source_provider text,
 add column if not exists source_external_id bigint, add column if not exists source_portion_key text,
 add column if not exists source_retired boolean not null default false;
create unique index if not exists food_servings_external_unique on public.food_servings(food_id,source_provider,source_external_id,source_portion_key) where source_provider is not null;
grant select,insert,update on public.foods,public.food_servings,public.food_aliases,public.food_category_map to service_role;
grant select on public.food_categories,public.food_components to service_role;

-- Explicit administrative import only. User-facing logging never calls this function.
create or replace function public.import_fdc_food(payload jsonb,target_food_id uuid default null,refresh boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f uuid; prior public.food_external_sources; existing public.foods; s jsonb; k text; v numeric; sid uuid; imported integer:=0; source_only boolean; ext bigint; digest text;
begin
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>250000 then raise exception 'FDC_INVALID_IMPORT'; end if;
 ext:=(payload->>'external_id')::bigint;
 if ext is null or ext<=0 or payload->>'data_type' not in ('Foundation','Survey (FNDDS)','SR Legacy') or payload->>'data_type' is null
 or char_length(coalesce(payload->>'description','')) not between 1 and 300
 or char_length(coalesce(payload->>'name','')) not between 2 and 160
 or coalesce(payload->>'slug','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
 or jsonb_typeof(payload->'basis') is distinct from 'object' or jsonb_typeof(payload->'servings') is distinct from 'array'
 or jsonb_typeof(payload->'categories') is distinct from 'array' then raise exception 'FDC_INVALID_IMPORT'; end if;
 if jsonb_array_length(payload->'servings') not between 1 and 201 or jsonb_array_length(payload->'categories')>12 then raise exception 'FDC_INVALID_IMPORT'; end if;
 foreach k in array array['calories','protein_grams','carbohydrate_grams','fat_grams'] loop
  v:=(payload->'basis'->>k)::numeric;
  if v is null or v<0 or v>100000 or v::text in ('NaN','Infinity') then raise exception 'FDC_MISSING_MACROS'; end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('usda_fdc:'||ext::text,0));
 select * into prior from public.food_external_sources where source_provider='usda_fdc' and external_id=ext for update;
 if prior.food_id is not null then
  if target_food_id is not null and target_food_id<>prior.food_id then raise exception 'FDC_ID_CONFLICT'; end if;
  f:=prior.food_id;
 else f:=target_food_id; end if;
 if f is not null then
  select * into existing from public.foods where id=f for update;
  if existing.id is null or existing.slug is distinct from payload->>'slug' or existing.name is distinct from payload->>'name' or existing.recipe_unit is not null then raise exception 'FDC_CANONICAL_CONFLICT'; end if;
  if prior.food_id is not null and not refresh then return jsonb_build_object('food_id',prior.food_id,'status','unchanged','servings_added',0); end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('food_name:'||public.axvital_normalize_food_name(payload->>'name'),0));
  if exists(select 1 from public.foods where slug=payload->>'slug' or public.axvital_normalize_food_name(name)=public.axvital_normalize_food_name(payload->>'name') or exists(select 1 from unnest(common_aliases) a where public.axvital_normalize_food_name(a)=public.axvital_normalize_food_name(payload->>'name')))
   or exists(select 1 from public.food_aliases where normalized_alias=public.axvital_normalize_food_name(payload->>'name')) then raise exception 'FDC_CANONICAL_CONFLICT'; end if;
  insert into public.foods(name,slug,source_type,source_reference)
   values(payload->>'name',payload->>'slug','external_provider','https://fdc.nal.usda.gov/food-details/'||ext::text||'/nutrients') returning id into f;
 end if;
 -- Existing curated serving values and defaults are never overwritten or displaced.
 source_only:=exists(select 1 from public.food_servings where food_id=f and source_provider is null);
 digest:=md5((payload->'basis')::text||(payload->'servings')::text);
 insert into public.food_external_sources(source_provider,external_id,food_id,external_data_type,source_description,source_category,source_updated_at,per_100g,content_hash)
 values('usda_fdc',ext,f,payload->>'data_type',payload->>'description',payload->>'source_category',(payload->>'source_updated_at')::timestamptz,payload->'basis',digest)
 on conflict(source_provider,external_id) do update set external_data_type=excluded.external_data_type,source_description=excluded.source_description,source_category=excluded.source_category,source_updated_at=excluded.source_updated_at,per_100g=excluded.per_100g,content_hash=excluded.content_hash,last_refreshed_at=now();
 if not source_only then
  if exists(select 1 from public.food_servings where food_id=f and source_provider='usda_fdc' and source_external_id<>ext) then raise exception 'FDC_CANONICAL_CONFLICT'; end if;
  if jsonb_array_length(payload->'servings')<>(select count(distinct x->>'key') from jsonb_array_elements(payload->'servings') x) then raise exception 'FDC_DUPLICATE_PORTION'; end if;
  if (select count(*) from jsonb_array_elements(payload->'servings') x where x->>'key'='100g')<>1 then raise exception 'FDC_INVALID_PORTION'; end if;
  update public.food_servings set source_retired=true,is_default=false where food_id=f and source_provider='usda_fdc' and source_external_id=ext;
  for s in select value from jsonb_array_elements(payload->'servings') loop
   if coalesce(s->>'key','') !~ '^(100g|portion:[0-9]+)$' or char_length(coalesce(s->>'serving_name','')) not between 1 and 160 or coalesce(s->>'serving_unit','') not in ('g','oz','cup','tbsp','tsp','slice','each','fl oz','ml') then raise exception 'FDC_INVALID_PORTION'; end if;
   foreach k in array array['serving_quantity','grams_equivalent','calories','protein_grams','carbohydrate_grams','fat_grams','fiber_grams','sugar_grams','sodium_mg','caffeine_mg','alcohol_grams'] loop
    v:=(s->>k)::numeric;
    if (k in ('serving_quantity','grams_equivalent','calories','protein_grams','carbohydrate_grams','fat_grams') and v is null) or v<0 or v>100000 or v::text in ('NaN','Infinity') or (k in ('serving_quantity','grams_equivalent') and v=0) then raise exception 'FDC_INVALID_PORTION'; end if;
    if k not in ('serving_quantity','grams_equivalent') and ((v is null) <> ((payload->'basis'->>k) is null) or abs(v-(payload->'basis'->>k)::numeric*(s->>'grams_equivalent')::numeric/100)>0.000001) then raise exception 'FDC_INVALID_PORTION'; end if;
   end loop;
   if s->>'key'='100g' and (s->>'serving_unit'<>'g' or (s->>'serving_quantity')::numeric<>100 or (s->>'grams_equivalent')::numeric<>100) then raise exception 'FDC_INVALID_PORTION'; end if;
   insert into public.food_servings(food_id,serving_name,serving_quantity,serving_unit,grams_equivalent,calories,protein_grams,carbohydrate_grams,fat_grams,fiber_grams,sugar_grams,sodium_mg,caffeine_mg,alcohol_grams,is_default,source_provider,source_external_id,source_portion_key,source_retired)
   values(f,s->>'serving_name',(s->>'serving_quantity')::numeric,s->>'serving_unit',(s->>'grams_equivalent')::numeric,(s->>'calories')::numeric,(s->>'protein_grams')::numeric,(s->>'carbohydrate_grams')::numeric,(s->>'fat_grams')::numeric,(s->>'fiber_grams')::numeric,(s->>'sugar_grams')::numeric,(s->>'sodium_mg')::numeric,(s->>'caffeine_mg')::numeric,(s->>'alcohol_grams')::numeric,s->>'key'='100g','usda_fdc',ext,s->>'key',false)
   on conflict(food_id,source_provider,source_external_id,source_portion_key) where source_provider is not null
   do update set serving_name=excluded.serving_name,serving_quantity=excluded.serving_quantity,serving_unit=excluded.serving_unit,grams_equivalent=excluded.grams_equivalent,calories=excluded.calories,protein_grams=excluded.protein_grams,carbohydrate_grams=excluded.carbohydrate_grams,fat_grams=excluded.fat_grams,fiber_grams=excluded.fiber_grams,sugar_grams=excluded.sugar_grams,sodium_mg=excluded.sodium_mg,caffeine_mg=excluded.caffeine_mg,alcohol_grams=excluded.alcohol_grams,is_default=excluded.is_default,source_retired=false;
   imported:=imported+1;
  end loop;
 end if;
 for k in select jsonb_array_elements_text(payload->'categories') loop
  select id into sid from public.food_categories where slug=k and is_active;
  if sid is null then raise exception 'FDC_UNKNOWN_CATEGORY'; end if;
  insert into public.food_category_map(food_id,category_id) values(f,sid) on conflict do nothing;
 end loop;
 return jsonb_build_object('food_id',f,'status',case when source_only then 'provenance_only' when prior.food_id is null then 'imported' else 'refreshed' end,'servings_written',imported);
end $$;
revoke all on function public.import_fdc_food(jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.import_fdc_food(jsonb,uuid,boolean) to service_role;

create or replace function public.append_nutrition_food(entry_id uuid,selected_food_id uuid,selected_serving_id uuid,selected_user_food_id uuid,quantity numeric)
returns text language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); s record;
begin
 if u is null or quantity is null or quantity<=0 or quantity>100000 or quantity::text in('NaN','Infinity') or ((selected_user_food_id is null)=(selected_food_id is null))
 or not exists(select 1 from public.nutrition_entries e where e.id=entry_id and e.user_id=u and e.deleted_at is null) then raise exception 'Invalid food log'; end if;
 if selected_user_food_id is not null then
  select id,name,brand_name,serving_name,serving_quantity,serving_unit,grams_equivalent,calories,protein_grams,carbohydrate_grams,fat_grams,fiber_grams,sugar_grams,sodium_mg,caffeine_mg,alcohol_grams into s
  from public.user_foods where id=selected_user_food_id and user_id=u and is_active and archived_at is null;
 else
  select f.id,f.name,f.brand_name,fs.serving_name,fs.serving_quantity,fs.serving_unit,fs.grams_equivalent,fs.calories,fs.protein_grams,fs.carbohydrate_grams,fs.fat_grams,fs.fiber_grams,fs.sugar_grams,fs.sodium_mg,fs.caffeine_mg,fs.alcohol_grams into s
  from public.foods f join public.food_servings fs on fs.food_id=f.id where f.id=selected_food_id and fs.id=selected_serving_id and f.is_active and not fs.source_retired;
 end if;
 if s.id is null then raise exception 'Food not found'; end if;
 insert into public.nutrition_entry_items(nutrition_entry_id,food_id,food_serving_id,user_food_id,source_name,source_brand_name,serving_name_snapshot,serving_quantity_snapshot,serving_unit_snapshot,quantity_multiplier,grams_consumed,calories,protein_grams,carbohydrate_grams,fat_grams,fiber_grams,sugar_grams,sodium_mg,caffeine_mg,alcohol_grams)
 values(entry_id,selected_food_id,selected_serving_id,selected_user_food_id,s.name,s.brand_name,s.serving_name,s.serving_quantity,s.serving_unit,quantity,s.grams_equivalent*quantity,s.calories*quantity,s.protein_grams*quantity,s.carbohydrate_grams*quantity,s.fat_grams*quantity,s.fiber_grams*quantity,s.sugar_grams*quantity,s.sodium_mg*quantity,s.caffeine_mg*quantity,s.alcohol_grams*quantity);
 if selected_user_food_id is not null then update public.user_foods set last_logged_at=(select consumed_at from public.nutrition_entries where id=entry_id) where id=selected_user_food_id and user_id=u;end if;
 return s.name;
end $$;

commit;
