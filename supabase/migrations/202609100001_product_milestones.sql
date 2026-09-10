begin;
alter table public.product_events drop constraint product_events_event_name_check;
alter table public.product_events add constraint product_events_event_name_check check(event_name in('signup_completed','onboarding_completed','first_daily_checkin','first_health_event','first_symptom_logged','first_food_logged','first_workout_completed','first_condition_added','first_episode_logged','pricing_viewed','upgrade_clicked','checkout_started','checkout_completed','premium_activated','patterns_paywall_viewed','outlook_paywall_viewed','experiment_limit_reached'));
create index product_events_owner_milestone_idx on public.product_events(user_id,event_name);

-- Establish the rollout baseline; never announce existing accounts or memberships.
-- Conservatively include canceled/incomplete subscriptions: historical payment
-- cannot be reconstructed from this current-state projection alone.
insert into public.product_events(user_id,event_name)
select id,'signup_completed' from public.profiles p where not exists(select 1 from public.product_events e where e.user_id=p.id and e.event_name='signup_completed');
insert into public.product_events(user_id,event_name)
select user_id,'premium_activated' from public.subscriptions s where stripe_subscription_id is not null and not exists(select 1 from public.product_events e where e.user_id=s.user_id and e.event_name='premium_activated');
insert into public.product_events(user_id,event_name)
select distinct user_id,'first_health_event' from public.health_events h where not exists(select 1 from public.product_events e where e.user_id=h.user_id and e.event_name='first_health_event');
insert into public.product_events(user_id,event_name)
select distinct user_id,'first_daily_checkin' from public.daily_checkins d where not exists(select 1 from public.product_events e where e.user_id=d.user_id and e.event_name='first_daily_checkin');

-- Use the existing event store. Serialize claims across retries and concurrent
-- webhook deliveries without altering any authentication/billing writes.
create function public.claim_product_milestone(target_user uuid, milestone text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if milestone not in ('signup_completed','premium_activated','first_health_event','first_daily_checkin') or milestone is null then
    raise exception 'INVALID_MILESTONE';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_user::text || ':' || milestone, 0));
  if not exists(select 1 from auth.users where id=target_user) or exists(select 1 from public.account_deletions where user_id=target_user) then return false; end if;
  if exists(select 1 from public.product_events where user_id=target_user and event_name=milestone) then return false; end if;
  if milestone='signup_completed' and not exists(select 1 from public.profiles where id=target_user) then return false; end if;
  if milestone='first_health_event' and (select count(*) from public.health_events where user_id=target_user)<>1 then return false; end if;
  if milestone='first_daily_checkin' and (select count(*) from public.daily_checkins where user_id=target_user)<>1 then return false; end if;
  insert into public.product_events(user_id,event_name) values(target_user,milestone);
  return true;
end $$;
revoke all on function public.claim_product_milestone(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_product_milestone(uuid,text) to service_role;
commit;
