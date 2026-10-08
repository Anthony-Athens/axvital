import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {MessageChannel} from 'node:worker_threads';
import type * as Harness from './testing/observational-harness.tsx';
import type {Study,Metric,Observation} from './observational.ts';
const code=(await build({entryPoints:['lib/experiments/testing/observational-harness.tsx'],bundle:true,write:false,format:'iife',globalName:'Harness',platform:'browser',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'}})).outputFiles[0].text;
async function setup(){
 const dom=new JSDOM('<div id="observation-root"></div>',{url:'http://localhost/',pretendToBeVisual:true,runScripts:'outside-only'}),channels:MessageChannel[]=[];
 class Channel extends MessageChannel{constructor(){super();channels.push(this);}}
 Object.assign(dom.window,{MessageChannel:Channel,Response,Request,Headers,TextEncoder,TextDecoder,IS_REACT_ACT_ENVIRONMENT:true});
 const h=dom.window.eval(code+'\nHarness;') as typeof Harness;
 const metrics:Metric[]=[],studies:Study[]=[],observations:Observation[]=[];let fail=false;let weight:number|null=100;
 dom.window.fetch=(async(url:string,options:RequestInit={})=>{
  const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status});
  if(options.method==='POST'){
   if(fail){fail=false;return json({error:'Synthetic save failed'},503);}
   const {action,payload:p}=JSON.parse(String(options.body));
   if(action==='metric'){const m={...p,id:crypto.randomUUID(),version:1};metrics.push(m);return json(m);}
   if(action==='study'){assert.deepEqual(Object.keys(p).sort(),['id','title','question','start_date','end_date','timezone','entry_offset','metric_id','outcome_source','factors','status','revision'].sort());const s={...p,revision:p.revision+1,user_id:'synthetic',created_at:'date',updated_at:'date'};const i=studies.findIndex(s=>s.id===p.id);if(i<0)studies.push(s);else studies[i]=s;return json(s);}
   const s=studies.find(s=>s.id===p.study_id)!;const o={...p,metric_id:s.metric_id,submitted_at:new Date().toISOString(),updated_at:new Date().toISOString()};const i=observations.findIndex(o=>o.metric_id===s.metric_id&&o.observed_date===p.observed_date);if(i<0)observations.push(o);else observations[i]=o;return json(o);
  }
  const id=new URL(url,'http://localhost').searchParams.get('id'),study=studies.find(s=>s.id===id);
  return json(study?{study,metrics,observations:observations.filter(o=>o.metric_id===study.metric_id),checkins:weight===null?[]:[{checkin_date:study.start_date,weight_source_value:weight,weight_source_unit:'lb',weight_provenance_version:1,weight_kg:weight*0.45359237}]}:{studies,metrics});
 }) as typeof fetch;
 await h.act(async()=>h.mount());await h.settle();await h.settle();
 const doc=dom.window.document;
 const click=async(text:string)=>{const b=[...doc.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);await h.act(async()=>b.click());await h.settle();};
 const field=async(label:string,value:string)=>{const l=[...doc.querySelectorAll('label')].find(l=>l.childNodes[0]?.textContent===label);assert.ok(l,label);const e=l.querySelector('input,select,textarea') as HTMLInputElement;assert.ok(e);await h.act(async()=>{const proto=e.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(e,value);e.dispatchEvent(new dom.window.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));});await h.settle();};
 const submit=async()=>{const forms=[...doc.querySelectorAll('form')];await h.act(async()=>forms.at(-1)!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await h.settle();};
 return {doc,dom,h,click,field,submit,metrics,studies,observations,setWeight:(next:number|null)=>{weight=next;},fail:()=>{fail=true;},close:async()=>{await h.act(async()=>h.unmount());dom.window.close();for(const c of channels){c.port1.close();c.port2.close();}}};
}
test('UI: three-month custom outcome, anchors, factors, draft, start, zero, not observed, metadata, correction, backdate, failed-save preservation and reuse',async()=>{
 const t=await setup();try{
 await t.field('Title','Synthetic three-month study');await t.field('Question','What changes alongside the outcome?');await t.field('First observed date','2026-01-01');await t.field('Last observed date','2026-03-31');await t.field('New entries describe','-1');
 await t.click('Create reusable metric');await t.field('Metric name','Synthetic intensity');await t.field('Rating 0 description (optional)','None');await t.field('Rating 4 description (optional)','High');await t.click('Save reusable metric');
 assert.equal(t.metrics[0].anchors['0'],'None');
 const checkbox=[...t.doc.querySelectorAll('label')].find(l=>l.textContent?.includes('Body weight · kg'))!.querySelector('input')!;await t.h.act(async()=>checkbox.click());await t.h.settle();await t.field('Body weight date alignment','-1');
 await t.submit();assert.equal(t.studies[0].start_date,'2026-01-01');assert.equal(t.studies[0].end_date,'2026-03-31');assert.equal(t.studies[0].factors[0].offset,-1);
 await t.click('Save and start');assert.match(t.doc.body.textContent!,/Daily observation/);assert.match(t.doc.body.textContent!,/2026-03-31/);
 await t.field('Observed date / night (not submission date)','2026-01-02');assert.match(t.doc.body.textContent!,/2026-01-01: 45.36 kg/);
 await t.field('Synthetic intensity','0');await t.field('Observer label','Synthetic observer');await t.field('Observation coverage','most');await t.field('Note','Synthetic note');t.fail();await t.submit();
 assert.match(t.doc.body.textContent!,/Synthetic save failed/);assert.equal((t.doc.querySelector('select[required]') as HTMLSelectElement).value,'0');assert.equal(t.observations.length,0);
 await t.submit();assert.equal(t.observations[0].value,0);assert.equal(t.observations[0].observer,'Synthetic observer');assert.equal(t.observations[0].coverage,'most');
 await t.field('Observed date / night (not submission date)','2026-01-03');await t.field('Observation status','not_observed');await t.submit();assert.equal(t.observations[1].value,null);assert.match(t.doc.body.textContent!,/1 valid · 1 not observed · 88 missing/);
 await t.field('Observed date / night (not submission date)','2026-01-02');assert.equal((t.doc.querySelector('select[required]') as HTMLSelectElement).value,'0');await t.field('Synthetic intensity','2');await t.submit();assert.equal(t.observations.length,2);assert.equal(t.observations[0].value,2);t.setWeight(110);await t.click('Refresh tracking data');assert.match(t.doc.body.textContent!,/2026-01-01: 49.90 kg/);t.setWeight(null);await t.click('Refresh tracking data');assert.match(t.doc.body.textContent!,/2026-01-01: Missing/);assert.equal(t.observations[0].value,2);
 await t.h.act(async()=>t.h.unmount());t.dom.window.history.replaceState(null,'','/');await t.h.act(async()=>t.h.mount());await t.h.settle();await t.h.settle();
 await t.field('Choose a measurement',`custom:${t.metrics[0].id}`);await t.field('Title','Reuse synthetic metric');await t.submit();assert.equal(t.studies[1].metric_id,t.metrics[0].id);assert.equal(t.metrics.length,1);
 }finally{await t.close();}
});


