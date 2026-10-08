import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { MessageChannel } from "node:worker_threads";
import { database } from "../security/test-database.ts";
import type { Exercise } from "./types.ts";

const code=(await build({stdin:{contents:`import {act} from 'react';import {createRoot} from 'react-dom/client';import {WorkoutTemplateBuilder} from './components/workouts/WorkoutTemplateBuilder';export {act};let root;export function mount(){root=createRoot(document.getElementById('root'));root.render(<WorkoutTemplateBuilder/>)}export function unmount(){root.unmount()}`,resolveDir:process.cwd(),loader:'tsx'},jsx:'automatic',bundle:true,write:false,format:'iife',globalName:'Harness',platform:'browser',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},plugins:[{name:'boundaries',setup(b){
 b.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'mock'}));
 b.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'client',namespace:'mock'}));
 b.onResolve({filter:/^@\/lib\/workouts\/templates$/},()=>({path:'templates',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='router'?`export const useRouter=()=>({push:url=>window.destination=url});`:args.path==='templates'?`export async function createWorkoutTemplate(c,input){window.saved=input;return {id:'saved'}}export const updateWorkoutTemplate=createWorkoutTemplate;export async function getWorkoutTemplateById(){throw Error('unused')}`:`export const supabase={auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})},from(){let filters=[],start=0,end=299;const q={select(){return q},or(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},range(a,b){start=a;end=b;return q},then(resolve){return Promise.resolve({data:window.catalog.filter(e=>filters.every(([k,v])=>e[k]===v)).slice(start,end+1),error:null}).then(resolve)}};return q}};`}));
}}]})).outputFiles[0].text;

test('every expanded catalog choice displays metadata and can be selected and saved in the workout builder',async()=>{
 const db=await database();
 const rows=(await db.query<Exercise>("select * from exercises where equipment='kettlebell' or name in ('Barbell Shrugs','Weighted Dips','Preacher Curl','Reaction Ball Training','Calf Raise','Crunch','Barbell Roll-Out','Back Extensions') order by name,id")).rows;
 await db.close();assert.equal(rows.length,94);
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true,runScripts:'outside-only'});
 const channels:MessageChannel[]=[];class Channel extends MessageChannel{constructor(){super();channels.push(this)}}
 const w=dom.window;Object.assign(w,{MessageChannel:Channel,IS_REACT_ACT_ENVIRONMENT:true,catalog:rows,scrollTo:()=>{}});
 const h=w.eval(code+';Harness;') as {act:(fn:()=>unknown)=>Promise<void>;mount:()=>void;unmount:()=>void};const d=w.document;
 const click=async(text:string)=>{const button=[...d.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(button,text);await h.act(()=>button.click());};
 try{
  await h.act(()=>h.mount());await click('Add group');
  for(const row of rows){
   await click('Search exercise library…');await h.act(async()=>{await new Promise(r=>setTimeout(r,175))});
   const choice=[...d.querySelectorAll('[role="dialog"] button')].find(b=>b.querySelector('span')?.textContent===row.name);assert.ok(choice,row.name);
   assert.ok(choice.textContent?.includes(row.category[0].toUpperCase()+row.category.slice(1)));
   if(row.equipment)assert.ok(choice.textContent?.includes(row.equipment[0].toUpperCase()+row.equipment.slice(1)));
   await h.act(()=> (choice as HTMLButtonElement).click());assert.equal(d.querySelectorAll('article').length,rows.indexOf(row)+1);
  }
  await h.act(()=>{const input=d.querySelector('input[required]')!;Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value')!.set!.call(input,'Expanded library workout');input.dispatchEvent(new w.Event('input',{bubbles:true}));});
  await h.act(()=>d.querySelector('form')!.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})));
  const saved=(w as unknown as {saved:{groups:{exercises:{exercise:Exercise;tracking_type:string}[]}[]}}).saved;
  assert.equal(saved.groups[0].exercises.length,94);
  for(const [i,item] of saved.groups[0].exercises.entries()){assert.equal(item.exercise.id,rows[i].id);assert.equal(item.tracking_type,rows[i].default_tracking_type);}
 }finally{await h.act(()=>h.unmount());dom.window.close();for(const c of channels){c.port1.close();c.port2.close();}}
});
