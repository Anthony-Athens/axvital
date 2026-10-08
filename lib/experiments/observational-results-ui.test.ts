import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {MessageChannel} from 'node:worker_threads';
import {resultsFixture} from './testing/observational-results-fixture.ts';
import type * as Harness from './testing/observational-results-harness.tsx';
test('results UI filters selected periods, offers chart tables/source review, and removes stale summaries on failed refresh',async()=>{
 const code=(await build({entryPoints:['lib/experiments/testing/observational-results-harness.tsx'],bundle:true,write:false,format:'iife',globalName:'Harness',platform:'browser',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'}})).outputFiles[0].text;
 const dom=new JSDOM('<div id="results-root"></div>',{url:'http://localhost',pretendToBeVisual:true,runScripts:'outside-only'}),channels:MessageChannel[]=[];class Channel extends MessageChannel{constructor(){super();channels.push(this);}}
 Object.assign(dom.window,{MessageChannel:Channel,Response,TextEncoder,TextDecoder,IS_REACT_ACT_ENVIRONMENT:true});let state='ready';
 dom.window.fetch=(async(url:string)=>{const q=new URL(url,'http://localhost').searchParams;return new Response(JSON.stringify(resultsFixture(state,q.get('start')!,q.get('end')!)),{status:state==='error'?503:200});}) as unknown as typeof dom.window.fetch;
 const h=dom.window.eval(code+'\nHarness;') as typeof Harness;const settle=()=>h.act(async()=>{await new Promise(r=>setTimeout(r,35));});
 try{await h.act(async()=>h.mount());await settle();await settle();const doc=dom.window.document;assert.match(doc.body.textContent!,/20 recorded/);assert.match(doc.body.textContent!,/median rating was higher/);assert.ok(doc.querySelector('svg[role="img"]'));assert.ok([...doc.querySelectorAll('caption')].some(c=>c.textContent?.includes('chart alternative')));assert.ok(doc.querySelector('a[target="_blank"][rel="noopener"]'));
 const input=doc.querySelector('input[type="date"]') as HTMLInputElement;await h.act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'2026-01-11');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await h.act(async()=>doc.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await settle();assert.match(doc.body.textContent!,/10 recorded/);assert.match(doc.body.textContent!,/factor did not vary/);
 state='error';await h.act(async()=>dom.window.dispatchEvent(new dom.window.Event('focus')));await settle();assert.match(doc.body.textContent!,/Previous evidence is unavailable/);assert.doesNotMatch(doc.body.textContent!,/median rating was higher/);assert.equal(doc.querySelectorAll('svg').length,0);
 state='empty';await h.act(async()=>dom.window.dispatchEvent(new dom.window.Event('focus')));await settle();assert.match(doc.body.textContent!,/No valid recorded outcomes/);assert.match(doc.body.textContent!,/10 missing/);
 state='edited';await h.act(async()=>dom.window.dispatchEvent(new dom.window.Event('focus')));await settle();assert.match(doc.body.textContent!,/10 recorded/);assert.match(doc.body.textContent!,/Median rating 1/);
 }finally{await h.act(async()=>h.unmount());dom.window.close();for(const c of channels){c.port1.close();c.port2.close();}}
});
