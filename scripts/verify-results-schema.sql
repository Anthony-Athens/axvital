-- READ-ONLY verification, NOT a migration. Run only after the owner explicitly
-- designates the linked environment. Returns catalog metadata, no health records.
begin transaction read only;
select current_database() as database_name, current_user as verification_role;
select required.name, to_regclass('public.'||required.name) is not null as present
from (values ('experiments'),('experiment_start_snapshots'),('experiment_phase_events'),('experiment_evidence_captures')) required(name);
select c.relname,c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('experiment_evidence_captures','experiment_start_snapshots','experiment_phase_events');
select tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('experiment_evidence_captures','experiment_start_snapshots','experiment_phase_events');
select required.signature,to_regprocedure(required.signature) is not null as present
from (values ('public.capture_experiment_evidence_v1(uuid,integer,integer)'),('public.axvital_experiment_capture_input(uuid,timestamp with time zone)'),('public.transition_experiment_v2(uuid,integer,text)'),('public.axvital_evidence_immutable()')) required(signature);
select p.proname,p.prosecdef as security_definer,p.provolatile,p.proconfig,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and p.proname in ('capture_experiment_evidence_v1','axvital_experiment_capture_input','transition_experiment_v2','axvital_evidence_immutable');
select c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='experiment_evidence_captures' and not t.tgisinternal;
select table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='experiment_evidence_captures';
rollback;
-- Presence does not prove behavior: verify owner/foreign/anonymous access,
-- immutability, lifecycle conflicts, and capture replay with approved fixtures.
