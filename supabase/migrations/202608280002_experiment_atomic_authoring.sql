-- Sprint 13A.2 transactional authoring. No wizard, source readers or evaluators.
begin;

create function public.axvital_outcome_target_label(o jsonb,owner_id uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare target_label text;condition_label text;
begin
 if o->>'user_condition_id' is not null then select coalesce(s.custom_condition_name,c.name) into condition_label from public.user_conditions s left join public.conditions c on c.id=s.condition_id where s.id=(o->>'user_condition_id')::uuid and s.user_id=owner_id;end if;
 if o->>'user_symptom_id' is not null then select coalesce(s.custom_symptom_name,c.name) into target_label from public.user_symptoms s left join public.symptoms c on c.id=s.symptom_id where s.id=(o->>'user_symptom_id')::uuid and s.user_id=owner_id;
 elsif o->>'symptom_id' is not null then select name into target_label from public.symptoms where id=(o->>'symptom_id')::uuid;
 elsif o->>'exercise_id' is not null then select name into target_label from public.exercises where id=(o->>'exercise_id')::uuid and (user_id is null or user_id=owner_id);end if;
 return nullif(concat_ws(' / ',target_label,condition_label),'');
end $$;
revoke all on function public.axvital_outcome_target_label(jsonb,uuid) from public,anon,authenticated;

create function public.axvital_validate_outcome_input(o jsonb,owner_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
<<target_values>>
declare d jsonb;c jsonb;v numeric;condition_id uuid;symptom_id uuid;user_symptom_id uuid;exercise_id uuid;
begin
 if not public.axvital_json_keys(o,array['registry_key','registry_version','outcome_role','aggregation_method','expected_direction','source_config'],array['user_condition_id','symptom_id','user_symptom_id','exercise_id','success_criterion']) then raise exception 'INVALID_OUTCOME';end if;
 if exists(select 1 from jsonb_each(o) where value='null'::jsonb) then raise exception 'INVALID_OUTCOME';end if;
 d:=public.axvital_outcome_definition(o->>'registry_key',(o->>'registry_version')::integer);
 if d is null or d->'enabled'<>'true'::jsonb or o->'registry_version'<>'1'::jsonb or o->>'outcome_role' not in('primary','secondary') or not (d->'aggregations' ? (o->>'aggregation_method')) or o->>'expected_direction' not in('increase','decrease','maintain','unknown') or o->'source_config'<>'{}'::jsonb then raise exception 'INVALID_OUTCOME';end if;
 condition_id:=(o->>'user_condition_id')::uuid;symptom_id:=(o->>'symptom_id')::uuid;user_symptom_id:=(o->>'user_symptom_id')::uuid;exercise_id:=(o->>'exercise_id')::uuid;
 if (o ? 'user_condition_id' and condition_id is null) or (o ? 'symptom_id' and symptom_id is null) or (o ? 'user_symptom_id' and user_symptom_id is null) or (o ? 'exercise_id' and exercise_id is null) then raise exception 'INVALID_TARGET';end if;
 if d->>'target'='none' and num_nonnulls(condition_id,symptom_id,user_symptom_id,exercise_id)<>0
 or d->>'target'='condition' and (condition_id is null or num_nonnulls(symptom_id,user_symptom_id,exercise_id)<>0)
 or d->>'target'='symptom' and (num_nonnulls(symptom_id,user_symptom_id)<>1 or exercise_id is not null)
 or d->>'target'='exercise' and (exercise_id is null or num_nonnulls(condition_id,symptom_id,user_symptom_id)<>0) then raise exception 'INVALID_TARGET';end if;
 if condition_id is not null and not exists(select 1 from public.user_conditions s where s.id=target_values.condition_id and s.user_id=owner_id and s.archived_at is null) then raise exception 'INVALID_TARGET';end if;
 if symptom_id is not null and not exists(select 1 from public.symptoms s where s.id=target_values.symptom_id and s.is_active) then raise exception 'INVALID_TARGET';end if;
 if user_symptom_id is not null and not exists(select 1 from public.user_symptoms s where s.id=target_values.user_symptom_id and s.user_id=owner_id and s.is_active) then raise exception 'INVALID_TARGET';end if;
 if exercise_id is not null and not exists(select 1 from public.exercises s where s.id=target_values.exercise_id and (s.user_id is null or s.user_id=owner_id) and not s.is_archived) then raise exception 'INVALID_TARGET';end if;
 if o ? 'success_criterion' then
  c:=o->'success_criterion';
  if jsonb_typeof(c)<>'object' or exists(select 1 from jsonb_each(case when jsonb_typeof(c)='object' then c else '{}' end) where value='null'::jsonb) then raise exception 'INVALID_CRITERION';end if;
  if o->>'outcome_role'<>'primary' or c->'version' is distinct from '1'::jsonb then raise exception 'INVALID_CRITERION';end if;
  if c->>'kind'='change' then
   if not public.axvital_json_keys(c,array['version','kind','basis','direction','operator','amount','unit']) or c->>'basis' not in('absolute','percent') or c->>'direction' not in('increase','decrease') or c->>'operator'<>'gte' or jsonb_typeof(c->'amount')<>'number' or d->>'scale'='ordinal' or (c->>'basis'='percent' and d->>'scale'<>'ratio') or c->>'unit'<>(case when c->>'basis'='percent' then '%' else d->>'unit' end) then raise exception 'INVALID_CRITERION';end if;
   v:=(c->>'amount')::numeric;
  elsif c->>'kind'='target_value' then
   if not public.axvital_json_keys(c,array['version','kind','operator','value','unit']) or c->>'operator' not in('lte','gte','eq') or jsonb_typeof(c->'value')<>'number' or c->>'unit'<>d->>'unit' then raise exception 'INVALID_CRITERION';end if;
   v:=(c->>'value')::numeric;
   if d->>'scale'='rating' and v not between 1 and 10 or d->>'scale'='ordinal' and (trunc(v)<>v or v>4 or v<case when d->>'unit'='ordinal_4' then 1 else 0 end) then raise exception 'INVALID_CRITERION';end if;
  else raise exception 'INVALID_CRITERION';end if;
  if v is null or v not between 0 and 1000000 then raise exception 'INVALID_CRITERION';end if;
 end if;
 return d;
end $$;
revoke all on function public.axvital_validate_outcome_input(jsonb,uuid) from public,anon,authenticated;

create function public.axvital_intervention_configuration(i jsonb,owner_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare source_id uuid; configuration jsonb;members jsonb;field_name text;item_count integer;
begin
 field_name:=case i->>'intervention_type' when 'habit' then 'linked_planned_activity_id' when 'protocol' then 'linked_user_protocol_id' when 'workout' then 'linked_workout_template_id' when 'nutrition_target' then 'rule_id' when 'nutrition_pattern' then 'nutrition_pattern_id' end;
 if field_name is null or not public.axvital_json_keys(i,array['intervention_type',field_name]) then raise exception 'INVALID_INTERVENTION';end if;
 source_id:=(i->>field_name)::uuid;
 if i->>'intervention_type'='habit' then
  select jsonb_build_object('id',id,'name',title,'activity_type',activity_type,'tracking_type',tracking_type,'target_value',target_value,'target_unit',target_unit,'minimum_value',minimum_value,'allow_partial_completion',allow_partial_completion,'recurrence_type',recurrence_type,'days_of_week',days_of_week,'interval_days',interval_days,'start_date',start_date,'end_date',end_date,'scheduled_time',scheduled_time,'is_active',is_active) into configuration from public.planned_activities where id=source_id and user_id=owner_id and activity_type='habit';
 elsif i->>'intervention_type'='protocol' then
  select jsonb_build_object('id',id,'name',name,'status',status,'start_date',start_date,'end_date',end_date) into configuration from public.user_protocols where id=source_id and user_id=owner_id;
  if configuration is null then raise exception 'INVALID_INTERVENTION';end if;
  select count(*) into item_count from public.user_protocol_activities where user_protocol_id=source_id;
  if item_count=0 then raise exception 'EMPTY_PROTOCOL';end if;
  if item_count>50 then raise exception 'CONFIGURATION_TOO_LARGE';end if;
  if exists(select 1 from public.user_protocol_activities m join public.planned_activities a on a.id=m.planned_activity_id where m.user_protocol_id=source_id and (m.user_id<>owner_id or a.user_id<>owner_id)) then raise exception 'INVALID_INTERVENTION';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.title,'is_required',m.is_required,'sort_order',m.sort_order,'activity_type',a.activity_type,'tracking_type',a.tracking_type,'target_value',a.target_value,'target_unit',a.target_unit,'minimum_value',a.minimum_value,'allow_partial_completion',a.allow_partial_completion,'recurrence_type',a.recurrence_type,'days_of_week',a.days_of_week,'interval_days',a.interval_days,'scheduled_time',a.scheduled_time,'start_date',a.start_date,'end_date',a.end_date,'is_active',a.is_active) order by m.sort_order nulls last,m.id),'[]') into members
  from public.user_protocol_activities m join public.planned_activities a on a.id=m.planned_activity_id where m.user_protocol_id=source_id and m.user_id=owner_id and a.user_id=owner_id;
  configuration:=configuration||jsonb_build_object('members',members);
 elsif i->>'intervention_type'='workout' then
  select jsonb_build_object('id',id,'name',name,'updated_at',updated_at) into configuration from public.workout_templates where id=source_id and user_id=owner_id and not is_archived;
  if configuration is null then raise exception 'INVALID_INTERVENTION';end if;
  select count(*) into item_count from public.workout_template_sets s join public.workout_template_exercises e on e.id=s.workout_template_exercise_id where e.workout_template_id=source_id;
  if item_count>100 then raise exception 'CONFIGURATION_TOO_LARGE';end if;
  if (select count(*) from public.workout_template_exercises where workout_template_id=source_id)>50 then raise exception 'CONFIGURATION_TOO_LARGE';end if;
  if not exists(select 1 from public.workout_template_exercises where workout_template_id=source_id) then raise exception 'EMPTY_WORKOUT_TEMPLATE';end if;
  if exists(select 1 from public.workout_template_exercises e join public.workout_template_groups g on g.id=e.workout_template_group_id join public.exercises x on x.id=e.exercise_id where e.workout_template_id=source_id and (e.user_id<>owner_id or g.user_id<>owner_id or g.workout_template_id<>source_id or (x.user_id is not null and x.user_id<>owner_id))) then raise exception 'INVALID_INTERVENTION';end if;
  select coalesce(jsonb_agg(jsonb_build_object('exercise_id',e.exercise_id,'display_label',e.display_label,'tracking_type',e.tracking_type,'group_order',g.group_order,'group_type',g.group_type,'rounds',g.rounds,'rest_between_exercises_seconds',g.rest_between_exercises_seconds,'rest_after_group_seconds',g.rest_after_group_seconds,'exercise_order',e.exercise_order,'tempo',e.tempo,'rest_after_exercise_seconds',e.rest_after_exercise_seconds,'target_sets',e.target_sets,'target_reps_min',e.target_reps_min,'target_reps_max',e.target_reps_max,'target_weight',e.target_weight,'target_duration_seconds',e.target_duration_seconds,'target_distance',e.target_distance,'distance_unit',e.distance_unit,'prescription',
   (select coalesce(jsonb_agg(jsonb_build_object('set_number',s.set_number,'set_type',s.set_type,'target_reps',s.target_reps,'target_reps_min',s.target_reps_min,'target_reps_max',s.target_reps_max,'target_weight',s.target_weight,'target_duration_seconds',s.target_duration_seconds,'target_distance',s.target_distance,'distance_unit',s.distance_unit,'is_optional',s.is_optional) order by s.set_number),'[]') from public.workout_template_sets s where s.workout_template_exercise_id=e.id and s.user_id=owner_id)) order by g.group_order,e.exercise_order,e.id),'[]') into members
  from public.workout_template_exercises e join public.workout_template_groups g on g.id=e.workout_template_group_id where e.workout_template_id=source_id and e.user_id=owner_id;
  configuration:=configuration||jsonb_build_object('prescribed_exercises',members);
 elsif i->>'intervention_type'='nutrition_target' then
  select jsonb_build_object('id',id,'name',name,'definition',definition,'revision',revision) into configuration from public.target_rules where id=source_id and user_id=owner_id and archived_at is null and definition->>'domain'='nutrition';
 elsif i->>'intervention_type'='nutrition_pattern' then
  select jsonb_build_object('id',id,'name',name,'template_key',template_key,'template_version',template_version,'revision',revision) into configuration from public.nutrition_patterns where id=source_id and user_id=owner_id and archived_at is null;
  if configuration is null then raise exception 'INVALID_INTERVENTION';end if;
  if exists(select 1 from public.nutrition_pattern_rules m join public.target_rules r on r.id=m.rule_id where m.nutrition_pattern_id=source_id and (m.user_id<>owner_id or r.user_id<>owner_id or r.archived_at is not null or r.definition->>'domain'<>'nutrition')) then raise exception 'INVALID_INTERVENTION';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'definition',r.definition,'revision',r.revision,'display_order',m.display_order) order by m.display_order),'[]') into members from public.nutrition_pattern_rules m join public.target_rules r on r.id=m.rule_id where m.nutrition_pattern_id=source_id and m.user_id=owner_id and r.user_id=owner_id;
  if jsonb_array_length(members)=0 then raise exception 'EMPTY_PATTERN';end if;
  configuration:=configuration||jsonb_build_object('rules',members);
 end if;
 if configuration is null or configuration->>'id' is null then raise exception 'INVALID_INTERVENTION';end if;
 return configuration;
end $$;
revoke all on function public.axvital_intervention_configuration(jsonb,uuid) from public,anon,authenticated;


create function public.save_experiment_v2(target_id uuid,expected_revision integer,input jsonb) returns public.experiments language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();e public.experiments;i jsonb;o jsonb;d jsonb;source jsonb;question_text text;outcomes jsonb;intervention jsonb;date_field text;target_label text;
begin
 if owner_id is null then raise exception 'AUTH_REQUIRED';end if;
 if not public.axvital_consume_api_budget('experiments/draft:POST') then raise exception 'RATE_LIMITED';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,1302));
 if not public.axvital_json_keys(input,array['name'],array['question','question_is_custom','hypothesis','analysis_timezone','baseline_mode','baseline_start_date','baseline_end_date','intervention_start_date','intervention_end_date','intervention','outcomes']) or octet_length(input::text)>16384 or jsonb_typeof(input->'name')<>'string' then raise exception 'INVALID_DRAFT';end if;
 if (input ? 'question' and jsonb_typeof(input->'question')<>'string') or (input ? 'hypothesis' and jsonb_typeof(input->'hypothesis')<>'string') then raise exception 'INVALID_DRAFT';end if;
 foreach date_field in array array['baseline_start_date','baseline_end_date','intervention_start_date','intervention_end_date'] loop
  if input ? date_field and input->date_field<>'null'::jsonb and (jsonb_typeof(input->date_field)<>'string' or input->>date_field !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$') then raise exception 'INVALID_DATES';end if;
 end loop;
 if target_id is null then
  if expected_revision<>0 or expected_revision is null then raise exception 'REVISION_CONFLICT';end if;
 else
  select * into e from public.experiments where id=target_id and user_id=owner_id for update;
  if not found or e.model_version<>2 then raise exception 'EXPERIMENT_NOT_FOUND';end if;
  if e.status<>'draft' or exists(select 1 from public.experiment_start_snapshots where experiment_id=e.id) then raise exception 'STARTED_CONFIGURATION_IMMUTABLE';end if;
  if expected_revision is distinct from e.config_revision then raise exception 'REVISION_CONFLICT';end if;
 end if;
 outcomes:=coalesce(input->'outcomes','[]');intervention:=nullif(input->'intervention','null');
 if jsonb_typeof(outcomes)<>'array' or jsonb_array_length(outcomes)>4 or (select count(*) from jsonb_array_elements(outcomes) x where x->>'outcome_role'='primary')>1 then raise exception 'INVALID_OUTCOMES';end if;
 if intervention is not null then source:=public.axvital_intervention_configuration(intervention,owner_id);end if;
 for o in select * from jsonb_array_elements(outcomes) loop d:=public.axvital_validate_outcome_input(o,owner_id);end loop;
 if input ? 'analysis_timezone' and input->'analysis_timezone'<>'null'::jsonb and not exists(select 1 from pg_timezone_names where name=input->>'analysis_timezone') then raise exception 'INVALID_TIME_ZONE';end if;
 if input ? 'question_is_custom' and jsonb_typeof(input->'question_is_custom')<>'boolean' then raise exception 'INVALID_QUESTION';end if;
 select public.axvital_outcome_definition(x->>'registry_key',1) into d from jsonb_array_elements(outcomes) x where x->>'outcome_role'='primary';
 select public.axvital_outcome_target_label(x,owner_id) into target_label from jsonb_array_elements(outcomes) x where x->>'outcome_role'='primary';
 question_text:=case when source is not null and d is not null then 'Does '||(source->>'name')||' appear associated with a change in '||lower(d->>'label')||case when target_label is not null then ' for '||target_label else '' end||'?' else null end;
 if coalesce((input->>'question_is_custom')::boolean,false) then question_text:=input->>'question';if question_text is null or char_length(btrim(question_text))<10 then raise exception 'INVALID_QUESTION';end if;end if;
 if target_id is null then
  insert into public.experiments(user_id,model_version,name,hypothesis) values(owner_id,2,btrim(input->>'name'),coalesce(input->>'hypothesis',question_text,'Draft: structured configuration is incomplete.')) returning * into e;
 else
  delete from public.experiment_outcomes where experiment_id=e.id;
  delete from public.experiment_interventions where experiment_id=e.id;
 end if;
 update public.experiments set name=btrim(input->>'name'),hypothesis=coalesce(input->>'hypothesis',question_text,'Draft: structured configuration is incomplete.'),question=question_text,question_is_custom=coalesce((input->>'question_is_custom')::boolean,false),
 analysis_timezone=input->>'analysis_timezone',baseline_mode=input->>'baseline_mode',study_design=case when input->>'baseline_mode'='none' then 'intervention_only' else 'baseline_intervention' end,
 baseline_start_date=(input->>'baseline_start_date')::date,baseline_end_date=(input->>'baseline_end_date')::date,intervention_start_date=(input->>'intervention_start_date')::date,intervention_end_date=(input->>'intervention_end_date')::date,
 planned_start_date=case when input->>'baseline_mode'='prospective' then (input->>'baseline_start_date')::date else (input->>'intervention_start_date')::date end,planned_end_date=(input->>'intervention_end_date')::date,
 config_revision=case when target_id is null then 1 else config_revision+1 end where id=e.id returning * into e;
 if intervention is not null then
  insert into public.experiment_interventions(experiment_id,intervention_type,name,is_primary,linked_planned_activity_id,linked_user_protocol_id,linked_workout_template_id,rule_id,nutrition_pattern_id)
  values(e.id,intervention->>'intervention_type',source->>'name',true,(intervention->>'linked_planned_activity_id')::uuid,(intervention->>'linked_user_protocol_id')::uuid,(intervention->>'linked_workout_template_id')::uuid,(intervention->>'rule_id')::uuid,(intervention->>'nutrition_pattern_id')::uuid);
 end if;
 for o in select * from jsonb_array_elements(outcomes) loop
  d:=public.axvital_validate_outcome_input(o,owner_id);
  insert into public.experiment_outcomes(experiment_id,outcome_role,outcome_type,name,aggregation_method,expected_direction,unit,registry_key,registry_version,source_config,user_condition_id,symptom_id,user_symptom_id,exercise_id,success_criterion)
  values(e.id,o->>'outcome_role',d->>'legacyType',d->>'label',o->>'aggregation_method',o->>'expected_direction',d->>'unit',o->>'registry_key',1,'{}',(o->>'user_condition_id')::uuid,(o->>'symptom_id')::uuid,(o->>'user_symptom_id')::uuid,(o->>'exercise_id')::uuid,o->'success_criterion');
 end loop;
 insert into public.experiment_phase_events(experiment_id,user_id,event_type,from_status,from_phase,to_status,to_phase,metadata) values(e.id,owner_id,case when target_id is null then 'created' else 'configuration_changed' end,case when target_id is not null then 'draft' end,case when target_id is not null then 'planning' end,'draft','planning',jsonb_build_object('model_version',2,'config_revision',e.config_revision));
 return e;
end $$;

create function public.start_experiment_v2(target_id uuid,expected_revision integer) returns public.experiments language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();e public.experiments;i public.experiment_interventions;o public.experiment_outcomes;definition jsonb;input jsonb;source jsonb;configuration jsonb;outcomes jsonb:='[]';next_phase text;today date;old_status text;old_phase text;
begin
 if owner_id is null then raise exception 'AUTH_REQUIRED';end if;
 if not public.axvital_consume_api_budget('experiments/start:POST') then raise exception 'RATE_LIMITED';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,1302));
 select * into e from public.experiments where id=target_id and user_id=owner_id for update;
 if not found or e.model_version<>2 then raise exception 'EXPERIMENT_NOT_FOUND';end if;
 if e.config_revision is distinct from expected_revision then raise exception 'REVISION_CONFLICT';end if;
 if exists(select 1 from public.experiment_start_snapshots where experiment_id=e.id and config_revision=expected_revision) then return e;end if;
 if e.status<>'draft' then raise exception 'INVALID_TRANSITION';end if;
 if (select count(*) from public.experiment_interventions where experiment_id=e.id)<>1 or (select count(*) from public.experiment_interventions where experiment_id=e.id and is_primary)<>1 or (select count(*) from public.experiment_outcomes where experiment_id=e.id and outcome_role='primary')<>1 or (select count(*) from public.experiment_outcomes where experiment_id=e.id)>4 then raise exception 'EXPERIMENT_CONFIGURATION_INCOMPLETE';end if;
 if e.analysis_timezone is null or not exists(select 1 from pg_timezone_names where name=e.analysis_timezone) then raise exception 'INVALID_TIME_ZONE';end if;
 today:=(now() at time zone e.analysis_timezone)::date;
 if e.baseline_mode is null or e.intervention_start_date is null or e.intervention_end_date is null or e.intervention_end_date<e.intervention_start_date or e.intervention_end_date-e.intervention_start_date>365 then raise exception 'INVALID_DATES';end if;
 if e.baseline_mode='none' then
  if e.baseline_start_date is not null or e.baseline_end_date is not null or e.study_design<>'intervention_only' then raise exception 'INVALID_DATES';end if;
 else
  if e.baseline_start_date is null or e.baseline_end_date is null or e.baseline_end_date<e.baseline_start_date or e.baseline_end_date>=e.intervention_start_date or e.baseline_end_date-e.baseline_start_date>365 or e.study_design<>'baseline_intervention' then raise exception 'INVALID_DATES';end if;
 end if;
 if (e.baseline_mode in('historical','none') and e.intervention_start_date<>today) or (e.baseline_mode='prospective' and e.baseline_start_date<>today) then raise exception 'START_DATE_MUST_BE_TODAY';end if;
 select * into i from public.experiment_interventions where experiment_id=e.id;
 input:=jsonb_strip_nulls(jsonb_build_object('intervention_type',i.intervention_type,'linked_planned_activity_id',i.linked_planned_activity_id,'linked_user_protocol_id',i.linked_user_protocol_id,'linked_workout_template_id',i.linked_workout_template_id,'rule_id',i.rule_id,'nutrition_pattern_id',i.nutrition_pattern_id));
 source:=public.axvital_intervention_configuration(input,owner_id);
 for o in select * from public.experiment_outcomes where experiment_id=e.id order by outcome_role,display_order,id loop
  -- Lock shared exercise/catalog rows as well as the per-owner source mutation lock.
  if o.exercise_id is not null then perform 1 from public.exercises where id=o.exercise_id for share;end if;
  if o.symptom_id is not null then perform 1 from public.symptoms where id=o.symptom_id for share;end if;
  input:=jsonb_strip_nulls(jsonb_build_object('registry_key',o.registry_key,'registry_version',o.registry_version,'outcome_role',o.outcome_role,'aggregation_method',o.aggregation_method,'expected_direction',o.expected_direction,'source_config',o.source_config,'user_condition_id',o.user_condition_id,'symptom_id',o.symptom_id,'user_symptom_id',o.user_symptom_id,'exercise_id',o.exercise_id,'success_criterion',o.success_criterion));
  definition:=public.axvital_validate_outcome_input(input,owner_id);
  outcomes:=outcomes||jsonb_build_array(input||jsonb_build_object('id',o.id,'definition',definition,'target_label',public.axvital_outcome_target_label(input,owner_id)));
 end loop;
 if e.question is null or char_length(btrim(e.question))<10 then raise exception 'QUESTION_REQUIRED';end if;
 configuration:=jsonb_build_object('model_version',2,'question',e.question,'question_is_custom',e.question_is_custom,'intervention',jsonb_build_object('type',i.intervention_type,'configuration',source),'outcomes',outcomes,'analysis_timezone',e.analysis_timezone,'baseline_mode',e.baseline_mode,'baseline_start_date',e.baseline_start_date,'baseline_end_date',e.baseline_end_date,'intervention_start_date',e.intervention_start_date,'intervention_end_date',e.intervention_end_date);
 if octet_length(configuration::text)>65536 then raise exception 'CONFIGURATION_TOO_LARGE';end if;
 next_phase:=case when e.baseline_mode='prospective' then 'baseline' else 'intervention' end;old_status:=e.status;old_phase:=e.current_phase;
 -- Update before snapshot insert; transaction makes them indivisible. Future updates are guarded.
 update public.experiments set status='active',current_phase=next_phase,actual_started_at=now() where id=e.id returning * into e;
 -- Intervention-source fingerprint only: canonical PostgreSQL JSONB text of the
 -- selective source object, with explicitly ordered member/prescription arrays.
 -- Excludes experiment question, outcomes, dates, timezone and runtime state.
 -- MD5 is a change marker, never an authorization or integrity/security primitive.
 insert into public.experiment_start_snapshots(user_id,experiment_id,config_revision,snapshot_version,configuration,source_fingerprint) values(owner_id,e.id,e.config_revision,1,configuration,md5(source::text));
 insert into public.experiment_phase_events(experiment_id,user_id,event_type,from_status,to_status,from_phase,to_phase,metadata) values(e.id,owner_id,case when next_phase='baseline' then 'baseline_started' else 'intervention_started' end,old_status,'active',old_phase,next_phase,jsonb_build_object('model_version',2,'config_revision',e.config_revision));
 return e;
end $$;
revoke all on function public.save_experiment_v2(uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function public.start_experiment_v2(uuid,integer) from public,anon,authenticated;
grant execute on function public.save_experiment_v2(uuid,integer,jsonb) to authenticated;
grant execute on function public.start_experiment_v2(uuid,integer) to authenticated;
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
  when 'experiments/draft:POST' then 20 when 'experiments/start:POST' then 6 when 'nutrition/pattern:POST' then 12
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
create function public.create_nutrition_pattern(input jsonb) returns public.nutrition_patterns language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();p public.nutrition_patterns;r jsonb;rule_id uuid;position integer:=0;
begin
 if owner_id is null then raise exception 'AUTH_REQUIRED';end if;
 if not public.axvital_consume_api_budget('nutrition/pattern:POST') then raise exception 'RATE_LIMITED';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,1302));
 if not public.axvital_json_keys(input,array['name','rules'],array['template_key','template_version']) or octet_length(input::text)>32768 or jsonb_typeof(input->'rules')<>'array' then raise exception 'INVALID_PATTERN';end if;
 if jsonb_array_length(input->'rules') not between 1 and 20 then raise exception 'INVALID_PATTERN';end if;
 insert into public.nutrition_patterns(user_id,name,template_key,template_version) values(owner_id,input->>'name',input->>'template_key',(input->>'template_version')::integer) returning * into p;
 for r in select * from jsonb_array_elements(input->'rules') loop
  if not public.axvital_json_keys(r,array['name','definition']) or public.axvital_valid_rule(r->'definition') is not true or r->'definition'->>'domain'<>'nutrition' then raise exception 'INVALID_PATTERN_RULE';end if;
  insert into public.target_rules(user_id,name,definition) values(owner_id,r->>'name',r->'definition') returning id into rule_id;
  insert into public.nutrition_pattern_rules(user_id,nutrition_pattern_id,rule_id,display_order) values(owner_id,p.id,rule_id,position);position:=position+1;
 end loop;
 select * into p from public.nutrition_patterns where id=p.id and user_id=owner_id;
 return p;
end $$;
revoke all on function public.create_nutrition_pattern(jsonb) from public,anon,authenticated;
grant execute on function public.create_nutrition_pattern(jsonb) to authenticated;

-- Versioned whitelist, not executable source/query definitions. Mirrored against TS by tests.
create function public.axvital_outcome_definition(key text,version integer) returns jsonb language sql immutable set search_path='' as $$
 select d from jsonb_array_elements('[
{"key":"energy_score","version":1,"label":"Energy","target":"none","sourceAdapter":"checkins","unit":"score_10","grain":"day","aggregations":["average","median"],"scale":"rating","eligibility":"Non-null 1–10 answer","limitations":"Self-report; missing days are unknown","legacyType":"energy","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5}},
{"key":"mood_score","version":1,"label":"Mood","target":"none","sourceAdapter":"checkins","unit":"score_10","grain":"day","aggregations":["average","median"],"scale":"rating","eligibility":"Non-null 1–10 answer","limitations":"Self-report; missing days are unknown","legacyType":"mood","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5}},
{"key":"sleep_quality_score","version":1,"label":"Sleep quality","target":"none","sourceAdapter":"checkins","unit":"ordinal_4","grain":"day","aggregations":["median"],"scale":"ordinal","eligibility":"Poor/Average/Good/Great mapped 1/2/3/4; unknown aliases excluded","limitations":"Ordinal quality, not hours","legacyType":"sleep_quality","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5}},
{"key":"body_weight","version":1,"label":"Body weight","target":"none","sourceAdapter":"checkins","unit":"lb","grain":"day","aggregations":["average","median"],"scale":"ratio","eligibility":"Positive weight with verified units","limitations":"No per-row unit provenance","legacyType":"weight","enabled":false,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5},"disabledReason":"Historical load/weight units and/or estimation contract have not been verified."},
{"key":"nutrition_calories","version":1,"label":"Logged calories","target":"none","sourceAdapter":"nutrition","unit":"kcal","grain":"day","aggregations":["average","sum"],"scale":"ratio","eligibility":"Nondeleted entry snapshots; known amounts only, retain incomplete-field and intake-coverage flags","limitations":"Logged subtotal is not total intake; no record/null nutrient is unknown","legacyType":"nutrition","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5}},
{"key":"nutrition_protein_grams","version":1,"label":"Logged protein","target":"none","sourceAdapter":"nutrition","unit":"g","grain":"day","aggregations":["average","sum"],"scale":"ratio","eligibility":"Nondeleted entry snapshots; known amounts only, retain incomplete-field and intake-coverage flags","limitations":"Logged subtotal is not total intake; no record/null nutrient is unknown","legacyType":"nutrition","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5}},
{"key":"nutrition_carbohydrate_grams","version":1,"label":"Logged carbohydrate","target":"none","sourceAdapter":"nutrition","unit":"g","grain":"day","aggregations":["average","sum"],"scale":"ratio","eligibility":"Nondeleted entry snapshots; known amounts only, retain incomplete-field and intake-coverage flags","limitations":"Logged subtotal is not total intake; no record/null nutrient is unknown","legacyType":"nutrition","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5}},
{"key":"nutrition_fat_grams","version":1,"label":"Logged fat","target":"none","sourceAdapter":"nutrition","unit":"g","grain":"day","aggregations":["average","sum"],"scale":"ratio","eligibility":"Nondeleted entry snapshots; known amounts only, retain incomplete-field and intake-coverage flags","limitations":"Logged subtotal is not total intake; no record/null nutrient is unknown","legacyType":"nutrition","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5}},
{"key":"nutrition_fiber_grams","version":1,"label":"Logged fiber","target":"none","sourceAdapter":"nutrition","unit":"g","grain":"day","aggregations":["average","sum"],"scale":"ratio","eligibility":"Nondeleted entry snapshots; known amounts only, retain incomplete-field and intake-coverage flags","limitations":"Logged subtotal is not total intake; no record/null nutrient is unknown","legacyType":"nutrition","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5}},
{"key":"nutrition_caffeine_mg","version":1,"label":"Logged caffeine","target":"none","sourceAdapter":"nutrition","unit":"mg","grain":"day","aggregations":["average","sum"],"scale":"ratio","eligibility":"Nondeleted entry snapshots; known amounts only, retain incomplete-field and intake-coverage flags","limitations":"Logged subtotal is not total intake; no record/null nutrient is unknown","legacyType":"nutrition","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5}},
{"key":"nutrition_alcohol_grams","version":1,"label":"Logged alcohol","target":"none","sourceAdapter":"nutrition","unit":"g","grain":"day","aggregations":["average","sum"],"scale":"ratio","eligibility":"Nondeleted entry snapshots; known amounts only, retain incomplete-field and intake-coverage flags","limitations":"Logged subtotal is not total intake; no record/null nutrient is unknown","legacyType":"nutrition","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5}},
{"key":"condition_episode_frequency","version":1,"label":"Recorded episode frequency","target":"condition","sourceAdapter":"episodes","unit":"count","grain":"window","aggregations":["count"],"scale":"ratio","eligibility":"Nonarchived onsets in half-open window","limitations":"No onset logs do not establish symptom-free surveillance","legacyType":"episode_frequency","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":28,"observations":3}},
{"key":"condition_episode_duration_hours","version":1,"label":"Resolved episode duration","target":"condition","sourceAdapter":"episodes","unit":"h","grain":"episode","aggregations":["average","median"],"scale":"ratio","eligibility":"Onset cohort; resolved by analysis cutoff; end >= start","limitations":"Ongoing episodes censored, never zero","legacyType":"episode_duration","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":28,"observations":3}},
{"key":"condition_episode_peak_severity","version":1,"label":"Peak recorded episode severity","target":"condition","sourceAdapter":"episodes","unit":"score_10","grain":"episode","aggregations":["average","median"],"scale":"rating","eligibility":"Peak of recorded updates through cutoff; no later mutable-row leakage","limitations":"Sparse updates may miss peak; not onset severity","legacyType":"episode_severity","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":28,"observations":3}},
{"key":"condition_episode_impact","version":1,"label":"Recorded episode impact","target":"condition","sourceAdapter":"episodes","unit":"ordinal_5","grain":"episode","aggregations":["median"],"scale":"ordinal","eligibility":"Latest recorded update at cutoff; none/mild/moderate/significant/severe mapped 0–4","limitations":"Do not infer percentage change on ordinal ranks","legacyType":"episode_impact","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":28,"observations":3}},
{"key":"symptom_event_frequency","version":1,"label":"Recorded symptom-event frequency","target":"symptom","sourceAdapter":"symptoms","unit":"count","grain":"window","aggregations":["count"],"scale":"ratio","eligibility":"Nondeleted event rows in onset window; catalog or durable user symptom ID","limitations":"Not occurrence_count or symptom-free surveillance","legacyType":"symptom_occurrence","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5}},
{"key":"symptom_occurrence_count","version":1,"label":"Reported symptom count","target":"symptom","sourceAdapter":"symptoms","unit":"count","grain":"window","aggregations":["sum"],"scale":"ratio","eligibility":"Sum nonnull occurrence_count; retain missing count flags","limitations":"Null count is not one","legacyType":"symptom_occurrence","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5}},
{"key":"symptom_severity","version":1,"label":"Recorded symptom severity","target":"symptom","sourceAdapter":"symptoms","unit":"score_10","grain":"event","aggregations":["average","median"],"scale":"rating","eligibility":"Nondeleted identified events with 1–10 severity","limitations":"Optional condition scope uses event-condition links only","legacyType":"symptom_severity","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5}},
{"key":"symptom_duration_minutes","version":1,"label":"Resolved symptom duration","target":"symptom","sourceAdapter":"symptoms","unit":"min","grain":"event","aggregations":["average","median"],"scale":"ratio","eligibility":"Valid start/end, resolved by cutoff","limitations":"Open events censored; overlapping durations are not burden","legacyType":"symptom_duration","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5}},
{"key":"exercise_session_frequency","version":1,"label":"Exercise session frequency","target":"exercise","sourceAdapter":"workouts","unit":"count","grain":"window","aggregations":["count"],"scale":"ratio","eligibility":"Distinct completed sessions with completed eligible sets for exercise ID","limitations":"Activity frequency, not the primary strength-performance outcome. Planned exercises do not count as performed","legacyType":"workout_performance","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5}},
{"key":"exercise_repetitions","version":1,"label":"Exercise repetitions","target":"exercise","sourceAdapter":"workouts","unit":"reps","grain":"session","aggregations":["sum","average"],"scale":"ratio","eligibility":"Completed actual sets, nonnegative reps, repetition-compatible tracking","limitations":"No substitution of planned reps or unknown values","legacyType":"workout_performance","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5}},
{"key":"exercise_best_single_load","version":1,"label":"Best logged single","target":"exercise","sourceAdapter":"workouts","unit":"lb","grain":"session","aggregations":["maximum"],"scale":"ratio","eligibility":"Verified load units and versioned eligible-set definition required","limitations":"Historical units/load semantics unverified for this metric","legacyType":"workout_performance","enabled":false,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5},"disabledReason":"Historical load/weight units and/or estimation contract have not been verified."},
{"key":"exercise_external_load_volume","version":1,"label":"External-load volume","target":"exercise","sourceAdapter":"workouts","unit":"lb_reps","grain":"session","aggregations":["maximum"],"scale":"ratio","eligibility":"Verified load units and versioned eligible-set definition required","limitations":"Historical units/load semantics unverified for this metric","legacyType":"workout_performance","enabled":false,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5},"disabledReason":"Historical load/weight units and/or estimation contract have not been verified."},
{"key":"exercise_estimated_1rm","version":1,"label":"Estimated 1RM","target":"exercise","sourceAdapter":"workouts","unit":"lb","grain":"set","aggregations":["maximum"],"scale":"ratio","eligibility":"Same-owner consistent session/exercise/set links; selected exercise ID; weight_reps; working; set status completed; finite actual_weight > 0; integer actual_reps 1–10","limitations":"Epley estimate, not true 1RM. Existing app lb convention; no per-row unit provenance or conversion. Preserve logged per-implement load, never double dumbbells. Missing is unknown; only eligible sets in window; same load convention required across observations.","legacyType":"workout_performance","enabled":true,"direction":["increase","decrease","maintain","unknown"],"baselineRecommendation":{"windowDays":14,"observations":5},"formula":{"key":"epley","version":1,"expression":"actual_weight * (1 + actual_reps / 30.0)"}}
]'::jsonb) d where d->>'key'=key and (d->>'version')::integer=version
$$;

revoke all on function public.axvital_outcome_definition(text,integer) from public,anon,authenticated;
grant execute on function public.axvital_outcome_definition(text,integer) to authenticated;
commit;
