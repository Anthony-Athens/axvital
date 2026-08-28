-- Existing target_rules/pattern persistence and RLS are sufficient.
-- Register management budgets and filter experiment choices to the supported subset.
begin;
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('public.axvital_consume_api_budget(text)'::regprocedure);
 if position('http/nutrition/goals:GET' in definition)=0 then
  if position('else null end;' in definition)=0 then raise exception 'GOALS_BUDGET_PATCH_MISMATCH';end if;
  definition:=replace(definition,'else null end;','when ''http/nutrition/goals:GET'' then 40 when ''http/nutrition/goals:POST'' then 20 else null end;');
  execute definition;
 end if;
 definition:=pg_get_functiondef('public.discover_experiment_targets_v1(text,text,uuid,integer,uuid[])'::regprocedure);
 if position('r.definition->>''kind''=''numeric''' in definition)=0 then
  if position('r.id,r.name,''rule_id'',r.archived_at is null' in definition)=0 then raise exception 'GOALS_DISCOVERY_PATCH_MISMATCH';end if;
  definition:=replace(definition,'r.id,r.name,''rule_id'',r.archived_at is null',
   'r.id,r.name,''rule_id'',(r.archived_at is null and r.definition->>''kind''=''numeric'' and r.definition->>''metric'' in(''calories'',''protein_grams'',''carbohydrate_grams'',''fat_grams'',''fiber_grams''))');
  execute definition;
 end if;
end $patch$;
commit;
