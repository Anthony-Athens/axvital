-- READ ONLY: run BEFORE applying 003 as an authorized schema reviewer.
-- Expected result: ZERO rows. An absent user_insights is the only optional source.
with contract(name,owner_column,parent,delete_action,optional) as (values
 ('profiles','id','auth.users','c',false),
 ('daily_checkins','user_id','auth.users','c',false),
 ('health_events','user_id','auth.users','c',false),
 ('weekly_recaps','user_id','auth.users','c',false),
 ('planned_activities','user_id','auth.users','c',false),
 ('planned_activity_occurrences','user_id','auth.users','c',false),
 ('protocol_templates','user_id','auth.users','c',false),
 ('protocol_template_activities','user_id','auth.users','c',false),
 ('user_protocols','user_id','auth.users','c',false),
 ('user_protocol_activities','user_id','auth.users','c',false),
 ('protocol_pause_periods','user_id','auth.users','c',false),
 ('workout_templates','user_id','auth.users','c',false),
 ('workout_template_groups','user_id','auth.users','c',false),
 ('workout_template_exercises','user_id','auth.users','c',false),
 ('workout_template_sets','user_id','auth.users','c',false),
 ('planned_workouts','user_id','auth.users','c',false),
 ('planned_workout_exercises','user_id','auth.users','c',false),
 ('planned_workout_sets','user_id','auth.users','c',false),
 ('workout_sessions','user_id','auth.users','c',false),
 ('workout_session_exercises','user_id','auth.users','c',false),
 ('workout_session_sets','user_id','auth.users','c',false),
 ('user_conditions','user_id','auth.users','c',false),
 ('user_symptoms','user_id','auth.users','c',false),
 ('user_symptom_events','user_id','auth.users','c',false),
 ('experiments','user_id','auth.users','c',false),
 ('experiment_phase_events','user_id','auth.users','c',false),
 ('experiment_measurements','user_id','auth.users','c',false),
 ('user_foods','user_id','auth.users','c',false),
 ('nutrition_entries','user_id','auth.users','c',false),
 ('user_food_preferences','user_id','auth.users','c',false),
 ('saved_meals','user_id','auth.users','c',false),
 ('nutrition_targets','user_id','auth.users','c',false),
 ('condition_episodes','user_id','auth.users','c',false),
 ('episode_updates','user_id','auth.users','c',false),
 ('subscriptions','user_id','auth.users','c',false),
 ('exercises','user_id','auth.users','c',false),
 ('user_insights','user_id','auth.users','c',true),
 ('nutrition_entry_items','nutrition_entry_id','public.nutrition_entries','c',false),
 ('saved_meal_items','saved_meal_id','public.saved_meals','c',false),
 ('symptom_event_conditions','symptom_event_id','public.user_symptom_events','c',false),
 ('experiment_interventions','experiment_id','public.experiments','c',false),
 ('experiment_outcomes','experiment_id','public.experiments','c',false),
 ('experiment_condition_links','experiment_id','public.experiments','c',false),
 ('experiment_results','experiment_id','public.experiments','c',false),
 ('episode_symptom_links','condition_episode_id','public.condition_episodes','c',false),
 ('product_events','user_id','auth.users','n',false),
 ('api_request_budgets','user_id','auth.users','c',false)
), inspected as (
 select m.*,c.oid,c.relkind,c.relrowsecurity,a.attnum,a.atttypid,p.oid parent_oid,pa.attnum parent_att
 from contract m left join pg_class c on c.oid=to_regclass('public.'||m.name)
 left join pg_attribute a on a.attrelid=c.oid and a.attname=m.owner_column and not a.attisdropped
 left join pg_class p on p.oid=to_regclass(m.parent)
 left join pg_attribute pa on pa.attrelid=p.oid and pa.attname='id' and not pa.attisdropped
), issues as (
 select name,case when oid is null then 'MISSING_REQUIRED_TABLE'
 when relkind not in ('r','p') or (not relrowsecurity and name<>'user_insights') then 'TABLE_OR_RLS_REQUIRED'
 when attnum is null or atttypid<>'uuid'::regtype then 'OWNERSHIP_COLUMN_REQUIRED'
 when not exists(select 1 from pg_constraint fk where fk.conrelid=i.oid and fk.confrelid=i.parent_oid and fk.contype='f' and fk.convalidated and fk.conkey=array[i.attnum] and fk.confkey=array[i.parent_att] and fk.confdeltype::text=i.delete_action) then 'OWNERSHIP_FK_ACTION_REQUIRED' end issue
 from inspected i where oid is not null or not optional
)
select * from issues where issue is not null
union all
select name,'EXPORT_SELECT_ACCESS_REQUIRED'
from inspected i where oid is not null and name not in ('product_events','api_request_budgets')
and (not has_table_privilege('authenticated',oid,'SELECT') or not exists(
 select 1 from pg_policy pol where pol.polrelid=i.oid and pol.polpermissive and pol.polcmd in ('r','*')
 and (0=any(pol.polroles) or (select oid from pg_roles where rolname='authenticated')=any(pol.polroles))))
union all
select child.relname::text,'UNREVIEWED_INCOMING_FK'
from pg_constraint fk join pg_class child on child.oid=fk.conrelid join pg_namespace ns on ns.oid=child.relnamespace
where fk.contype='f' and ns.nspname='public'
and not exists(select 1 from contract m where m.name=child.relname)
and child.relname not in ('account_deletions','billing_customer_provisions')
and (fk.confrelid='auth.users'::regclass or exists(select 1 from contract m where to_regclass('public.'||m.name)=fk.confrelid))
union all
select 'subscriptions','OPERATIONAL_COLUMN_REQUIRED'
where not exists(select 1 from pg_attribute where attrelid=to_regclass('public.subscriptions') and attname='stripe_customer_id' and not attisdropped and atttypid='text'::regtype)
order by name;
-- Also run sprint12b_inventory.sql; review every unexpected public incoming FK,
-- Storage ownership and any custom DELETE triggers before applying the migration.
