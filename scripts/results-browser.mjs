// Isolated local browser harness. No credentials, app middleware, or linked DB.
import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
import {testHooks} from '../lib/experiments/testing/tsx-hooks.ts';
const hooks=testHooks();
const {fixtureResult,fixtureMetadata,fixtureVariant}=await import('../lib/experiments/testing/results-fixture.ts');
hooks.deregister();
const first=await fixtureResult(),second=await fixtureResult('nutrition_protein_grams',2,30);
const ordinal=await fixtureResult('sleep_quality_score');
const code=(await build({entryPoints:['lib/experiments/testing/results-harness.tsx'],bundle:true,write:false,format:'iife',globalName:'ResultsHarness',platform:'browser',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'}})).outputFiles[0].text;
const css=readdirSync('.next/static',{recursive:true}).filter(p=>p.endsWith('.css')).map(p=>readFileSync('.next/static/'+p,'utf8')).join('\n');
const scenarios=['ready','ordinal','empty','insufficient_data','unable_to_determine','unsupported_design','blocked_by_integrity','early_pause','conflict','uncertain_pending','uncertain_saved'];
const variants=Object.fromEntries(await Promise.all(['insufficient_data','unable_to_determine','unsupported_design','blocked_by_integrity','early_pause'].map(async s=>[s,await fixtureVariant(s)])));
createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:3110');
 if(url.pathname==='/bundle.js'){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});res.end(code);return;}
 const requested=url.pathname.startsWith('/scenario/')?url.pathname.slice('/scenario/'.length):url.searchParams.get('scenario');
 const scenario=scenarios.includes(requested)?requested:'ready';
 let results=[structuredClone(first),structuredClone(second)];
 if(scenario==='ordinal')results=[ordinal];
 if(scenario==='empty')results=[];
 if(variants[scenario])results=[variants[scenario]];
 const metadata=fixtureMetadata(results);
 if(scenario==='early_pause'){metadata.experiment.status='ended_early';metadata.experiment.actualEnd='2026-08-18T12:00:00Z';metadata.lifecycleRevision=3;}
 const next={...first,analysisRevision:metadata.latestRevision+1};
 const payload=JSON.stringify({metadata,results,next,scenario}).replaceAll('<','\\u003c');
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
 res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hydrated results verification — synthetic only</title><style>${css}</style></head><body><aside class="p-4 border-b"><h1>Local synthetic controller harness</h1><label for="scenario">Scenario</label><select id="scenario" class="border rounded p-2">${scenarios.map(s=>`<option ${s===scenario?'selected':''}>${s}</option>`).join('')}</select><button id="confirm" class="border p-2">Confirm pending capture</button><p id="requests" role="status">Requests: 0</p></aside><main id="results-root" class="pb-24"></main><script src="/bundle.js"></script><script>const fixture=${payload};const transport=ResultsHarness.mount(fixture.metadata,fixture.results,fixture.next);if(['conflict','uncertain_pending','uncertain_saved'].includes(fixture.scenario))transport.mode=fixture.scenario;document.getElementById('scenario').onchange=e=>location.href='/scenario/'+e.target.value;document.getElementById('confirm').onclick=()=>transport.retain();setInterval(()=>document.getElementById('requests').textContent='Requests: '+transport.calls.length+' · captures: '+transport.calls.filter(c=>c.method==='POST').length,100);</script></body></html>`);
}).listen(3110,'127.0.0.1',()=>console.log('Hydrated synthetic controller: http://127.0.0.1:3110'));
