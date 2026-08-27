begin;
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
  when 'account/export:POST' then 2 when 'account/delete:POST' then 3
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
revoke all on function public.axvital_consume_api_budget(text) from public;
grant execute on function public.axvital_consume_api_budget(text) to authenticated;
commit;
