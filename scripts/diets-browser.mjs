// Isolated synthetic PostgreSQL and production Diets component; no Supabase credentials.
import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
import {database} from '../lib/security/test-database.ts';
import {assessDiet} from '../lib/diets/model.ts';
const db=await database(false,async db=>db.exec('alter table public.health_events add column event_date date,add column event_type text,add column event_time time;'));
const uid='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
for(const name of ['Proteins','Legumes','Vegetables','Grains','Starches','Fruit','Dairy','Beverages']) await db.query('insert into public.food_categories(slug,name) values($1,$2) on conflict(slug) do nothing',['synthetic-'+name.toLowerCase(),'Test '+name]);
for(const [name,category] of [['Chicken','Proteins'],['Beans','Legumes'],['Broccoli','Vegetables'],['Bread','Grains'],['Rice','Grains'],['Pasta','Grains'],['Potatoes','Starches'],['Tortillas','Grains'],['Apple','Fruit'],['Milk','Dairy'],['Water','Beverages'],['Plain coffee','Beverages'],['Unsweetened tea','Beverages']]){
 const food=(await db.query('insert into public.foods(slug,name,category_id) select $1,$2,id from public.food_categories where slug=$3 returning id',['synthetic-'+name.toLowerCase().replaceAll(' ','-'),name,'synthetic-'+category.toLowerCase()])).rows[0];
 await db.query('insert into public.food_category_map(food_id,category_id) select $1,id from public.food_categories where slug=$2',[food.id,'synthetic-'+category.toLowerCase()]);
}
await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false);set role authenticated;`);
const js=(await build({entryPoints:['lib/diets/testing/harness.tsx'],bundle:true,write:false,format:'iife',globalName:'Harness',platform:'browser',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'}})).outputFiles[0].text;
const css=readdirSync('.next/static',{recursive:true}).filter(p=>p.endsWith('.css')).map(p=>readFileSync('.next/static/'+p,'utf8')).join('\n');let fail=false;
createServer(async(req,res)=>{const url=new URL(req.url,'http://127.0.0.1:3113');const json=(x,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(x));};
 try{
 if(url.pathname==='/fail-next'){fail=true;return json({ok:true});}
 if(url.pathname==='/api/nutrition/diets'){
  if(req.method==='POST'){let raw='';for await(const c of req)raw+=c;const {action,payload}=JSON.parse(raw);if(fail){fail=false;return json({error:'Synthetic failed save. Input preserved.'},503);}return json((await db.query('select public.save_diet_v1($1,$2::jsonb) r',[action,JSON.stringify(payload)])).rows[0].r);}
  const id=url.searchParams.get('id');if(id){const bundle=(await db.query('select public.read_diet_day_v1($1,$2::date) r',[id,url.searchParams.get('date')])).rows[0].r;const history=(await db.query('select public.read_diet_window_v1($1,$2::date,$3::date) r',[id,url.searchParams.get('start'),url.searchParams.get('end')])).rows[0].r;return json({bundle,assessment:assessDiet(bundle),history:history.map(assessDiet)});}
  return json({diets:(await db.query('select * from public.diet_definitions')).rows,enrollments:(await db.query('select * from public.diet_enrollments')).rows,catalog:{foods:(await db.query('select * from public.foods where slug like \'synthetic-%\'')).rows,categories:(await db.query('select * from public.food_categories where slug like \'synthetic-%\'')).rows,maps:(await db.query('select * from public.food_category_map')).rows,library:[]}});
 }
 if(url.pathname==='/harness.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(js);}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="diet-root"></div><script src="/harness.js"></script><script>Harness.mount()</script></body></html>`);
 }catch{json({error:'Synthetic request failed'},400);}
}).listen(3113,'127.0.0.1',()=>console.log('Synthetic Diets UI: http://127.0.0.1:3113'));
