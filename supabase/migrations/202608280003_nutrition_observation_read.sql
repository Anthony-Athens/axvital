-- 13A.3B: fixed-purpose coherent read only. No new private tables or writes.
begin;
create function public.read_nutrition_observations_v1(start_date date,end_date_exclusive date,analysis_timezone text,evaluation_cutoff timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' set statement_timeout='10s' as $$
declare owner_id uuid:=auth.uid(); start_at timestamptz; end_at timestamptz; result jsonb;
begin
 if owner_id is null then raise exception 'AUTH_REQUIRED';end if;
 if start_date is null or end_date_exclusive is null or end_date_exclusive-start_date not between 1 and 366
 or analysis_timezone is null or not exists(select 1 from pg_timezone_names where name=analysis_timezone)
 or evaluation_cutoff is null or not isfinite(evaluation_cutoff) or evaluation_cutoff>now()
 then raise exception 'INVALID_WINDOW';end if;
 if start_date>(evaluation_cutoff at time zone analysis_timezone)::date or end_date_exclusive>(evaluation_cutoff at time zone analysis_timezone)::date+1 then raise exception 'INVALID_WINDOW';end if;
 start_at:=start_date::timestamp at time zone analysis_timezone;
 end_at:=end_date_exclusive::timestamp at time zone analysis_timezone;
 if (start_at at time zone analysis_timezone)::date<>start_date or (end_at at time zone analysis_timezone)::date<>end_date_exclusive then raise exception 'NONEXISTENT_LOCAL_DATE';end if;
 -- One SELECT snapshot covers roots, snapshots and logging coverage. All CTEs
 -- are bounded; a reached cap is explicitly incomplete, never a confident sum.
 with entries as materialized (
  -- Coarse indexed bounds plus exact logical-date predicates preserve the first
  -- occurrence of repeated midnight (Postgres AT TIME ZONE alone chooses the
  -- later offset). Evaluation cutoff remains a strict half-open instant bound.
  select id,user_id,consumed_at from public.nutrition_entries where user_id=owner_id and deleted_at is null
  and consumed_at>=start_at-interval '1 day' and consumed_at<end_at+interval '1 day' and consumed_at<evaluation_cutoff
  and (consumed_at at time zone analysis_timezone)::date>=start_date and (consumed_at at time zone analysis_timezone)::date<end_date_exclusive
  order by consumed_at,id limit 1000
 ), items as materialized (
  select i.id,i.nutrition_entry_id,i.calories,i.protein_grams,i.carbohydrate_grams,i.fat_grams,i.fiber_grams,i.caffeine_mg,i.alcohol_grams
  from public.nutrition_entry_items i join entries e on e.id=i.nutrition_entry_id order by i.id limit 1000
 ), coverage as materialized (
  select local_date,time_zone,coverage_status,confirmed_at,revision from public.nutrition_log_days
  where user_id=owner_id and local_date>=start_date and local_date<end_date_exclusive and time_zone=analysis_timezone order by local_date limit 366
 ) select jsonb_build_object('version',1,'entries',coalesce((select jsonb_agg(to_jsonb(e) order by consumed_at,id) from entries e),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by id) from items i),'[]'::jsonb),
 'coverage',coalesce((select jsonb_agg(to_jsonb(c) order by local_date) from coverage c),'[]'::jsonb),
 'truncated',(select count(*)>=1000 from entries) or (select count(*)>=1000 from items)) into result;
 return result;
end $$;
revoke all on function public.read_nutrition_observations_v1(date,date,text,timestamptz) from public,anon;
grant execute on function public.read_nutrition_observations_v1(date,date,text,timestamptz) to authenticated;
comment on function public.read_nutrition_observations_v1(date,date,text,timestamptz) is 'Bounded current-record Nutrition snapshots and coverage in one read snapshot; caller RLS, no writes, catalogs or arbitrary metric selection.';
commit;
