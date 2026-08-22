create table public.subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 stripe_customer_id text unique,
 stripe_subscription_id text unique,
 plan text not null default 'free' check(plan in('free','premium')),
 status text not null default 'inactive' check(status in('active','trialing','past_due','canceled','incomplete','incomplete_expired','unpaid','paused','inactive')),
 stripe_price_id text,
 current_period_start timestamptz,
 current_period_end timestamptz,
 cancel_at_period_end boolean not null default false,
 trial_start timestamptz,
 trial_end timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id)
);
create table public.stripe_webhook_events (
 stripe_event_id text primary key,
 event_type text not null,
 processed_at timestamptz not null default now()
);
create table public.product_events (
 id bigint generated always as identity primary key,
 user_id uuid references auth.users(id) on delete set null,
 event_name text not null check(event_name in('signup_completed','onboarding_completed','first_daily_checkin','first_symptom_logged','first_food_logged','first_workout_completed','first_condition_added','first_episode_logged','pricing_viewed','upgrade_clicked','checkout_started','checkout_completed','premium_activated','patterns_paywall_viewed','outlook_paywall_viewed','experiment_limit_reached')),
 occurred_at timestamptz not null default now()
);
create index subscriptions_user_status_idx on public.subscriptions(user_id,status);
create index subscriptions_customer_idx on public.subscriptions(stripe_customer_id) where stripe_customer_id is not null;
create trigger subscriptions_set_updated_at before update on public.subscriptions for each row execute function public.axvital_planning_set_updated_at();
alter table public.subscriptions enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.product_events enable row level security;
create policy "Users read own subscription" on public.subscriptions for select to authenticated using(user_id=(select auth.uid()));
-- No insert/update/delete policies: Stripe-authoritative writes use the server service role.
-- No user policies on webhook events: this operational table is service-role only.
-- Product events are written through an allowlisted first-party server endpoint only.
