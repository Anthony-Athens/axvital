// Disposable synthetic PostgreSQL only; actual components/adapters, no Supabase credentials.
import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
import {linkedDatabase,databaseClient,A} from '../lib/experiments/testing/linked-database.ts';
import {readLinkedEvidence,linkedCatalog} from '../lib/experiments/linked-service.ts';
import {dietCatalog} from '../lib/diets/service.ts';
import {blankPlan} from '../lib/diets/model.ts';
import {dateInZone,shiftDate} from '../lib/measurements/time-window.ts';
const db=await linkedDatabase(),tz='America/New_York',today=dateInZone(new Date(),tz),yesterday=shiftDate(today,-1);
const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args.map(v=>typeof v==='object'?JSON.stringify(v):v))).rows[0].r;
await db.exec(`insert into public.subscriptions(user_id,plan,status) values('${A}','premium','active')`);
const ids={chicken:crypto.randomUUID(),rice:crypto.randomUUID(),drink:crypto.randomUUID()};
for(const [name,id] of Object.entries(ids))await db.query('insert into public.foods(id,slug,name) values($1,$2,$3)',[id,'linked-synthetic-'+name,'Synthetic '+name]);
await db.exec(`select set_config('request.jwt.claim.sub','${A}',false);set role authenticated;`);
const product=await rpc('save_supplement_review_v1',['product',{name:'Synthetic product',formulation:'Test formulation A'}]);
const def=await rpc('save_diet_v1',['definition',{id:crypto.randomUUID(),revision:0,draft:{...blankPlan(),name:'Synthetic reviewed diet',rules:[{kind:'ingredient',ref:'dairy',action:'exclude'}],dated_exceptions:[yesterday]},archived:false}]);
await rpc('save_diet_v1',['enroll',{id:crypto.randomUUID(),diet_id:def.id,definition_revision:def.revision,start_date:shiftDate(today,-20),end_date:null,timezone:tz}]);
const entry=crypto.randomUUID(),anchor=crypto.randomUUID();await db.query("insert into public.nutrition_entries(id,user_id,title,consumed_at) values($1,$2,'Synthetic composite',$3)",[entry,A,yesterday+'T18:00:00Z']);
await db.query("insert into public.health_event_foods(id,user_id,nutrition_entry_id,label,method,confirmed) values($1,$2,$3,'Synthetic composite','exact',true)",[anchor,A,entry]);
for(const [label,food] of [['Chicken',ids.chicken],['Rice',ids.rice]])await db.query("insert into public.health_event_food_components(user_id,event_food_id,food_id,label,source,confirmed) values($1,$2,$3,$4,'explicit',true)",[A,anchor,food,label]);
for(const [food,key,state] of [[ids.chicken,'dairy','absent'],[ids.chicken,'gluten','absent'],[ids.chicken,'alcohol','absent'],[ids.rice,'dairy','present'],[ids.rice,'gluten','unknown'],[ids.rice,'alcohol','absent'],[ids.drink,'alcohol','present']])await rpc('save_diet_v1',['classification',{subject:'food_id',id:food,key,state,provenance:'Synthetic reviewed preparation',historical_ack:true}]);
const drink=crypto.randomUUID();await db.query("insert into public.health_events(id,user_id,title,event_date,event_time,event_type) values($1,$2,'Synthetic alcoholic beverage',$3,'21:00:00','fluid')",[drink,A,yesterday]);await rpc('save_diet_v1',['identity',{subject:'health_event_id',id:drink,food_id:ids.drink,provenance:'Synthetic beverage label',historical_ack:true}]);
const supplement=crypto.randomUUID();await db.query("insert into public.health_events(id,user_id,title,supplement_name,event_date,event_time,event_type,dose_amount,dose_unit) values($1,$2,'Synthetic product','Synthetic product',$3,'20:00:00','supplement',500,'mg')",[supplement,A,yesterday]);await rpc('save_supplement_review_v1',['identity',{event_id:supplement,product_id:product.id}]);
await db.query('insert into public.daily_checkins(user_id,checkin_date,weight_source_value,weight_source_unit,weight_provenance_version) values($1,$2,75,\'kg\',1)',[A,yesterday]);
const js=(await build({entryPoints:['lib/experiments/testing/linked-harness.tsx'],bundle:true,write:false,format:'iife',globalName:'Harness',platform:'browser',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'}})).outputFiles[0].text;
const css=readdirSync('.next/static',{recursive:true}).filter(p=>p.endsWith('.css')).map(p=>readFileSync('.next/static/'+p,'utf8')).join('\n');let fail=false,failSource=false;
const rows=async(table)=> (await db.query(`select to_jsonb(t) r from public.${table} t`)).rows.map(x=>x.r);
createServer(async(req,res)=>{const url=new URL(req.url,'http://127.0.0.1:3114'),q=url.searchParams;const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
 try{
 if(url.pathname==='/fail-next'){fail=true;return json({ok:true});}if(url.pathname==='/fail-source'){failSource=!failSource;return json({ok:true});}
 const client=databaseClient(db,failSource?'read_intake_day_v1':undefined);
 if(url.pathname.startsWith('/api/')){
  if(req.method==='POST'){let raw='';for await(const c of req)raw+=c;const {action,payload}=JSON.parse(raw);if(fail){fail=false;return json({error:'Synthetic failed save. Input preserved.'},503);}return json(await rpc(url.pathname==='/api/experiments/observational'?'save_observational_v1':url.pathname==='/api/experiments/linked'?'save_factor_version_v1':url.pathname==='/api/nutrition/supplements'?'save_supplement_review_v1':url.pathname==='/api/nutrition/diets'?'save_diet_v1':'confirm_intake_day_v1',url.pathname==='/api/experiments/linked'||url.pathname==='/api/nutrition/intake'?[payload]:[action,payload]));}
  if(url.pathname==='/api/experiments/observational'){const studies=await rows('observational_studies'),metrics=await rows('observation_metrics'),study=studies.find(s=>s.id===q.get('id'));return json(study?{study,metrics,observations:(await rows('metric_observations')).filter(o=>o.metric_id===study.metric_id),checkins:await rows('daily_checkins')}:{studies,metrics});}
  if(url.pathname==='/api/experiments/linked'){if(!q.has('id'))return json(await linkedCatalog(client,A));const study=(await rows('observational_studies')).find(s=>s.id===q.get('id'));return json(await readLinkedEvidence(client,A,study,q.get('date'),q.get('start'),q.get('end')));}
  if(url.pathname==='/api/nutrition/supplements')return json({products:await rows('supplement_products'),day:await rpc('read_supplement_day_v1',[q.get('date'),q.get('timezone')])});
  if(url.pathname==='/api/nutrition/intake')return json({bundle:await rpc('read_intake_day_v1',[q.get('date'),q.get('timezone')]),catalog:await dietCatalog(client)});
 }
 if(url.pathname==='/harness.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(js);}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="linked-root"></div><script src="/harness.js"></script><script>Harness.mount()</script></body></html>`);
 }catch{json({error:'Synthetic source request failed'},400);}
}).listen(3114,'127.0.0.1',()=>console.log('Synthetic linked UI: http://127.0.0.1:3114'));
