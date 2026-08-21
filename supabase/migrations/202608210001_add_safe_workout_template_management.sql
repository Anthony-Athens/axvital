create or replace function public.replace_workout_template(target_id uuid, payload jsonb) returns public.workout_templates language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=(select auth.uid()); result public.workout_templates; g jsonb; e jsonb; s jsonb; gid uuid; eid uuid; gi int:=0; ei int; si int; label text;
begin
if owner_id is null then raise exception 'AUTH_REQUIRED'; end if;
if nullif(btrim(payload->>'name'),'') is null then raise exception 'INVALID_NAME'; end if;
if jsonb_typeof(payload->'groups')<>'array' or jsonb_array_length(payload->'groups')=0 then raise exception 'INVALID_GROUPS'; end if;
update public.workout_templates set name=btrim(payload->>'name'),description=nullif(payload->>'description',''),category=nullif(payload->>'category',''),estimated_duration_minutes=nullif(payload->>'estimated_duration_minutes','')::int,notes=nullif(payload->>'notes','') where id=target_id and user_id=owner_id returning * into result;
if result.id is null then raise exception 'TEMPLATE_NOT_FOUND'; end if;
delete from public.workout_template_groups where workout_template_id=target_id and user_id=owner_id;
for g in select value from jsonb_array_elements(payload->'groups') loop
 label:=case when gi<26 then chr(65+gi) else chr(64+(gi/26))||chr(65+(gi%26)) end;
 insert into public.workout_template_groups(user_id,workout_template_id,group_order,group_label,group_type,rounds,rest_between_exercises_seconds,rest_after_group_seconds,notes) values(owner_id,target_id,gi,label,g->>'group_type',nullif(g->>'rounds','')::int,nullif(g->>'rest_between_exercises_seconds','')::int,nullif(g->>'rest_after_group_seconds','')::int,nullif(g->>'notes','')) returning id into gid;
 ei:=0;
 for e in select value from jsonb_array_elements(g->'exercises') loop
  insert into public.workout_template_exercises(user_id,workout_template_id,workout_template_group_id,exercise_id,exercise_order,display_label,tracking_type,target_sets,tempo,rest_after_exercise_seconds,notes) values(owner_id,target_id,gid,(e->'exercise'->>'id')::uuid,ei,label||(ei+1),e->>'tracking_type',jsonb_array_length(e->'sets'),nullif(e->>'tempo',''),nullif(e->>'rest_after_exercise_seconds','')::int,nullif(e->>'notes','')) returning id into eid;
  si:=1;
  for s in select value from jsonb_array_elements(e->'sets') loop
   insert into public.workout_template_sets(user_id,workout_template_exercise_id,set_number,set_type,target_reps,target_reps_min,target_reps_max,target_weight,target_duration_seconds,target_distance,distance_unit,is_optional,notes) values(owner_id,eid,si,coalesce(s->>'set_type','working'),nullif(s->>'target_reps','')::int,nullif(s->>'target_reps_min','')::int,nullif(s->>'target_reps_max','')::int,nullif(s->>'target_weight','')::numeric,nullif(s->>'target_duration_seconds','')::int,nullif(s->>'target_distance','')::numeric,nullif(s->>'distance_unit',''),coalesce((s->>'is_optional')::boolean,false),nullif(s->>'notes',''));
   si:=si+1;
  end loop;
  ei:=ei+1;
 end loop;
 gi:=gi+1;
end loop;
return result;
end$$;

create or replace function public.workout_template_dependencies(target_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object('planned_workouts',(select count(*) from public.planned_workouts where workout_template_id=target_id and user_id=(select auth.uid())),'protocols',(select count(*) from public.protocol_template_activities where workout_template_id=target_id and user_id=(select auth.uid())),'active_experiments',(select count(*) from public.experiment_interventions i join public.experiments e on e.id=i.experiment_id where i.linked_workout_template_id=target_id and e.user_id=(select auth.uid()) and e.status in('scheduled','active','paused')),'experiments',(select count(*) from public.experiment_interventions i join public.experiments e on e.id=i.experiment_id where i.linked_workout_template_id=target_id and e.user_id=(select auth.uid()))) from public.workout_templates t where t.id=target_id and t.user_id=(select auth.uid())$$;

create or replace function public.delete_workout_template_if_unused(target_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
if not exists(select 1 from public.workout_templates where id=target_id and user_id=(select auth.uid())) then raise exception 'TEMPLATE_NOT_FOUND'; end if;
if exists(select 1 from public.planned_workouts where workout_template_id=target_id) or exists(select 1 from public.protocol_template_activities where workout_template_id=target_id) or exists(select 1 from public.experiment_interventions where linked_workout_template_id=target_id) then raise exception 'TEMPLATE_HAS_DEPENDENCIES'; end if;
delete from public.workout_templates where id=target_id and user_id=(select auth.uid()); return found;
end$$;
grant execute on function public.replace_workout_template(uuid,jsonb) to authenticated;
grant execute on function public.workout_template_dependencies(uuid) to authenticated;
grant execute on function public.delete_workout_template_if_unused(uuid) to authenticated;
