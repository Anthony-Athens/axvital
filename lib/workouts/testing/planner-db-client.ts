// Disposable PostgreSQL adapter for exercising real planner/workout service code.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PGlite } from '@electric-sql/pglite';
export function plannerDbClient(db: PGlite, userId: string) {
 const json=(value:unknown,key=''):unknown=>value instanceof Date ? (key.endsWith('_date')?value.toISOString().slice(0,10):value.toISOString()) : Array.isArray(value)?value.map(v=>json(v)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,json(v,k)])):value;
 const safe=(s:string)=>{if(!/^[a-z_]+$/.test(s))throw Error('Invalid identifier');return s;};
 const rows=async(table:string,key:string,id:unknown)=> (await db.query<Record<string,unknown>>(`select * from ${safe(table)} where ${safe(key)}=$1`,[id])).rows;
 async function decorate(table:string,row:Record<string,unknown>,columns:string){
  if(!columns.includes('('))return row;
  if(table==='workout_templates'){
   row.groups=await rows('workout_template_groups','workout_template_id',row.id);
   for(const g of row.groups as Record<string,unknown>[]){g.exercises=await rows('workout_template_exercises','workout_template_group_id',g.id);for(const e of g.exercises as Record<string,unknown>[]){e.exercise=(await rows('exercises','id',e.exercise_id))[0];e.sets=await rows('workout_template_sets','workout_template_exercise_id',e.id);}}
  }
  if(table==='planned_workouts'||table==='workout_sessions'){
   const planned=table==='planned_workouts';
   row.exercises=await rows(planned?'planned_workout_exercises':'workout_session_exercises',planned?'planned_workout_id':'workout_session_id',row.id);
   for(const e of row.exercises as Record<string,unknown>[])e.sets=await rows(planned?'planned_workout_sets':'workout_session_sets',planned?'planned_workout_exercise_id':'workout_session_exercise_id',e.id);
   if(!planned)row.planned_workout=(await rows('planned_workouts','id',row.planned_workout_id))[0];
  }
  if(table==='planned_activity_occurrences'){
   row.planned_activity=(await rows('planned_activities','id',row.planned_activity_id))[0];
   row.planned_workouts=(await rows('planned_workouts','planned_activity_occurrence_id',row.id)).map(w=>({id:w.id}));
  }
  return row;
 }
 return {auth:{getUser:async()=>({data:{user:{id:userId}},error:null})},
 rpc:async(name:string,args:{target_id:string;input:unknown;future_from:string})=>{
  if(name!=='update_planned_activity')throw Error('Unsupported RPC');
  try{return {data:(await db.query<{value:unknown}>('select to_jsonb(public.update_planned_activity($1,$2::jsonb,$3::date)) as value',[args.target_id,JSON.stringify(args.input),args.future_from])).rows[0].value,error:null};}
  catch(error){return {data:null,error:{message:error instanceof Error?error.message:String(error)}};}
 },
 from(table:string){safe(table);let mode='select',payload:Record<string,unknown>[]=[];let columns='*',single=false,conflict='',ignore=false,offset=0,rowLimit:number|null=null;const filters:[string,string,unknown][]=[];
  const q={select(c='*'){columns=c;return q;},eq(k:string,v:unknown){filters.push([k,'=',v]);return q;},gte(k:string,v:unknown){filters.push([k,'>=',v]);return q;},lte(k:string,v:unknown){filters.push([k,'<=',v]);return q;},or(value:string){const visible=/^user_id.eq.([a-f0-9-]+),user_id.is.null$/.exec(value);if(visible){filters.push(['user_id','visible_user',visible[1]]);return q;}const match=/^end_date.is.null,end_date.gte.(\d{4}-\d{2}-\d{2})$/.exec(value);if(!match)throw Error('Unsupported OR');filters.push(['end_date','nullable_end',match[1]]);return q;},order(){return q;},limit(n:number){rowLimit=n;return q;},range(start:number,end:number){offset=start;rowLimit=end-start+1;return q;},single(){single=true;return q;},maybeSingle(){single=true;return q;},insert(v:Record<string,unknown>|Record<string,unknown>[]){mode='insert';payload=Array.isArray(v)?v:[v];return q;},upsert(v:Record<string,unknown>|Record<string,unknown>[],options:{onConflict:string;ignoreDuplicates?:boolean}){mode='insert';payload=Array.isArray(v)?v:[v];conflict=options.onConflict.split(',').map(safe).join(',');ignore=!!options.ignoreDuplicates;return q;},update(v:Record<string,unknown>){mode='update';payload=[v];return q;},delete(){mode='delete';return q;},then(resolve:(v:unknown)=>unknown,reject:(e:unknown)=>unknown){return run().then(resolve,reject);}};
  async function run(){try{
   const params:unknown[]=[];const param=(v:unknown)=>{params.push(v);return '$'+params.length;};
   let sql='';
   if(mode==='insert'){
    const keys=Object.keys(payload[0]).map(safe);sql=`insert into ${table}(${keys.join(',')}) values ${payload.map(v=>'('+keys.map(k=>param(v[k]??null)).join(',')+')').join(',')}`;
    if(conflict)sql+=` on conflict (${conflict}) ${ignore?'do nothing':'do update set '+keys.filter(k=>k!=='id').map(k=>`${k}=excluded.${k}`).join(',')}`;
   }else{
    const assignments=mode==='update'?Object.entries(payload[0]).map(([k,v])=>`${safe(k)}=${param(v)}`).join(','):'';
    const where=filters.map(([k,op,v])=>op==='visible_user'?`(${safe(k)} is null or ${k} = ${param(v)})`:op==='nullable_end'?`(${safe(k)} is null or ${k} >= ${param(v)})`:`${safe(k)} ${op} ${param(v)}`).join(' and ')||'true';
    sql=mode==='select'?`select * from ${table} where ${where}`:mode==='update'?`update ${table} set ${assignments} where ${where}`:`delete from ${table} where ${where}`;
   }
   if(mode!=='select')sql+=' returning *';else if(rowLimit!==null)sql+=` limit ${rowLimit} offset ${offset}`;
   const data=(await db.query<Record<string,unknown>>(sql,params)).rows;
   const decorated=await Promise.all(data.map(row=>decorate(table,row,columns)));
   return {data:json(single?decorated[0]??null:decorated),error:null};
  }catch(error){return {data:null,error:{message:error instanceof Error?error.message:String(error)}};}}
  return q;
 }
 } as unknown as SupabaseClient;
}
