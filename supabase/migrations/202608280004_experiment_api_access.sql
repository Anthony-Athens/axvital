-- 13A.3C. Forward-only API access controls; existing transactional engines retained.
begin;
create function public.axvital_require_full_experiments() returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.subscriptions s where s.user_id=auth.uid() and s.plan='premium' and
  ((s.status in ('active','trialing') and (s.current_period_end is null or s.current_period_end>now()))
   or (s.status in ('past_due','canceled') and s.current_period_end>now())))
 then raise exception 'PREMIUM_REQUIRED'; end if;
end $$;
revoke all on function public.axvital_require_full_experiments() from public,anon,authenticated,service_role;

-- Preserve the exact existing lock/revision/snapshot implementation. The renamed
-- implementation is no longer an API entry point, including via default grants.
alter function public.save_experiment_v2(uuid,integer,jsonb) rename to axvital_save_experiment_v2_internal;
alter function public.start_experiment_v2(uuid,integer) rename to axvital_start_experiment_v2_internal;
revoke all on function public.axvital_save_experiment_v2_internal(uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.axvital_start_experiment_v2_internal(uuid,integer) from public,anon,authenticated,service_role;
create function public.save_experiment_v2(target_id uuid,expected_revision integer,input jsonb) returns public.experiments
language plpgsql security definer set search_path='' as $$
begin
 perform public.axvital_require_full_experiments();
 return public.axvital_save_experiment_v2_internal(target_id,expected_revision,input);
end $$;
create function public.start_experiment_v2(target_id uuid,expected_revision integer) returns public.experiments
language plpgsql security definer set search_path='' as $$
begin
 perform public.axvital_require_full_experiments();
 return public.axvital_start_experiment_v2_internal(target_id,expected_revision);
end $$;
revoke all on function public.save_experiment_v2(uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.start_experiment_v2(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.save_experiment_v2(uuid,integer,jsonb) to authenticated;
grant execute on function public.start_experiment_v2(uuid,integer) to authenticated;

create or replace function public.axvital_consume_api_budget(route_key text)
returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); maximum integer; used integer;
begin
 if owner_id is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 maximum := case route_key
  when 'analytics:GET' then 20 when 'timeline:GET' then 60
  when 'weekly-recap:GET' then 30 when 'weekly-recap:POST' then 6
  when 'trigger-patterns:GET' then 12 when 'condition-outlook:GET' then 12
  when 'product-events:POST' then 30 when 'billing/checkout:POST' then 3
  when 'billing/portal:POST' then 6 when 'billing/status:GET' then 60
  when 'experiments/draft:POST' then 20 when 'experiments/start:POST' then 6 when 'nutrition/pattern:POST' then 12
  when 'account/export:POST' then 2 when 'account/delete:POST' then 3
  when 'http/experiments/outcomes:GET' then 30 when 'http/experiments/targets:GET' then 30
  when 'http/experiments/draft:GET' then 30 when 'http/experiments/readiness:POST' then 12
  when 'http/experiments/draft:POST' then 20 when 'http/experiments/start:POST' then 6
  else null end;
 if maximum is null then raise exception 'INVALID_ROUTE'; end if;
 insert into public.api_request_budgets as b(user_id,route_key,window_start,requests)
 values(owner_id,route_key,date_trunc('minute',clock_timestamp()),1)
 on conflict on constraint api_request_budgets_pkey do update
 set window_start=excluded.window_start,
 requests=case when b.window_start=excluded.window_start then least(b.requests+1,maximum+1) else 1 end
 returning requests into used;
 return used <= maximum;
end $$;
revoke all on function public.axvital_consume_api_budget(text) from public,anon;
grant execute on function public.axvital_consume_api_budget(text) to authenticated;

-- Fixed-purpose search across custom/catalog labels without client-side scans.
-- selected_ids is a bounded read-only reference resolver for draft review.
create function public.discover_experiment_targets_v1(target_kind text,search_text text default '',after_id uuid default null,page_size integer default 20,selected_ids uuid[] default null)
returns table(id uuid,label text,identity text,available boolean)
language plpgsql stable security invoker set search_path='' set statement_timeout='10s' as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if target_kind is null or target_kind not in('conditions','symptoms','catalog_symptoms','exercises','habits','protocols','nutrition_patterns','target_rules','workout_templates')
 or search_text is null or char_length(search_text)>100 or page_size is null or page_size not between 1 and 50
 or (selected_ids is not null and (cardinality(selected_ids) not between 1 and 10 or array_position(selected_ids,null) is not null)) then raise exception 'INVALID_REQUEST';end if;
 return query
 select t.id,t.label,t.identity,t.available from (
  select c.id,coalesce(c.custom_condition_name,s.name,'Unavailable condition') label,'user_condition_id'::text identity,(c.archived_at is null) available
  from public.user_conditions c left join public.conditions s on s.id=c.condition_id where target_kind='conditions' and c.user_id=auth.uid()
  union all
  select u.id,coalesce(u.custom_symptom_name,s.name,'Unavailable symptom'),'user_symptom_id',u.is_active
  from public.user_symptoms u left join public.symptoms s on s.id=u.symptom_id where target_kind='symptoms' and u.user_id=auth.uid()
  union all
  select s.id,s.name,'symptom_id',s.is_active from public.symptoms s where target_kind='catalog_symptoms'
  union all
  select x.id,x.name,'exercise_id',not x.is_archived from public.exercises x where target_kind='exercises' and (x.user_id is null or x.user_id=auth.uid())
  union all
  select a.id,a.title,'linked_planned_activity_id',a.is_active from public.planned_activities a where target_kind='habits' and a.user_id=auth.uid() and a.activity_type='habit'
  union all
  select p.id,p.name,'linked_user_protocol_id',true from public.user_protocols p where target_kind='protocols' and p.user_id=auth.uid()
  union all
  select p.id,p.name,'nutrition_pattern_id',p.archived_at is null from public.nutrition_patterns p where target_kind='nutrition_patterns' and p.user_id=auth.uid()
  union all
  select r.id,r.name,'rule_id',r.archived_at is null from public.target_rules r where target_kind='target_rules' and r.user_id=auth.uid() and r.definition->>'domain'='nutrition'
  union all
  select w.id,w.name,'linked_workout_template_id',not w.is_archived from public.workout_templates w where target_kind='workout_templates' and w.user_id=auth.uid()
 ) t where (selected_ids is null and t.available or selected_ids is not null and t.id=any(selected_ids))
 and (after_id is null or t.id>after_id)
 -- Literal substring matching: wildcard characters never expand the query.
 and strpos(lower(t.label),lower(search_text))>0
 order by t.id limit page_size+1;
end $$;
revoke all on function public.discover_experiment_targets_v1(text,text,uuid,integer,uuid[]) from public,anon;
grant execute on function public.discover_experiment_targets_v1(text,text,uuid,integer,uuid[]) to authenticated;
commit;
