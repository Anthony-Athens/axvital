import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {JSDOM} from "jsdom";
import {MessageChannel} from "node:worker_threads";
import type * as Harness from "./testing/goals-harness.tsx";
import {discoverOutcomes} from "../experiments/discovery.ts";
import {goalDefinition,projectGoal,type GoalInput,type NutritionGoal} from "./goals.ts";
const code=(await build({entryPoints:["lib/nutrition/testing/goals-harness.tsx"],bundle:true,write:false,format:"iife",globalName:"GoalsHarness",platform:"browser",define:{"process.env.NODE_ENV":'"development"',"process.env":"{}"},plugins:[{name:"router",setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:"router",namespace:"fixture"}));b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:"export const useRouter=()=>({push:()=>{},refresh:()=>{}});"}));}}]})).outputFiles[0].text;
async function setup(wizard=false,holdTarget=false){
 const dom=new JSDOM('<div id="goals-root"></div>',{url:"http://localhost/",pretendToBeVisual:true,runScripts:"outside-only"});
 const channels:MessageChannel[]=[];class TestChannel extends MessageChannel{constructor(){super();channels.push(this);}}
 Object.assign(dom.window,{MessageChannel:TestChannel,Response,Request,Headers,AbortController,AbortSignal,TextEncoder,TextDecoder,IS_REACT_ACT_ENVIRONMENT:true});
 const h=dom.window.eval(code+"\nGoalsHarness;") as typeof Harness,goals:NutritionGoal[]=[],calls:{url:string;method:string}[]=[];
 let release:(()=>void)|undefined,uncertain=false,posts=0;
 dom.window.fetch=(async(url:string,options:RequestInit={})=>{
  calls.push({url,method:options.method??"GET"});const json=(v:unknown)=>new Response(JSON.stringify(v));
  if(url.endsWith("/outcomes"))return json(discoverOutcomes());
  if(url.includes("/targets?")){
   if(holdTarget){holdTarget=false;return new Promise<Response>(resolve=>{release=()=>resolve(json({items:[{id:"bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",identity:"rule_id",label:"Stale old target",available:true}],nextCursor:null}));});}
   return json({items:goals.filter(g=>!g.archived).map(g=>({id:g.id,label:g.name,identity:"rule_id",available:true})),nextCursor:null});
  }
  if(url.includes("baseline-readiness"))return json({queryCompleteness:"complete",classification:"good",observationCount:7,distinctDays:7,evaluatedAt:"2026-08-28T12:00:00Z",unit:"kg",target:{kind:"none"},workout:null,missingness:{censored:0},warnings:[],coverage:{percentage:50}});
  if(options.method==="POST"){
   posts++;if(uncertain)throw new Error("Network interrupted");
   const b=JSON.parse(String(options.body));let goal: NutritionGoal;
   if(b.action==="create"){const input=b.input as GoalInput;goal=projectGoal({id:"aaaaaaaa-aaaa-4aaa-aaaa-"+String(goals.length+1).padStart(12,"0"),name:input.name||"Protein target",revision:1,definition:goalDefinition(input),archived_at:null});goals.push(goal);}
   else{goal=goals.find(g=>g.id===b.id)!;if(b.action==="update")Object.assign(goal,projectGoal({id:goal.id,name:b.input.name,revision:goal.revision+1,definition:goalDefinition(b.input),archived_at:null}));else{goal.archived=b.action==="archive";goal.revision++;}}
   return json(goal);
  }
  return json({items:url.includes("kind=patterns")?[]:goals.filter(g=>g.archived===url.includes("status=archived")),next:null});
 }) as typeof fetch;
 await h.act(async()=>h.mount(wizard));await h.settle();await h.settle();
 const doc=dom.window.document;
 const click=async(text:string)=>{const e=[...doc.querySelectorAll("button")].find(e=>e.textContent===text);assert.ok(e,text);await h.act(async()=>e.click());await h.settle();};
 const field=async(label:string,value:string)=>{const l=[...doc.querySelectorAll("label")].find(l=>l.textContent?.startsWith(label));assert.ok(l,label);const e=l.querySelector("input,select") as HTMLInputElement|HTMLSelectElement;assert.ok(e);await h.act(async()=>{const proto=e.tagName==="SELECT"?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value")!.set!.call(e,value);e.dispatchEvent(new dom.window.Event(e.tagName==="SELECT"?"change":"input",{bubbles:true}));});await h.settle();};
 const radio=async(label:string)=>{const l=[...doc.querySelectorAll("label")].find(l=>l.textContent?.trim()===label||l.querySelector("input")?.getAttribute("aria-label")===label);assert.ok(l,label);await h.act(async()=>l.querySelector("input")!.click());await h.settle();};
 return {h,dom,doc,goals,calls,click,field,radio,release:()=>release?.(),uncertain:()=>{uncertain=true;},posts:()=>posts,close:async()=>{await h.act(async()=>h.unmount());dom.window.close();for(const c of channels){c.port1.close();c.port2.close();}}};
}
test("goals UI empty/create/edit/archive/restore and focus",async()=>{
 const t=await setup();try{
  assert.match(t.doc.body.textContent!,/Create a nutrition goal/);await t.click("Create Nutrition Goal");
  assert.equal(t.doc.activeElement,t.doc.querySelector('input'));
  await t.click("Save nutrition goal");assert.ok(t.doc.querySelector('[role="alert"]'));assert.equal(t.posts(),0);
  await t.field("Name (optional)","My protein");await t.field("Daily amount","180");await t.click("Save nutrition goal");
  assert.match(t.doc.body.textContent!,/Protein ≥ 180 g\/day/);assert.equal(t.doc.activeElement?.textContent,"Targets");
  await t.click("Edit My protein");await t.field("Daily amount","200");await t.click("Save nutrition goal");
  assert.match(t.doc.body.textContent!,/Protein ≥ 200 g\/day/);await t.click("Archive My protein");assert.equal(t.goals[0].archived,true);
  await t.field("Status","archived");await t.click("Restore My protein");assert.equal(t.goals[0].archived,false);
 }finally{await t.close();}
});
test("wizard inline create preserves selections, auto-selects new target, ignores stale picker, and reaches Review",async()=>{
 const t=await setup(true,true);try{
  await t.radio("Lose Weight / Improve Body Composition");await t.click("Continue");await t.radio("Body Weight");await t.click("Continue");
  await t.field("Type of change","nutrition_target");await t.click("Create Nutrition Goal");await t.click("Cancel");
  await t.click("Create Nutrition Goal");await t.field("Name (optional)","Inline protein");await t.field("Daily amount","180");await t.click("Save nutrition goal");
  await t.h.act(async()=>t.release());await t.h.settle();
  assert.match(t.doc.body.textContent!,/Selected: Inline protein/);assert.doesNotMatch(t.doc.body.textContent!,/Stale old target/);
  await t.click("Continue");assert.match(t.doc.body.textContent!,/28-day experiment/);await t.click("Continue");assert.match(t.doc.body.textContent!,/Your experiment/);assert.match(t.doc.body.textContent!,/Inline protein & Body Weight/);
 }finally{await t.close();}
});
test("uncertain save locks automatic retries and preserves entered values",async()=>{
 const t=await setup();try{
  await t.click("Create Nutrition Goal");await t.field("Daily amount","180");t.uncertain();
  await t.click("Save nutrition goal");assert.equal(t.posts(),1);assert.match(t.doc.body.textContent!,/save may have succeeded/);
  await t.click("Save nutrition goal");assert.equal(t.posts(),1);await t.click("Close and check goals");assert.equal(t.doc.activeElement?.textContent,"Targets");
 }finally{await t.close();}
});
