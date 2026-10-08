import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { MessageChannel } from 'node:worker_threads';
import { database } from '../security/test-database.ts';
import { plannerDbClient } from './testing/planner-db-client.ts';
const owner='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const code=(await build({stdin:{contents:`import {act} from 'react';import {createRoot} from 'react-dom/client';import {WeeklyPlanner} from './components/planner/WeeklyPlanner';import {TodayPlan} from './components/planner/TodayPlan';import {PlannedWorkoutDetail} from './components/workouts/PlannedWorkoutDetail';import {WorkoutsHome} from './components/workouts/WorkoutsHome';export {act};let root;export function mount(){root=createRoot(document.getElementById('root'));root.render(<><div id="weekly"><WeeklyPlanner/></div><div id="today"><TodayPlan/></div><div id="detail"><PlannedWorkoutDetail/></div><div id="home"><WorkoutsHome/></div></>)}export function unmount(){root.unmount()}`,
resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',platform:'browser',format:'iife',globalName:'Harness',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},plugins:[{name:'boundaries',setup(b){
 b.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'mock'}));
 b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'mock'}));
 b.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'client',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'tsx',resolveDir:process.cwd(),contents:a.path==='router'?`export const useRouter=()=>({push:url=>window.destination=url,refresh:()=>window.refreshes++});export const useSearchParams=()=>new URLSearchParams('week=2026-10-05');export const useParams=()=>({id:window.workoutId});export const usePathname=()=>'/weekly-overview';`:a.path==='link'?`export default function Link({children,...props}){return <a {...props}>{children}</a>}`:`export const supabase=window.client;`}));
}}]})).outputFiles[0].text;

test('date editor waits for the atomic save, restores failed dates, refreshes Today/details and opens the same workout',async()=>{
 const db=await database();const base=plannerDbClient(db,owner);
 await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);set role authenticated;`);
 const activity=(await db.query<{id:string}>("insert into planned_activities(user_id,title,activity_type,recurrence_type,start_date) values($1,'Planner regression','workout','none','2026-10-06') returning id",[owner])).rows[0].id;
 const occurrence=(await db.query<{id:string}>("insert into planned_activity_occurrences(user_id,planned_activity_id,scheduled_date) values($1,$2,'2026-10-06') returning id",[owner,activity])).rows[0].id;
 const workout=(await db.query<{id:string}>("insert into planned_workouts(user_id,planned_activity_id,planned_activity_occurrence_id,name,scheduled_date) values($1,$2,$3,'Planner regression','2026-10-06') returning id",[owner,activity,occurrence])).rows[0].id;
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/weekly-overview',pretendToBeVisual:true,runScripts:'outside-only'});const w=dom.window,d=w.document;
 const channels:MessageChannel[]=[];class Channel extends MessageChannel{constructor(){super();channels.push(this)}}
 let reads=0;let fail=true;let release:(()=>void)|undefined;let blocked=false;
 const client={...base,from:(...args:Parameters<typeof base.from>)=>{reads++;return base.from(...args)},rpc:async(...args:Parameters<typeof base.rpc>)=>{if(blocked)await new Promise<void>(resolve=>{release=resolve});if(fail)return {data:null,error:{message:'forced failure'}};return base.rpc(...args);}};
 Object.assign(w,{client,workoutId:workout,refreshes:0,MessageChannel:Channel,IS_REACT_ACT_ENVIRONMENT:true,scrollTo:()=>{}});
 const OriginalDate=w.Date;
 class FixedDate extends OriginalDate {constructor(...args:unknown[]){if(!args.length)super('2026-10-08T12:00:00-04:00');else if(args.length===1)super(args[0] as string|number);else super(args[0] as number,args[1] as number,(args[2] as number)??1,(args[3] as number)??0,(args[4] as number)??0,(args[5] as number)??0,(args[6] as number)??0)}static now(){return new OriginalDate('2026-10-08T12:00:00-04:00').getTime()}}
 w.Date=FixedDate as DateConstructor;
 const h=w.eval(code+';Harness;') as {act:(fn:()=>unknown)=>Promise<void>;mount:()=>void;unmount:()=>void};
 const settle=()=>h.act(async()=>{await new Promise(r=>setTimeout(r,50))});
 const click=async(text:string)=>{const button=[...d.querySelectorAll('#weekly button')].find(b=>b.textContent===text);assert.ok(button,text+': '+d.querySelector('#weekly')!.textContent);await h.act(()=>(button as HTMLButtonElement).click());};
 const changeDate=async(value:string)=>h.act(()=>{const field=d.querySelector('#weekly input[type="date"]')!;Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new w.Event('input',{bubbles:true}));});
 try{
  await h.act(()=>h.mount());await settle();
  assert.ok(d.querySelector('#detail')!.textContent?.includes('2026-10-06'));
  assert.ok(!d.querySelector('#today')!.textContent?.includes('Planner regression'));
  assert.ok(!d.querySelector('#home')!.textContent?.includes('Planner regression'));
  await click('Edit');await changeDate('2026-10-08');
  await h.act(()=>d.querySelector('#weekly form')!.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})));await settle();
  assert.equal((d.querySelector('#weekly input[type="date"]') as HTMLInputElement).value,'2026-10-06');
  assert.match(d.querySelector('#weekly [role="alert"]')!.textContent!,/original date is unchanged/);
  assert.ok(d.querySelector('#detail')!.textContent?.includes('2026-10-06'));
  assert.equal((await db.query<{date:string}>('select scheduled_date::text as date from planned_workouts where id=$1',[workout])).rows[0].date,'2026-10-06');
  fail=false;blocked=true;await changeDate('2026-10-08');
  await h.act(()=>d.querySelector('#weekly form')!.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})));await settle();
  assert.ok(release);assert.equal(d.querySelector('#weekly [role="status"]'),null);
  assert.ok(d.querySelector('#detail')!.textContent?.includes('2026-10-06'));
  await h.act(async()=>{release!();await new Promise(r=>setTimeout(r,100))});await settle();
  assert.equal(d.querySelector('#weekly [role="dialog"]'),null);
  assert.ok(d.querySelector('#weekly [role="status"]')!.textContent?.includes('updated'));
  assert.ok(d.querySelector('#detail')!.textContent?.includes('2026-10-08'));
  assert.ok(d.querySelector('#today')!.textContent?.includes('Planner regression'));
  assert.equal(d.querySelectorAll('#home a[href="/workouts/planned/'+workout+'"]').length,1);
  const daySections=[...d.querySelectorAll('#weekly section')];
  assert.ok(!daySections.find(s=>s.querySelector('h2')?.textContent==='Tuesday')!.textContent?.includes('Planner regression'));
  assert.equal(daySections.find(s=>s.querySelector('h2')?.textContent==='Thursday')!.querySelectorAll('article').length,1);
  assert.equal(d.querySelector('#today a[href^="/workouts/planned/"]')!.getAttribute('href'),`/workouts/planned/${workout}`);
  assert.equal((await db.query('select * from planned_workouts')).rows.length,1);
  assert.ok((w as unknown as {refreshes:number}).refreshes>0);
  // Cross-tab invalidation and returning to a cached page trigger fresh readers.
  const previousReads=reads;
  await h.act(()=>w.dispatchEvent(new w.StorageEvent('storage',{key:'axvital:schedule-changed',newValue:'refresh'})));await settle();
  assert.ok(reads>previousReads);
  const focusedReads=reads;await h.act(()=>w.dispatchEvent(new w.Event('focus')));await settle();assert.ok(reads>focusedReads);
  assert.ok(d.querySelector('#detail')!.textContent?.includes('2026-10-08'));
 }finally{await h.act(()=>h.unmount());dom.window.close();for(const c of channels){c.port1.close();c.port2.close()}await db.close();}
});
