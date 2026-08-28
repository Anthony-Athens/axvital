-- READ ONLY. Run as an authorized schema auditor before reviewing/applying 13A.2.
-- No owner IDs, hypotheses, notes, food names or observation payloads are emitted.
-- Missing required tables fail closed in aggregate queries; metadata still identifies drift.
begin transaction read only;
-- Migration-history access is not portable across audit roles. This mandatory
-- separate CLI check avoids aborting this transaction on an inaccessible schema.
-- From the linked project run: npx supabase migration list
-- Compare EVERY local/remote version through 202608270005, not just the last row.
select 'REQUIRED_SEPARATE_VERIFICATION' as migration_history_status,
 'npx supabase migration list: verify local/remote parity through 202608270005 before 13A.2' as requirement;

-- Exact names used by migration 001's DROP CONSTRAINT statements. An absent
-- expected name is a blocker even if a differently named equivalent exists.
with expected(table_name,constraint_name) as (values
 ('nutrition_targets','nutrition_targets_target_value_check'),
 ('experiment_interventions','experiment_interventions_intervention_type_check'),
 ('experiment_outcomes','experiment_outcomes_outcome_type_check'))
select e.*,case when c.oid is null then 'MISSING_OR_NAME_MISMATCH' else 'PRESENT_REVIEW_DEFINITION' end as status,
 c.convalidated,pg_get_constraintdef(c.oid) as definition
from expected e left join pg_constraint c on c.conrelid=to_regclass('public.'||e.table_name) and c.conname=e.constraint_name
order by e.table_name;
-- Include all candidate checks so mismatched deployed names/semantics are visible.
select c.conrelid::regclass as table_name,c.conname,pg_get_constraintdef(c.oid) as definition
from pg_constraint c where c.contype='c' and c.conrelid in
 (to_regclass('public.nutrition_targets'),to_regclass('public.experiment_interventions'),to_regclass('public.experiment_outcomes'))
order by 1,2;

-- Valid, immediate, non-partial unique keys usable as composite FK parents.
-- New 13A.2 parents are explicitly not required before migration 001.
with expected(table_name,new_in_13a2) as (values
 ('experiments',false),('user_symptoms',false),('nutrition_patterns',true),('target_rules',true),
 ('planned_activities',false),('user_protocols',false),('protocol_templates',false),('protocol_template_activities',false)),
 keys as (
 select i.indrelid,i.indexrelid,array_agg(a.attname::text order by k.ordinality) as columns
 from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,ordinality)
 join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
 where i.indisunique and i.indisvalid and i.indimmediate and i.indpred is null and i.indexprs is null and k.ordinality<=i.indnkeyatts
 group by i.indrelid,i.indexrelid)
select e.*,case when to_regclass('public.'||e.table_name) is null and e.new_in_13a2 then 'NOT_CREATED_YET'
 when k.indexrelid is null then 'MISSING_REQUIRED_COMPOSITE_KEY' else 'PRESENT' end as status,
 k.indexrelid::regclass as supporting_index
from expected e left join keys k on k.indrelid=to_regclass('public.'||e.table_name) and k.columns=array['id','user_id']::text[]
order by e.table_name;

-- Internal FK triggers are included; enabled state, implementation and ownership
-- matter for deletion/billing as well as ordinary domain writes.
select n.nspname as schema_name,c.relname as table_name,t.tgname,t.tgenabled,t.tgisinternal,
 pg_get_triggerdef(t.oid) as definition,p.oid::regprocedure as function,
 p.prosecdef,pg_get_userbyid(p.proowner) as function_owner
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid
where (n.nspname='auth' and c.relname='users') or (n.nspname='public' and c.relname in
 ('experiments','experiment_interventions','experiment_outcomes','experiment_condition_links','experiment_phase_events',
 'experiment_measurements','experiment_results','experiment_start_snapshots','nutrition_targets','nutrition_entries',
 'nutrition_entry_items','user_symptom_events','subscriptions','profiles'))
order by n.nspname,c.relname,t.tgname;
select n.nspname as schema_name,c.relname as table_name,x.relname as index_name,i.indisunique,i.indisvalid,i.indimmediate,
 pg_get_indexdef(i.indexrelid) as definition,pg_get_expr(i.indpred,i.indrelid) as predicate
from pg_index i join pg_class c on c.oid=i.indrelid join pg_class x on x.oid=i.indexrelid
join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in
 ('experiments','experiment_interventions','experiment_outcomes','experiment_measurements','nutrition_targets',
 'user_symptoms','nutrition_patterns','target_rules','experiment_start_snapshots') order by c.relname,x.relname;

select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public' and table_name in (
 'experiments','experiment_interventions','experiment_outcomes','experiment_measurements','experiment_results','experiment_phase_events','experiment_condition_links',
 'nutrition_targets','nutrition_entries','nutrition_entry_items','foods','food_categories','food_servings','user_foods',
 'planned_activities','user_protocols','user_protocol_activities','user_conditions','user_symptoms','user_symptom_events','exercises','workout_sessions','workout_session_exercises','workout_session_sets')
order by table_name,ordinal_position;
select c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) as table_owner from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p') order by c.relname;
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname;
select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' order by table_name,grantee,privilege_type;
select c.conrelid::regclass as child,c.confrelid::regclass as parent,c.conname,c.convalidated,c.confdeltype,
 pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_namespace n on n.oid=c.connamespace
where n.nspname='public' and c.contype='f' order by c.conrelid::regclass::text,c.conname;
select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,p.prosecdef,p.proacl,pg_get_userbyid(p.proowner) as function_owner
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and (p.proname like 'axvital_%account%' or p.proname like 'axvital_%deletion%' or p.proname in
 ('transition_experiment','axvital_consume_api_budget','axvital_reserve_billing_customer','axvital_begin_account_deletion')) order by p.proname;
select * from public.axvital_account_schema_issues(true);
select status,current_phase,study_design,count(*) as experiments from public.experiments group by 1,2,3 order by 1,2,3;
select count(*) filter(where interventions<>1) as not_one_intervention,
 count(*) filter(where primary_interventions<>1) as not_one_primary_intervention,
 count(*) filter(where primary_outcomes<>1) as not_one_primary_outcome from (
 select e.id,(select count(*) from public.experiment_interventions i where i.experiment_id=e.id) interventions,
 (select count(*) from public.experiment_interventions i where i.experiment_id=e.id and i.is_primary) primary_interventions,
 (select count(*) from public.experiment_outcomes o where o.experiment_id=e.id and o.outcome_role='primary') primary_outcomes
 from public.experiments e) counts;
select intervention_type,count(*) as rows,count(*) filter(where num_nonnulls(linked_planned_activity_id,linked_user_protocol_id,linked_workout_template_id)=0) as without_entity_reference
from public.experiment_interventions group by 1 order by 1;
select outcome_type,count(*) as rows,count(*) filter(where symptom_id is null and user_condition_id is null) as without_catalog_or_condition_target
from public.experiment_outcomes group by 1 order by 1;
select count(*) as mismatched_measurement_parent from public.experiment_measurements m join public.experiment_outcomes o on o.id=m.experiment_outcome_id where m.experiment_id<>o.experiment_id;
select count(*) as cross_owner_intervention_links from public.experiment_interventions i join public.experiments e on e.id=i.experiment_id
left join public.planned_activities a on a.id=i.linked_planned_activity_id left join public.user_protocols p on p.id=i.linked_user_protocol_id
left join public.workout_templates w on w.id=i.linked_workout_template_id
where a.user_id<>e.user_id or p.user_id<>e.user_id or w.user_id<>e.user_id;
select count(*) as cross_owner_condition_outcomes from public.experiment_outcomes o join public.experiments e on e.id=o.experiment_id
join public.user_conditions c on c.id=o.user_condition_id where c.user_id<>e.user_id;
select count(*) as nutrition_items,count(*) filter(where calories is null) as calories_unknown,
 count(*) filter(where protein_grams is null) as protein_unknown,count(*) filter(where fiber_grams is null) as fiber_unknown
from public.nutrition_entry_items;
select count(*) as sets,count(*) filter(where actual_weight is null) as load_unknown,
 count(*) filter(where actual_reps is null) as repetitions_unknown,
 count(*) filter(where actual_weight<0 or actual_reps<0) as negative_values from public.workout_session_sets;
-- Units are NOT inferred by this script. Separately verify the historical unit convention.
rollback;
