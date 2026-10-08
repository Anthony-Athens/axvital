// Disposable synthetic browser transport. Calculation and UI are real; no accounts/DB writes.
import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
import {resultsFixture} from '../lib/experiments/testing/observational-results-fixture.ts';
const js=(await build({entryPoints:['lib/experiments/testing/observational-results-harness.tsx'],bundle:true,write:false,format:'iife',globalName:'Harness',platform:'browser',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'}})).outputFiles[0].text;
const css=readdirSync('.next/static',{recursive:true}).filter(p=>p.endsWith('.css')).map(p=>readFileSync('.next/static/'+p,'utf8')).join('\n');let state='ready';
createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1:3115');if(u.pathname==='/scenario'){state=u.searchParams.get('state')??'ready';res.end('Synthetic scenario updated');return;}
 if(u.pathname==='/api/experiments/observational-results'){res.writeHead(state==='error'?503:200,{'content-type':'application/json'});const data=resultsFixture(state,u.searchParams.get('start'),u.searchParams.get('end'));res.end(JSON.stringify(data));return;}
 if(u.pathname==='/harness.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(js);return;}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main style="max-width:48rem;margin:auto;padding:16px"><div id="results-root"></div></main><script src="/harness.js"></script><script>Harness.mount()</script></body></html>`);
}).listen(3115,'127.0.0.1',()=>console.log('Synthetic results browser: http://127.0.0.1:3115'));
