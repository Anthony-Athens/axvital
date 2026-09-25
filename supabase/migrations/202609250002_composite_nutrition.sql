begin;
-- Optional reference recipe quantities; all nutrition remains in food_servings and entry snapshots.
alter table public.foods add column if not exists recipe_unit text check(recipe_unit in ('each','slice','serving'));
alter table public.food_components add column if not exists quantity numeric check(quantity>0 and quantity<=10000 and quantity::text not in ('NaN','Infinity')),
 add column if not exists unit text check(char_length(unit) between 1 and 40);
alter table public.health_event_food_components add column if not exists quantity numeric check(quantity>0 and quantity<=10000 and quantity::text not in ('NaN','Infinity')),
 add column if not exists unit text check(char_length(unit) between 1 and 40);
create function public.ingest_nutrition_batch(request_id uuid, rows jsonb, entry_source text) returns void
language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); inserted integer; prior text; item jsonb; n jsonb; f jsonb; c jsonb; eid uuid; fid uuid; selected_food uuid; selected_serving uuid; multiplier numeric; recipe_item jsonb; recipe_count integer;
begin
 if entry_source not in ('manual','voice') or entry_source is null then raise exception 'INVALID_EVENT'; end if;
 if u is null then raise exception 'AUTH_REQUIRED'; end if;
 if request_id is null or jsonb_typeof(rows) is distinct from 'array' then raise exception 'INVALID_EVENT'; end if;
 if jsonb_array_length(rows) not between 1 and 12 or octet_length(rows::text)>65536 then raise exception 'INVALID_EVENT'; end if;
 insert into public.voice_log_receipts(id,user_id,payload_hash) values(request_id,u,md5(rows::text)) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then
  select payload_hash into prior from public.voice_log_receipts where id=request_id and user_id=u;
  if prior is distinct from md5(rows::text) then raise exception 'VOICE_RETRY_CHANGED'; end if;
  return;
 end if;
 for item in select value from jsonb_array_elements(rows) loop
  if item->>'kind'='health' then
   if entry_source<>'voice' then raise exception 'INVALID_EVENT'; end if;
   if coalesce(item->'event'->>'event_type','') in('food','fluid') or item->'event'->>'input_method' is distinct from 'voice' then raise exception 'INVALID_EVENT'; end if;
   perform public.ingest_health_events_with_food(jsonb_build_array(jsonb_build_object('event',item->'event','food',null)));
  elsif item->>'kind'='nutrition' then
   n:=item->'nutrition'; f:=item->'food';
   if jsonb_typeof(n) is distinct from 'object' or jsonb_typeof(f) is distinct from 'object' then raise exception 'INVALID_FOOD'; end if;
   if jsonb_typeof(f->'components') is distinct from 'array' or char_length(coalesce(f->>'label','')) not between 1 and 160 then raise exception 'INVALID_FOOD'; end if;
   if jsonb_array_length(f->'components')>16 or ((f->>'food_id' is null) <> (f->>'method'='provisional')) then raise exception 'INVALID_FOOD'; end if;
   if n->>'status'='recorded' and n ? 'recipe' then
    if n->>'recipe_confirmed' is distinct from 'true' or jsonb_typeof(n->'recipe') is distinct from 'array' then raise exception 'REVIEW_REQUIRED'; end if;
    recipe_count:=jsonb_array_length(n->'recipe');
    if recipe_count not between 1 and 16 or recipe_count<>(select count(*) from jsonb_array_elements(f->'components') x where x->>'included'='true')
      or recipe_count<>(select count(distinct x->>'food_id') from jsonb_array_elements(n->'recipe') x) then raise exception 'INVALID_RECIPE'; end if;
    if f->>'method' in('ai','fuzzy') and coalesce((f->>'confirmed')::boolean,false)=false then raise exception 'REVIEW_REQUIRED'; end if;
    insert into public.nutrition_entries(user_id,title,consumed_at,meal_type,notes,source_type,entry_type)
      values(u,f->>'label',(n->>'consumed_at')::timestamptz,n->>'meal_type',n->>'notes',entry_source,'meal') returning id into eid;
    for recipe_item in select value from jsonb_array_elements(n->'recipe') loop
      selected_food:=(recipe_item->>'food_id')::uuid; selected_serving:=(recipe_item->>'serving_id')::uuid; multiplier:=(recipe_item->>'multiplier')::numeric;
      if not exists(select 1 from jsonb_array_elements(f->'components') x where (x->>'food_id')::uuid=selected_food and x->>'included'='true' and (x->>'source'<>'ai_inferred' or x->>'confirmed'='true')) then raise exception 'REVIEW_REQUIRED'; end if;
      if not exists(select 1 from public.food_servings s where s.id=selected_serving and s.food_id=selected_food and s.calories is not null and s.protein_grams is not null and s.carbohydrate_grams is not null and s.fat_grams is not null and s.calories::text not in ('NaN','Infinity','-Infinity') and s.protein_grams::text not in ('NaN','Infinity','-Infinity') and s.carbohydrate_grams::text not in ('NaN','Infinity','-Infinity') and s.fat_grams::text not in ('NaN','Infinity','-Infinity')) then raise exception 'RECIPE_INCOMPLETE'; end if;
      perform public.append_nutrition_food(eid,selected_food,selected_serving,null,multiplier);
    end loop;
   elsif n->>'status'='recorded' then
    selected_food:=(f->>'food_id')::uuid; selected_serving:=(n->>'serving_id')::uuid; multiplier:=(n->>'multiplier')::numeric;
    if selected_food is null or selected_serving is null or multiplier is null or multiplier<=0 or multiplier>100000 or multiplier::text in('NaN','Infinity') then raise exception 'INVALID_SERVING'; end if;
    if f->>'method' in('ai','fuzzy') and coalesce((f->>'confirmed')::boolean,false)=false then raise exception 'REVIEW_REQUIRED'; end if;
    if exists(select 1 from jsonb_array_elements(f->'components') x where x->>'included'='false' or x->>'source' in('explicit','ai_inferred','user_confirmed')) and coalesce((n->>'reference_confirmed')::boolean,false)=false then raise exception 'REVIEW_REQUIRED'; end if;
    -- Same authoritative nutrient snapshot function used by the manual tracker. No client macros accepted.
    eid:=public.log_food_atomic(selected_food,selected_serving,null,multiplier,(n->>'consumed_at')::timestamptz,n->>'meal_type',n->>'notes',entry_source);
   elsif n->>'status'='incomplete' and n->>'accept_incomplete'='true' then
    insert into public.nutrition_entries(user_id,title,consumed_at,meal_type,notes,source_type,nutrition_status)
     values(u,f->>'label',(n->>'consumed_at')::timestamptz,n->>'meal_type',n->>'notes',entry_source,'incomplete') returning id into eid;
   else raise exception 'REVIEW_REQUIRED'; end if;
   update public.nutrition_entries set stated_amount=n->>'stated_amount',tags=array(select jsonb_array_elements_text(coalesce(n->'tags','[]'::jsonb))),entry_type=case when n ? 'recipe' then 'meal' when n->>'event_type'='fluid' then 'beverage' else 'food' end where id=eid;
   insert into public.health_event_foods(user_id,nutrition_entry_id,food_id,label,method,confirmed)
    values(u,eid,(f->>'food_id')::uuid,f->>'label',f->>'method',(f->>'confirmed')::boolean) returning id into fid;
   for c in select value from jsonb_array_elements(f->'components') loop
    insert into public.health_event_food_components(user_id,event_food_id,food_id,label,source,confidence,included,confirmed,quantity,unit)
     values(u,fid,(c->>'food_id')::uuid,c->>'label',c->>'source',(c->>'confidence')::numeric,(c->>'included')::boolean,(c->>'confirmed')::boolean,(c->>'quantity')::numeric,c->>'unit');
   end loop;
  else raise exception 'INVALID_EVENT'; end if;
 end loop;
end $$;

revoke all on function public.ingest_nutrition_batch(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.ingest_nutrition_batch(uuid,jsonb,text) to authenticated;
create or replace function public.ingest_voice_nutrition(request_id uuid,rows jsonb) returns void language sql security invoker set search_path='' as $$ select public.ingest_nutrition_batch(request_id,rows,'voice'); $$;
create function public.ingest_manual_nutrition(request_id uuid,rows jsonb) returns void language sql security invoker set search_path='' as $$ select public.ingest_nutrition_batch(request_id,rows,'manual'); $$;
revoke all on function public.ingest_manual_nutrition(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_manual_nutrition(uuid,jsonb) to authenticated;
commit;
