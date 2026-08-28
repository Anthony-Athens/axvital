import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {JSDOM} from "jsdom";
import {MessageChannel} from "node:worker_threads";
import {testHooks} from "./testing/tsx-hooks.ts";
import type * as Harness from "./testing/results-harness.tsx";
const hooks=testHooks();
const {fixtureResult,fixtureMetadata}=await import("./testing/results-fixture.ts");
hooks.deregister();
const code=(await build({entryPoints:["lib/experiments/testing/results-harness.tsx"],bundle:true,write:false,format:"iife",globalName:"ResultsHarness",platform:"browser",define:{"process.env.NODE_ENV":'"development"',"process.env":"{}"}})).outputFiles[0].text;
const first=await fixtureResult(),second=await fixtureResult("nutrition_protein_grams",2,30);
async function setup(empty=false){
 const dom=new JSDOM('<!doctype html><div id="results-root"></div>',{url:"http://localhost/experiments/synthetic/results",pretendToBeVisual:true,runScripts:"outside-only"});
 const channels:MessageChannel[]=[];
 class TestChannel extends MessageChannel {constructor(){super();channels.push(this);}}
 Object.assign(dom.window,{MessageChannel:TestChannel,ReadableStream,WritableStream,TransformStream,Response,Request,Headers,AbortController,AbortSignal,TextEncoder,TextDecoder,IS_REACT_ACT_ENVIRONMENT:true});
 const h=dom.window.eval(`${code}\nResultsHarness;`) as typeof Harness;
 let transport!:ReturnType<typeof h.mount>;
 await h.act(async()=>{transport=h.mount(fixtureMetadata(empty?[]:[first,second]),structuredClone(empty?[]:[first,second]),structuredClone(empty?first:{...second,analysisRevision:3}));});
 await h.settle();await h.settle();
 const doc=dom.window.document;
 const click=async(label:string)=>{const button=[...doc.querySelectorAll("button")].find(b=>b.textContent===label);assert.ok(button,`Button ${label}`);await h.act(async()=>{button.click();});await h.settle();};
 const select=async(revision:number)=>{await h.act(async()=>{const s=doc.querySelector("select")!;s.value=String(revision);s.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});await h.settle();};
 const close=async()=>{await h.act(async()=>h.unmount());dom.window.close();for(const channel of channels){channel.port1.close();channel.port2.close();}};
 return {dom,h,doc,transport,click,select,close};
}
test("hydrated initial load uses newest revision, exact projection, units and focus without capture",async()=>{
 const t=await setup();try{assert.match(t.doc.body.textContent!,/Analysis revision 2 — Ready/);assert.match(t.doc.body.textContent!,/30 g/);assert.equal(t.doc.activeElement?.id,"analysis-heading");assert.equal(t.transport.calls.filter(c=>c.method==="POST").length,0);assert.equal(t.h.hydrationErrors.length,0);}finally{await t.close();}
});
test("hydrated revision selection clears stale facts, changes history and focuses selected heading",async()=>{
 const t=await setup();try{await t.select(1);assert.match(t.doc.body.textContent!,/Historical analysis/);assert.match(t.doc.querySelector("article")!.textContent!,/20 g/);assert.equal(t.dom.window.location.search,"?revision=1");assert.equal(t.doc.activeElement?.textContent,"Analysis revision 1 — Ready");}finally{await t.close();}
});
test("rapid revision switching aborts old reads and late responses cannot replace selected facts",async()=>{
 const t=await setup();try{t.transport.holdReads=true;await t.select(1);assert.equal(t.doc.querySelector("article"),null);await t.select(2);const reads=t.transport.calls.filter(c=>c.url.includes("&revision="));assert.equal(reads.at(-2)?.signal?.aborted,true);await t.h.act(async()=>t.transport.releaseReads());await t.h.settle();assert.match(t.doc.querySelector("article")!.getAttribute("aria-label")!,/revision 2/);assert.equal(t.doc.activeElement?.textContent,"Analysis revision 2 — Ready");}finally{await t.close();}
});
test("no-capture hydration generates exactly once under immediate duplicate clicks",async()=>{
 const t=await setup(true);try{assert.match(t.doc.body.textContent!,/No retained analysis/);const button=[...t.doc.querySelectorAll("button")].find(b=>b.textContent==="Generate Results")!;t.transport.holdMutation=true;await t.h.act(async()=>{button.click();button.click();});assert.equal(t.transport.calls.filter(c=>c.method==="POST").length,1);assert.equal(button.disabled,true);assert.match(button.textContent!,/Capturing evidence/);await t.h.act(async()=>t.transport.releaseMutation?.());await t.h.settle();assert.match(t.doc.querySelector("article")!.textContent!,/Analysis revision 1 — Ready/);assert.equal(t.doc.activeElement?.id,"analysis-heading");assert.deepEqual(JSON.parse(JSON.stringify(t.transport.calls.find(c=>c.method==="POST")!.body)),{id:t.transport.metadata.experiment.id,expectedAnalysisRevision:0,expectedLifecycleRevision:1});}finally{await t.close();}
});
test("capture conflict reloads authoritative revision and never retries POST",async()=>{
 const t=await setup();try{t.transport.mode="conflict";await t.click("Generate New Analysis");assert.equal(t.transport.calls.filter(c=>c.method==="POST").length,1);assert.match(t.doc.body.textContent!,/revision 3/);assert.match(t.doc.body.textContent!,/conflict/i);}finally{await t.close();}
});
for(const mode of ["uncertain_saved","uncertain_pending"] as const)test(`hydrated ${mode} reconciles without duplicate capture`,async()=>{
 const t=await setup();try{t.transport.mode=mode;await t.click("Generate New Analysis");assert.equal(t.transport.calls.filter(c=>c.method==="POST").length,1);if(mode==="uncertain_pending"){assert.match(t.doc.body.textContent!,/No new revision has been confirmed/);assert.equal([...t.doc.querySelectorAll("button")].find(b=>b.textContent==="Generate New Analysis")!.disabled,true);t.transport.retain();await t.click("Refresh capture status");}assert.match(t.doc.querySelector("article")!.textContent!,/Analysis revision 3 — Ready/);assert.equal(t.transport.calls.filter(c=>c.method==="POST").length,1);}finally{await t.close();}
});
test("unmount during capture prevents late reads, navigation and focus",async()=>{
 const t=await setup();try{t.transport.holdMutation=true;await t.click("Generate New Analysis");await t.h.act(async()=>t.h.unmount());const count=t.transport.calls.length,url=t.dom.window.location.href;await t.h.act(async()=>t.transport.releaseMutation?.());await t.h.settle();assert.equal(t.transport.calls.length,count);assert.equal(t.dom.window.location.href,url);assert.equal(t.doc.querySelector("article"),null);}finally{await t.close();}
});
test("failed selection after displayed success exposes alert without old facts; refresh is read-only",async()=>{
 const t=await setup();try{t.transport.readFailure=1;await t.select(1);assert.equal(t.doc.querySelector("article"),null);assert.match(t.doc.querySelector('[role="alert"]')!.textContent!,/temporarily unavailable/);t.transport.readFailure=null;await t.click("Refresh results");assert.match(t.doc.querySelector("article")!.textContent!,/revision 1/);assert.equal(t.transport.calls.filter(c=>c.method==="POST").length,0);}finally{await t.close();}
});
test("a newer indeterminate capture stays selected rather than falling back to older ready facts",async()=>{
 const t=await setup();try{t.transport.next={...t.transport.next,eligibility:{state:"insufficient_data",reasons:[]},facts:null,interpretationTier:"indeterminate"};await t.click("Generate New Analysis");assert.match(t.doc.querySelector("article")!.textContent!,/Analysis revision 3 — Insufficient data/);assert.doesNotMatch(t.doc.querySelector("article")!.textContent!,/What we observed/);await t.select(1);assert.match(t.doc.body.textContent!,/Historical analysis/);}finally{await t.close();}
});
test("refresh while capture remains uncertain stays locked and issues only reads",async()=>{
 const t=await setup();try{t.transport.mode="uncertain_pending";await t.click("Generate New Analysis");await t.click("Refresh capture status");assert.equal(t.transport.calls.filter(c=>c.method==="POST").length,1);assert.equal([...t.doc.querySelectorAll("button")].find(b=>b.textContent==="Generate New Analysis")!.disabled,true);}finally{await t.close();}
});
