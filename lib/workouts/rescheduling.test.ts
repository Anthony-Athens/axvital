import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { database } from '../security/test-database.ts';
import { plannerDbClient } from './testing/planner-db-client.ts';
import type * as Planning from './planning.ts';
import type * as Planner from '../planner/planner.ts';
import type * as Sessions from './sessions.ts';
const bundled=(await build({stdin:{contents:`export * from './lib/workouts/planning';export * from './lib/planner/planner';export * from './lib/workouts/sessions';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'})).outputFiles[0].text;
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled).toString('base64')) as typeof Planning & typeof Planner & typeof Sessions;
const owner='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

test('planner rescheduling atomically preserves one workout, its snapshots and start/session identity across weeks/months',async()=>{
 const db=await database();const client=plannerDbClient(db,owner);
 try{
  await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);set role authenticated;`);
  const template=(await db.query<{id:string}>("insert into workout_templates(user_id,name,notes,estimated_duration_minutes) values($1,'Superset plan','Keep configuration',45) returning id",[owner])).rows[0].id;
  const group=(await db.query<{id:string}>("insert into workout_template_groups(user_id,workout_template_id,group_order,group_label,group_type,rounds) values($1,$2,0,'A','superset',3) returning id",[owner,template])).rows[0].id;
  const exercises=(await db.query<{id:string}>("select id from exercises where user_id is null order by name limit 2")).rows;
  for(const [i,e] of exercises.entries()){
   const item=(await db.query<{id:string}>("insert into workout_template_exercises(user_id,workout_template_id,workout_template_group_id,exercise_id,exercise_order,display_label,tracking_type,tempo,notes) values($1,$2,$3,$4,$5,$6,'weight_reps','3010','Preserved') returning id",[owner,template,group,e.id,i,`A${i+1}`])).rows[0].id;
   await db.query("insert into workout_template_sets(user_id,workout_template_exercise_id,set_number,target_reps,target_weight,notes) values($1,$2,1,8,25,'Set note')",[owner,item]);
  }
  const planned=await api.scheduleWorkout(client,template,'2026-10-31','09:15');
  const original=await api.getPlannedWorkoutById(client,planned.id);
  assert.equal(original.exercises?.length,2);
  const activityId=planned.planned_activity_id!;const occurrenceId=planned.planned_activity_occurrence_id!;
  for(const [index,destination] of ['2026-11-02','2026-10-26','2026-12-01'].entries()){
   await db.exec(`set time zone '${['America/New_York','Pacific/Kiritimati','UTC'][index]}';`);
   await api.updatePlannedActivity(client,activityId,{start_date:destination,scheduled_time:'10:30'},'2026-10-08');
   const current=await api.getPlannedWorkoutById(client,planned.id);
   assert.equal(current.scheduled_date,destination);assert.equal(current.scheduled_time,'10:30:00');
   assert.equal(current.planned_activity_occurrence_id,occurrenceId);assert.deepEqual(current.exercises,original.exercises);
   assert.equal(current.notes,original.notes);assert.equal(current.workout_template_id,template);
   assert.equal((await api.getOccurrencesForDate(client,destination)).filter(o=>o.planned_activity_id===activityId).length,1);
   const occurrence=(await api.getOccurrencesForDate(client,destination)).find(o=>o.id===occurrenceId)!;
   assert.equal(occurrence.planned_workouts?.[0].id,planned.id);
   assert.equal(occurrence.planned_activity?.start_date,destination);assert.equal(occurrence.scheduled_time,'10:30:00');
   if(destination!=='2026-10-31')assert.equal((await api.getOccurrencesForDate(client,'2026-10-31')).length,0);
   assert.equal((await db.query('select * from planned_workouts')).rows.length,1);
  }
  // Passing the original October date still leaves the workout in the upcoming range.
  assert.equal((await api.getPlannedWorkouts(client,'2026-11-01','2026-12-31'))[0].id,planned.id);
  assert.equal((await api.getOccurrencesForRange(client,'2026-11-30','2026-12-06')).length,1);
  assert.equal((await api.getOccurrencesForRange(client,'2026-10-26','2026-11-01')).length,0);

  // Force failure AFTER the canonical workout/occurrence updates: all three roll back.
  await db.exec(`reset role;create function public.reject_test_activity() returns trigger language plpgsql as $$begin raise exception 'forced save failure';end;$$;create trigger reject_test_activity before update on planned_activities for each row execute function public.reject_test_activity();set role authenticated;`);
  await assert.rejects(api.updatePlannedActivity(client,activityId,{start_date:'2027-01-01'},'2026-10-08'));
  assert.equal((await api.getPlannedWorkoutById(client,planned.id)).scheduled_date,'2026-12-01');
  assert.equal((await api.getOccurrencesForDate(client,'2026-12-01'))[0].planned_activity?.start_date,'2026-12-01');
  assert.equal((await api.getOccurrencesForDate(client,'2027-01-01')).length,0);
  await db.exec('reset role;drop trigger reject_test_activity on planned_activities;set role authenticated;');

  // Invalid input/colliding occurrence/foreign-owner access also cannot partially move it.
  await assert.rejects(api.updatePlannedActivity(client,activityId,{start_date:'2026-02-30'},'2026-10-08'));
  await assert.rejects(api.updatePlannedActivity(client,activityId,{recurrence_type:'daily'},'2026-10-08'));
  await db.query("insert into planned_activity_occurrences(user_id,planned_activity_id,scheduled_date) values($1,$2,'2027-01-01')",[owner,activityId]);
  await assert.rejects(api.updatePlannedActivity(client,activityId,{start_date:'2027-01-01'},'2026-10-08'));
  assert.equal((await api.getPlannedWorkoutById(client,planned.id)).scheduled_date,'2026-12-01');
  await db.query("delete from planned_activity_occurrences where planned_activity_id=$1 and scheduled_date='2027-01-01'",[activityId]);
  await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
  await assert.rejects(api.updatePlannedActivity(plannerDbClient(db,other),activityId,{start_date:'2027-01-01'},'2026-10-08'));
  await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);

  const session=await api.startWorkoutSession(client,planned.id,'2026-12-01');
  assert.equal(session.planned_workout_id,original.id);assert.equal(session.planned_activity_occurrence_id,occurrenceId);
  assert.equal(session.session_date,'2026-12-01');assert.equal(session.exercises?.length,2);
  assert.ok(session.exercises?.every(e=>e.group_type==='superset'&&e.sets?.[0].planned_reps===8));
  await assert.rejects(api.updatePlannedActivity(client,activityId,{start_date:'2027-01-01'},'2026-10-08'),/started/);
  await db.query("update workout_sessions set status='completed',ended_at=now() where id=$1",[session.id]);
  await db.query("update planned_workouts set status='completed' where id=$1",[planned.id]);
  const history=await api.getWorkoutSessionById(client,session.id);
  await assert.rejects(api.updatePlannedActivity(client,activityId,{start_date:'2027-01-01'},'2026-10-08'),/completed/);
  assert.deepEqual(await api.getWorkoutSessionById(client,session.id),history);
 }finally{await db.close();}
});

test('legacy detached/mismatched workout schedules are flagged without automatic reconciliation; ordinary recurrence preserves history',async()=>{
 const db=await database();const client=plannerDbClient(db,owner);
 try{
  await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);set role authenticated;`);
  const activity=await api.createPlannedActivity(client,{title:'Legacy workout',activity_type:'workout',recurrence_type:'none',start_date:'2026-11-02'});
  await db.query("insert into planned_workouts(user_id,planned_activity_id,name,scheduled_date) values($1,$2,'Legacy workout','2026-10-31')",[owner,activity.id]);
  await assert.rejects(api.updatePlannedActivity(client,activity.id,{start_date:'2026-11-03'},'2026-10-08'),/need review/);
  assert.equal((await api.getPlannedWorkouts(client,'2026-10-01','2026-10-31'))[0].scheduled_date,'2026-10-31');
  const habit=await api.createPlannedActivity(client,{title:'Habit',activity_type:'habit',recurrence_type:'daily',start_date:'2026-10-01'});
  await api.getOccurrencesForRange(client,'2026-10-01','2026-10-03');
  await db.query("update planned_activity_occurrences set status='completed',completed_at=now() where planned_activity_id=$1 and scheduled_date='2026-10-01'",[habit.id]);
  await db.query("update planned_activity_occurrences set status='skipped',skipped_at=now() where planned_activity_id=$1 and scheduled_date='2026-10-02'",[habit.id]);
  await api.updatePlannedActivity(client,habit.id,{start_date:'2026-10-04'},'2026-10-01');
  const history=(await db.query<{status:string}>('select status from planned_activity_occurrences where planned_activity_id=$1 order by scheduled_date',[habit.id])).rows;
  assert.deepEqual(history.map(o=>o.status),['completed','skipped']);
 }finally{await db.close();}
});
