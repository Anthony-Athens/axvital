begin;
alter table public.nutrition_entries drop constraint nutrition_entries_source_type_check;
alter table public.nutrition_entries add constraint nutrition_entries_source_type_check check(source_type in('manual','quick_add','import','other','voice'));
alter table public.nutrition_entries add column nutrition_status text not null default 'recorded' check(nutrition_status in('recorded','incomplete')),
 add column stated_amount text check(char_length(stated_amount)<=160), add column tags text[] not null default '{}';

-- Preserve the existing metadata and historical anchors, while new voice intake anchors to nutrition.
alter table public.health_event_foods alter column health_event_id drop not null;
alter table public.health_event_foods add column nutrition_entry_id uuid unique references public.nutrition_entries(id) on delete cascade,
 add foreign key(nutrition_entry_id,user_id) references public.nutrition_entries(id,user_id) on delete cascade,
 add constraint one_food_intake_anchor check(num_nonnulls(health_event_id,nutrition_entry_id)=1);
drop policy visible_event_parent on public.health_event_foods;
create policy visible_event_parent on public.health_event_foods as restrictive for all to authenticated
 using(exists(select 1 from public.health_events h where h.id=health_event_id and h.user_id=auth.uid()) or exists(select 1 from public.nutrition_entries n where n.id=nutrition_entry_id and n.user_id=auth.uid()))
 with check(exists(select 1 from public.health_events h where h.id=health_event_id and h.user_id=auth.uid()) or exists(select 1 from public.nutrition_entries n where n.id=nutrition_entry_id and n.user_id=auth.uid()));
create view public.nutrition_food_category_exposures with(security_invoker=true) as
 select f.nutrition_entry_id,e.user_id,e.event_food_id,e.component_id,e.category_id,e.source,e.confirmed,e.confidence
 from public.health_event_food_category_exposures e join public.health_event_foods f on f.id=e.event_food_id
 join public.nutrition_entries n on n.id=f.nutrition_entry_id where n.deleted_at is null;
revoke all on public.nutrition_food_category_exposures from public,anon,authenticated;
grant select on public.nutrition_food_category_exposures to authenticated;

create table public.voice_log_receipts (
 id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
 payload_hash text not null, created_at timestamptz not null default now(), primary key(id,user_id)
);
alter table public.voice_log_receipts enable row level security;
revoke all on public.voice_log_receipts from public,anon,authenticated;
grant select,insert on public.voice_log_receipts to authenticated;
grant all on public.voice_log_receipts to service_role;
create policy owner_receipt on public.voice_log_receipts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

-- One snapshot writer for manual logging, voice logging and completing unresolved intake.
create function public.append_nutrition_food(entry_id uuid,selected_food_id uuid,selected_serving_id uuid,selected_user_food_id uuid,quantity numeric)
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
  from public.foods f join public.food_servings fs on fs.food_id=f.id where f.id=selected_food_id and fs.id=selected_serving_id and f.is_active;
 end if;
 if s.id is null then raise exception 'Food not found'; end if;
 insert into public.nutrition_entry_items(nutrition_entry_id,food_id,food_serving_id,user_food_id,source_name,source_brand_name,serving_name_snapshot,serving_quantity_snapshot,serving_unit_snapshot,quantity_multiplier,grams_consumed,calories,protein_grams,carbohydrate_grams,fat_grams,fiber_grams,sugar_grams,sodium_mg,caffeine_mg,alcohol_grams)
 values(entry_id,selected_food_id,selected_serving_id,selected_user_food_id,s.name,s.brand_name,s.serving_name,s.serving_quantity,s.serving_unit,quantity,s.grams_equivalent*quantity,s.calories*quantity,s.protein_grams*quantity,s.carbohydrate_grams*quantity,s.fat_grams*quantity,s.fiber_grams*quantity,s.sugar_grams*quantity,s.sodium_mg*quantity,s.caffeine_mg*quantity,s.alcohol_grams*quantity);
 if selected_user_food_id is not null then update public.user_foods set last_logged_at=(select consumed_at from public.nutrition_entries where id=entry_id) where id=selected_user_food_id and user_id=u;end if;
 return s.name;
end $$;
revoke all on function public.append_nutrition_food(uuid,uuid,uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.append_nutrition_food(uuid,uuid,uuid,uuid,numeric) to authenticated;
create or replace function public.log_food_atomic(selected_food_id uuid,selected_serving_id uuid,selected_user_food_id uuid,quantity numeric,consumed timestamptz,meal text default null,note text default null,entry_source text default 'manual')
returns uuid language plpgsql security invoker set search_path='' as $$
declare eid uuid; food_name text;
begin
 insert into public.nutrition_entries(user_id,consumed_at,meal_type,notes,source_type) values(auth.uid(),consumed,meal,note,entry_source) returning id into eid;
 food_name:=public.append_nutrition_food(eid,selected_food_id,selected_serving_id,selected_user_food_id,quantity);
 update public.nutrition_entries set title=food_name where id=eid;
 return eid;
end $$;

create function public.ingest_voice_nutrition(request_id uuid, rows jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); inserted integer; prior text; item jsonb; n jsonb; f jsonb; c jsonb; eid uuid; fid uuid; selected_food uuid; selected_serving uuid; multiplier numeric;
begin
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
   if coalesce(item->'event'->>'event_type','') in('food','fluid') or item->'event'->>'input_method' is distinct from 'voice' then raise exception 'INVALID_EVENT'; end if;
   perform public.ingest_health_events_with_food(jsonb_build_array(jsonb_build_object('event',item->'event','food',null)));
  elsif item->>'kind'='nutrition' then
   n:=item->'nutrition'; f:=item->'food';
   if jsonb_typeof(n) is distinct from 'object' or jsonb_typeof(f) is distinct from 'object' then raise exception 'INVALID_FOOD'; end if;
   if jsonb_typeof(f->'components') is distinct from 'array' or char_length(coalesce(f->>'label','')) not between 1 and 160 then raise exception 'INVALID_FOOD'; end if;
   if jsonb_array_length(f->'components')>16 or ((f->>'food_id' is null) <> (f->>'method'='provisional')) then raise exception 'INVALID_FOOD'; end if;
   if n->>'status'='recorded' then
    selected_food:=(f->>'food_id')::uuid; selected_serving:=(n->>'serving_id')::uuid; multiplier:=(n->>'multiplier')::numeric;
    if selected_food is null or selected_serving is null or multiplier is null or multiplier<=0 or multiplier>100000 or multiplier::text in('NaN','Infinity') then raise exception 'INVALID_SERVING'; end if;
    if f->>'method' in('ai','fuzzy') and coalesce((f->>'confirmed')::boolean,false)=false then raise exception 'REVIEW_REQUIRED'; end if;
    if exists(select 1 from jsonb_array_elements(f->'components') x where x->>'included'='false' or x->>'source' in('explicit','ai_inferred','user_confirmed')) and coalesce((n->>'reference_confirmed')::boolean,false)=false then raise exception 'REVIEW_REQUIRED'; end if;
    -- Same authoritative nutrient snapshot function used by the manual tracker. No client macros accepted.
    eid:=public.log_food_atomic(selected_food,selected_serving,null,multiplier,(n->>'consumed_at')::timestamptz,n->>'meal_type',n->>'notes','voice');
   elsif n->>'status'='incomplete' and n->>'accept_incomplete'='true' then
    insert into public.nutrition_entries(user_id,title,consumed_at,meal_type,notes,source_type,nutrition_status)
     values(u,f->>'label',(n->>'consumed_at')::timestamptz,n->>'meal_type',n->>'notes','voice','incomplete') returning id into eid;
   else raise exception 'REVIEW_REQUIRED'; end if;
   update public.nutrition_entries set stated_amount=n->>'stated_amount',tags=array(select jsonb_array_elements_text(coalesce(n->'tags','[]'::jsonb))),entry_type=case when n->>'event_type'='fluid' then 'beverage' else 'food' end where id=eid;
   insert into public.health_event_foods(user_id,nutrition_entry_id,food_id,label,method,confirmed)
    values(u,eid,(f->>'food_id')::uuid,f->>'label',f->>'method',(f->>'confirmed')::boolean) returning id into fid;
   for c in select value from jsonb_array_elements(f->'components') loop
    insert into public.health_event_food_components(user_id,event_food_id,food_id,label,source,confidence,included,confirmed)
     values(u,fid,(c->>'food_id')::uuid,c->>'label',c->>'source',(c->>'confidence')::numeric,(c->>'included')::boolean,(c->>'confirmed')::boolean);
   end loop;
  else raise exception 'INVALID_EVENT'; end if;
 end loop;
end $$;
revoke all on function public.ingest_voice_nutrition(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_voice_nutrition(uuid,jsonb) to authenticated;

-- Complete an explicitly reviewed unresolved entry without creating a second visible log.
create function public.complete_nutrition_entry(entry_id uuid, selected_food_id uuid, selected_serving_id uuid, selected_user_food_id uuid, quantity numeric)
returns void language plpgsql security invoker set search_path='' as $$
declare existing public.nutrition_entries; food_name text;
begin
 select * into existing from public.nutrition_entries where id=entry_id and user_id=auth.uid() and deleted_at is null for update;
 if existing.id is null or existing.nutrition_status<>'incomplete' then raise exception 'ENTRY_NOT_INCOMPLETE'; end if;
 food_name:=public.append_nutrition_food(entry_id,selected_food_id,selected_serving_id,selected_user_food_id,quantity);
 update public.nutrition_entries set title=food_name,nutrition_status='recorded' where id=entry_id;
 update public.health_event_foods set food_id=selected_food_id,method=case when selected_food_id is null then 'provisional' else 'exact' end,confirmed=true where nutrition_entry_id=entry_id;
end $$;
revoke all on function public.complete_nutrition_entry(uuid,uuid,uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.complete_nutrition_entry(uuid,uuid,uuid,uuid,numeric) to authenticated;

-- Extend the fail-closed inventory and cleanup; no history is rewritten or discarded.
do $patch$ declare d text; begin
 d:=pg_get_functiondef('public.axvital_account_schema_issues(boolean)'::regprocedure);
 if position('(''health_events'',''user_id'',''auth.users'',''c'',false,false)' in d)=0 then raise exception 'NUTRITION_ACCOUNT_PATCH_MISMATCH'; end if;
 d:=replace(d,'(''health_events'',''user_id'',''auth.users'',''c'',false,false)','(''voice_log_receipts'',''user_id'',''auth.users'',''c'',false,false),(''health_events'',''user_id'',''auth.users'',''c'',false,false)');
 d:=replace(d,'(''health_event_foods'',''health_event_id'',''health_events'',''c'',true)','(''health_event_foods'',''nutrition_entry_id'',''nutrition_entries'',''c'',true),(''health_event_foods'',''health_event_id'',''health_events'',''c'',true)');
 execute d;
 -- Receipts contain only a request UUID and hash; operational deduplication data is not exported.
end $patch$;
select public.axvital_assert_account_schema(true);

-- Aliases attach to existing serving-backed IDs; no new food or invented nutrient record.
insert into public.food_aliases(food_id,alias) select id,a.alias from public.foods cross join (values('eggs'),('whole egg'),('whole eggs')) a(alias) where slug='egg' on conflict(food_id,normalized_alias) do nothing;
commit;
