import { createServer } from 'node:http';
import { readFileSync,readdirSync } from 'node:fs';
import { build } from 'esbuild';
const js=(await build({entryPoints:['lib/experiments/testing/observational-harness.tsx'],bundle:true,write:false,format:'iife',globalName:'Harness',platform:'browser',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'}})).outputFiles[0].text;
const css=readdirSync('.next/static',{recursive:true}).filter(p=>p.endsWith('.css')).map(p=>readFileSync('.next/static/'+p,'utf8')).join('\n');
const metrics=[],studies=[],observations=[];
const day=new Date().toISOString().slice(0,10);
const checkins=Array.from({length:15},(_,i)=>({checkin_date:new Date(Date.parse(day+'T00:00:00Z')-i*86400000).toISOString().slice(0,10),energy_score:7,mood_score:8,sleep_quality:'Good',weight_source_value:75+i/10,weight_source_unit:'kg',weight_provenance_version:1,weight_kg:75+i/10}));
let fail=false;
createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:3112');const json=(x,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(x));};
 if(url.pathname==='/api/experiments/observational'){
  if(req.method==='POST'){
   let raw='';for await(const c of req)raw+=c;const {action,payload:p}=JSON.parse(raw);
   if(fail){fail=false;return json({error:'Synthetic failed save. Your input is preserved.'},503);}
   if(action==='metric'){const m={...p,id:crypto.randomUUID(),version:1};metrics.push(m);return json(m);}
   if(action==='study'){const s={...p,revision:p.revision+1,user_id:'synthetic',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};const index=studies.findIndex(x=>x.id===s.id);if(index<0)studies.push(s);else studies[index]=s;return json(s);}
   const s=studies.find(s=>s.id===p.study_id),o={...p,metric_id:s.metric_id,submitted_at:new Date().toISOString(),updated_at:new Date().toISOString()};const index=observations.findIndex(x=>x.metric_id===o.metric_id&&x.observed_date===o.observed_date);if(index<0)observations.push(o);else observations[index]=o;return json(o);
  }
  const study=studies.find(s=>s.id===url.searchParams.get('id'));return json(study?{study,metrics,observations:observations.filter(o=>o.metric_id===study.metric_id),checkins}:{studies,metrics});
 }
 if(url.pathname==='/fail-next'){fail=true;return json({ok:true});}
 if(url.pathname==='/harness.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(js);}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
 if(url.pathname==='/layouts')return res.end(`<!doctype html><html><body><h1>Synthetic mobile validation</h1><iframe title="320px" width="320" height="1000" src="/frame${url.search}"></iframe><iframe title="390px" width="390" height="1000" src="/frame${url.search}"></iframe><iframe title="Desktop" width="1100" height="1000" src="/frame${url.search}"></iframe></body></html>`);
 res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><p class="p-2 text-xs">Synthetic local test — no account data</p><div id="observation-root"></div><script src="/harness.js"></script><script>Harness.mount();</script></body></html>`);
}).listen(3112,'127.0.0.1',()=>console.log('Synthetic observational UI: http://127.0.0.1:3112/frame'));
