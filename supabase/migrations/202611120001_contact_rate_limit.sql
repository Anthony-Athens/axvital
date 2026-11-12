begin;
-- Unauthenticated contact form budget. Buckets are opaque keys computed by the
-- server (an HMAC of the client IP, or 'global'); raw IPs are never stored.
create table public.contact_rate_limits (
 bucket text primary key check(char_length(bucket) between 1 and 128),
 window_start timestamptz not null,
 requests integer not null check(requests > 0)
);
alter table public.contact_rate_limits enable row level security;
revoke all on public.contact_rate_limits from public,anon,authenticated;

-- Returns true when the request fits both the per-sender and the global window.
create function public.axvital_consume_contact_budget(sender_bucket text)
returns boolean language plpgsql security definer set search_path='' as $$
declare sender_used integer; global_used integer;
begin
 if sender_bucket is null or char_length(sender_bucket) not between 1 and 128 or sender_bucket = 'global' then
  raise exception 'INVALID_BUCKET';
 end if;
 -- Per sender: 3 messages per 10 minutes.
 insert into public.contact_rate_limits as b(bucket,window_start,requests)
 values(sender_bucket,clock_timestamp(),1)
 on conflict (bucket) do update
 set window_start=case when b.window_start > clock_timestamp()-interval '10 minutes' then b.window_start else clock_timestamp() end,
 requests=case when b.window_start > clock_timestamp()-interval '10 minutes' then least(b.requests+1,4) else 1 end
 returning requests into sender_used;
 if sender_used > 3 then return false; end if;
 -- Everyone together: 30 messages per hour, so rotating IPs cannot flood the inbox.
 insert into public.contact_rate_limits as b(bucket,window_start,requests)
 values('global',clock_timestamp(),1)
 on conflict (bucket) do update
 set window_start=case when b.window_start > clock_timestamp()-interval '1 hour' then b.window_start else clock_timestamp() end,
 requests=case when b.window_start > clock_timestamp()-interval '1 hour' then least(b.requests+1,31) else 1 end
 returning requests into global_used;
 -- Old sender rows are tiny; clear expired ones opportunistically.
 delete from public.contact_rate_limits where bucket <> 'global' and window_start < clock_timestamp()-interval '1 day';
 return global_used <= 30;
end $$;
revoke all on function public.axvital_consume_contact_budget(text) from public,anon,authenticated;
grant execute on function public.axvital_consume_contact_budget(text) to service_role;
commit;
