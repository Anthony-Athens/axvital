begin;

-- A durable logical operation, not a per-request key or process-local lock.
create table public.billing_customer_provisions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 operation_id uuid not null unique default gen_random_uuid(),
 created_at timestamptz not null default clock_timestamp(),
 stripe_customer_id text unique
);
alter table public.billing_customer_provisions enable row level security;
revoke all on public.billing_customer_provisions from public,anon,authenticated;
grant select on public.billing_customer_provisions to service_role;

create function public.axvital_reserve_billing_customer(target_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare mapping public.subscriptions; provision public.billing_customer_provisions;
begin
 perform 1 from auth.users where id=target_user for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
 if exists(select 1 from public.account_deletions where user_id=target_user) then raise exception 'ACCOUNT_DELETION_PENDING'; end if;
 select * into mapping from public.subscriptions where user_id=target_user;
 if mapping.stripe_customer_id is not null then
  return jsonb_build_object('customer_id',mapping.stripe_customer_id);
 end if;
 if mapping.stripe_subscription_id is not null or coalesce(mapping.status,'inactive') not in ('inactive','canceled','incomplete_expired') then
  raise exception 'BILLING_RECONCILIATION_REQUIRED';
 end if;
 insert into public.billing_customer_provisions(user_id) values(target_user) on conflict do nothing;
 select * into provision from public.billing_customer_provisions where user_id=target_user;
 -- Never mint a fresh operation or replay after provider keys could expire.
 if provision.stripe_customer_id is not null or clock_timestamp() >= provision.created_at + interval '23 hours' then
  raise exception 'BILLING_RECONCILIATION_REQUIRED';
 end if;
 return jsonb_build_object('operation_id',provision.operation_id,'retry_before',provision.created_at + interval '23 hours');
end $$;

create function public.axvital_establish_billing_customer(target_user uuid, operation uuid, customer text) returns text
language plpgsql security definer set search_path='' as $$
declare provision public.billing_customer_provisions; mapped text;
begin
 perform 1 from auth.users where id=target_user for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
 if exists(select 1 from public.account_deletions where user_id=target_user) then raise exception 'ACCOUNT_DELETION_PENDING'; end if;
 if customer is null or customer !~ '^cus_[A-Za-z0-9]+$' then raise exception 'INVALID_CUSTOMER'; end if;
 select * into provision from public.billing_customer_provisions where user_id=target_user;
 if provision.operation_id is distinct from operation or operation is null then raise exception 'BILLING_OPERATION_MISMATCH'; end if;
 select stripe_customer_id into mapped from public.subscriptions where user_id=target_user;
 if mapped is not null then
  if mapped<>customer then raise exception 'BILLING_MAPPING_CONFLICT'; end if;
  return mapped;
 end if;
 if provision.stripe_customer_id is not null and provision.stripe_customer_id<>customer then raise exception 'BILLING_MAPPING_CONFLICT'; end if;
 update public.billing_customer_provisions set stripe_customer_id=customer where user_id=target_user;
 insert into public.subscriptions(user_id,stripe_customer_id,plan,status) values(target_user,customer,'free','inactive')
 on conflict(user_id) do update set stripe_customer_id=excluded.stripe_customer_id;
 return customer;
end $$;

create function public.axvital_assert_billing_customer(target_user uuid, customer text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from auth.users where id=target_user for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
 if exists(select 1 from public.account_deletions where user_id=target_user) then raise exception 'ACCOUNT_DELETION_PENDING'; end if;
 if not exists(select 1 from public.subscriptions where user_id=target_user and stripe_customer_id=customer) then raise exception 'BILLING_MAPPING_CONFLICT'; end if;
 return true;
end $$;

-- Protect against both old upserts and late/mismatched webhook writes.
create function public.axvital_guard_customer_mapping() returns trigger
language plpgsql security definer set search_path='' as $$
declare provision public.billing_customer_provisions;
begin
 perform 1 from auth.users where id=new.user_id for update;
 if tg_op='UPDATE' then
  if old.user_id is distinct from new.user_id or (old.stripe_customer_id is not null and old.stripe_customer_id is distinct from new.stripe_customer_id) then
   raise exception 'BILLING_MAPPING_IMMUTABLE';
  end if;
 end if;
 select * into provision from public.billing_customer_provisions where user_id=new.user_id;
 if found and new.stripe_customer_id is not null and provision.stripe_customer_id is distinct from new.stripe_customer_id then
  raise exception 'BILLING_OPERATION_NOT_ESTABLISHED';
 end if;
 return new;
end $$;
create trigger billing_customer_mapping_guard before insert or update on public.subscriptions
for each row execute function public.axvital_guard_customer_mapping();

-- Install the stronger contract only after the coordination table exists.
create or replace function public.axvital_assert_deletion_contract(target_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.axvital_assert_account_schema(true);
 if exists(select 1 from public.billing_customer_provisions p
   left join public.subscriptions s on s.user_id=p.user_id
   where p.user_id=target_user and (p.stripe_customer_id is null or p.stripe_customer_id is distinct from s.stripe_customer_id)) then
  raise exception 'BILLING_RECONCILIATION_REQUIRED';
 end if;
end $$;
revoke all on function public.axvital_assert_deletion_contract(uuid) from public,anon,authenticated;
grant execute on function public.axvital_assert_deletion_contract(uuid) to service_role;

-- Do not lose an unresolved provider operation by deleting its owning account.
create or replace function public.axvital_begin_account_deletion(target_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from auth.users where id=target_user for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
 perform public.axvital_assert_deletion_contract(target_user);
 insert into public.account_deletions(user_id) values(target_user) on conflict do nothing;
end $$;

revoke all on function public.axvital_reserve_billing_customer(uuid) from public,anon,authenticated;
revoke all on function public.axvital_establish_billing_customer(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.axvital_assert_billing_customer(uuid,text) from public,anon,authenticated;
revoke all on function public.axvital_guard_customer_mapping() from public,anon,authenticated;
revoke all on function public.axvital_begin_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.axvital_reserve_billing_customer(uuid) to service_role;
grant execute on function public.axvital_establish_billing_customer(uuid,uuid,text) to service_role;
grant execute on function public.axvital_assert_billing_customer(uuid,text) to service_role;
grant execute on function public.axvital_begin_account_deletion(uuid) to service_role;
select public.axvital_assert_account_schema(true);
commit;
