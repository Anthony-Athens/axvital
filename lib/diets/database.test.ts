import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from '../security/test-database.ts';
import {assessDiet,blankPlan,type Bundle,type Diet,type Enrollment} from './model.ts';
const A='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
test('diet RPC ownership, immutable versions, zero intake, beverage correction, invalidation, export and deletion',async()=>{
 const db=await database(false,async db=>{await db.exec("alter table public.health_events add column event_date date,add column event_type text,add column event_time time;");});const as=async(uid:string,role='authenticated')=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${uid}',false);set role ${role};`);
 const save=async<T>(action:string,payload:unknown)=>(await db.query<{r:T}>('select public.save_diet_v1($1,$2::jsonb) r',[action,JSON.stringify(payload)])).rows[0].r;
 const day=async(id:string,date='2026-01-05')=>(await db.query<{r:Bundle}>('select public.read_diet_day_v1($1,$2::date) r',[id,date])).rows[0].r;
 const food=crypto.randomUUID(),event=crypto.randomUUID(),id=crypto.randomUUID(),enroll=crypto.randomUUID();
 try{
 await db.query("insert into public.foods(id,slug,name) values($1,'synthetic-diet-water','Synthetic water')",[food]);await as(A);
 const plan={...blankPlan(),name:'Synthetic dairy restriction',rules:[{kind:'ingredient' as const,ref:'dairy',action:'exclude' as const}]};
 const d=await save<Diet>('definition',{id,revision:0,draft:plan,archived:false});
 const e=await save<Enrollment>('enroll',{id:enroll,diet_id:id,definition_revision:d.revision,start_date:'2026-01-01',end_date:null,timezone:'America/New_York'});
 let b=await day(enroll);assert.equal(assessDiet(b).calculated_status,'incomplete');
 await assert.rejects(save('confirm',{enrollment_id:enroll,date:b.date,fingerprint:b.fingerprint,no_intake:false}),/CONFIRM_NO_INTAKE/);
 await save('confirm',{enrollment_id:enroll,date:b.date,fingerprint:b.fingerprint,no_intake:true});assert.equal(assessDiet(await day(enroll)).calculated_status,'adherent');
 await db.query("insert into public.health_events(id,user_id,title,event_type,event_date) values($1,$2,'Synthetic drink','fluid','2026-01-05')",[event,A]);
 b=await day(enroll);assert.equal(b.coverage?.coverage_status,'unknown');assert.equal(assessDiet(b).confirmation_invalidated,true);assert.equal(assessDiet(b).calculated_status,'needs_review');
 await assert.rejects(save('confirm',{enrollment_id:enroll,date:b.date,fingerprint:'stale',no_intake:false}),/INTAKE_CHANGED/);
 await save('identity',{subject:'health_event_id',id:event,food_id:food,provenance:'Synthetic reviewed label',historical_ack:true});
 await save('classification',{subject:'food_id',id:food,key:'dairy',state:'absent',provenance:'Synthetic ingredient review',historical_ack:true});
 b=await day(enroll);assert.equal(assessDiet(b).calculated_status,'incomplete');assert.equal(b.shared.length,0);assert.equal(b.private.length,1);
 await save('confirm',{enrollment_id:enroll,date:b.date,fingerprint:b.fingerprint,no_intake:false});assert.equal(assessDiet(await day(enroll)).calculated_status,'adherent');
 await db.query("update public.health_events set event_date='2026-01-06' where id=$1",[event]);assert.equal((await day(enroll)).coverage?.coverage_status,'unknown');assert.equal((await day(enroll,'2026-01-06')).events.length,1);
 await assert.rejects(save('version',{enrollment_id:enroll,revision:e.revision,effective_from:'2026-01-06',plan,historical_ack:false}),/HISTORICAL_SCOPE_REQUIRED/);
 await save('version',{enrollment_id:enroll,revision:e.revision,effective_from:'2026-01-06',plan:{...plan,weekly_exceptions:[2]},historical_ack:true});
 assert.equal((await day(enroll)).version.revision,1);assert.equal((await day(enroll,'2026-01-06')).version.revision,2);
 // Corrections remain explicit on stopped history; future cancellations generate no expected dates.
 const stopped=await save<Enrollment>('stop',{enrollment_id:enroll,revision:2,end_date:'2026-01-07',historical_ack:true});
 await save('version',{enrollment_id:enroll,revision:stopped.revision,effective_from:'2026-01-07',plan,historical_ack:true});
 const future=await save<Enrollment>('enroll',{id:crypto.randomUUID(),diet_id:id,definition_revision:d.revision,start_date:'2099-01-01',end_date:null,timezone:e.timezone});
 const cancelled=await save<Enrollment>('stop',{enrollment_id:future.id,revision:future.revision,end_date:future.start_date,historical_ack:false});assert.equal(cancelled.cancelled,true);
 assert.deepEqual((await db.query<{r:unknown}>('select public.read_diet_window_v1($1,$2::date,$3::date) r',[future.id,'2099-01-01','2099-01-02'])).rows[0].r,[]);
 // Canonical manual and voice meals use the same persisted components, never parent plus child.
 for(const source of ['manual','voice']){
  const entry=crypto.randomUUID(),anchor=crypto.randomUUID();
  await db.query("insert into public.nutrition_entries(id,user_id,title,consumed_at,source_type) values($1,$2,'Synthetic composite','2026-01-07T15:00:00Z',$3)",[entry,A,source]);
  await db.query("insert into public.health_event_foods(id,user_id,nutrition_entry_id,food_id,label,method,confirmed) values($1,$2,$3,$4,'Synthetic meal','exact',true)",[anchor,A,entry,food]);
  await db.query("insert into public.health_event_food_components(user_id,event_food_id,food_id,label,source,confirmed) values($1,$2,$3,'Synthetic component','explicit',true)",[A,anchor,food]);
  b=await day(enroll,'2026-01-07');assert.equal(assessDiet(b).items.length,1);
  await save('confirm',{enrollment_id:enroll,date:b.date,fingerprint:b.fingerprint,no_intake:false});
  await db.query("update public.nutrition_entries set title='Edited synthetic composite' where id=$1",[entry]);assert.equal((await day(enroll,'2026-01-07')).coverage?.coverage_status,'unknown');
  b=await day(enroll,'2026-01-07');await save('confirm',{enrollment_id:enroll,date:b.date,fingerprint:b.fingerprint,no_intake:false});
  await db.query("update public.nutrition_entries set consumed_at='2026-01-06T15:00:00Z' where id=$1",[entry]);assert.equal((await day(enroll,'2026-01-07')).coverage?.coverage_status,'unknown');
  await db.query('update public.nutrition_entries set deleted_at=now() where id=$1',[entry]);assert.equal((await day(enroll,'2026-01-06')).entries.length,0);
 }
 await assert.rejects(db.exec('update public.diet_rule_versions set revision=10'),/permission denied/);
 await as(B);assert.equal((await db.query('select * from public.diet_definitions')).rows.length,0);await assert.rejects(day(enroll),/NOT_FOUND/);await assert.rejects(save('identity',{subject:'health_event_id',id:event,food_id:food,provenance:'Unauthorized',historical_ack:true}),/NOT_FOUND/);
 await assert.rejects(db.query("insert into public.user_food_classification_assertions(user_id,health_event_id,classification_key,state,provenance,definition_version) values($1,$2,'dairy','absent','Unauthorized',1)",[B,event]),/row-level security/);
 await as('','anon');await assert.rejects(day(enroll),/permission denied/);
 await as(A);assert.ok(JSON.stringify((await db.query('select public.axvital_export_account()')).rows).includes('diet_rule_versions'));
 await db.exec(`reset role;insert into public.account_deletions(user_id,billing_closed) values('${A}',true);delete from auth.users where id='${A}'`);assert.equal((await db.query('select * from public.diet_enrollments')).rows.length,0);
 }finally{await db.close();}
});
