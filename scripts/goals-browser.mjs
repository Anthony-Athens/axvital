// Real UI + API/domain code against a disposable local PostgreSQL database.
import {createServer} from "node:http";
import {readFileSync,readdirSync} from "node:fs";
import {build} from "esbuild";
import {database} from "../lib/security/test-database.ts";
import {goalsDbClient} from "../lib/nutrition/testing/goals-db-client.ts";
import {testHooks} from "../lib/experiments/testing/tsx-hooks.ts";
const hooks=testHooks();
const {nutritionGoalsApi}=await import("../lib/nutrition/goals-api.ts");
const {experimentApi}=await import("../lib/experiments/api.ts");
hooks.deregister();
const db=await database(),owner="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);set role authenticated;`);
const client=goalsDbClient(db,owner),api=nutritionGoalsApi(async()=>client);
const code=(await build({entryPoints:[new URL("../lib/nutrition/testing/goals-harness.tsx",import.meta.url).pathname.slice(1)],bundle:true,write:false,format:"iife",globalName:"GoalsHarness",platform:"browser",define:{"process.env.NODE_ENV":'"development"',"process.env":"{}"},plugins:[{name:"local-router",setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:"router",namespace:"fixture"}));b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:"export const useRouter=()=>({push:()=>{},refresh:()=>{}});"}));}}]})).outputFiles[0].text;
const css=readdirSync(".next/static",{recursive:true}).filter(p=>p.endsWith(".css")).map(p=>readFileSync(".next/static/"+p,"utf8")).join("\n");
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,"http://127.0.0.1:3112");
  if(url.pathname.startsWith("/api/")){
   const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
   const request=new Request(url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});
   const action=url.pathname.endsWith("/outcomes")?"outcomes":url.pathname.endsWith("/baseline-readiness")?"baseline-readiness":"targets";
   if(action==="baseline-readiness"){
    res.writeHead(200,{"content-type":"application/json"});
    res.end(JSON.stringify({contractVersion:1,registryKey:"body_weight",registryVersion:2,queryCompleteness:"complete",classification:"good",observationCount:12,distinctDays:12,evaluatedAt:new Date().toISOString(),unit:"kg",target:{kind:"none"},workout:null,nutrition:null,recordedTotal:null,missingness:{censored:0},warnings:[],coverage:{percentage:86}}));return;
   }
   const response=await (url.pathname==="/api/nutrition/goals"?api:experimentApi(action,async()=>client))(request);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  if(url.pathname==="/bundle.js"){res.writeHead(200,{"content-type":"text/javascript"});res.end(code);return;}
  res.writeHead(200,{"content-type":"text/html; charset=utf-8"});
  res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><p class="p-4">Disposable Nutrition Goals verification — synthetic data only</p><main id="goals-root" class="pb-24"></main><script src="/bundle.js"></script><script>GoalsHarness.mount(${url.pathname==="/wizard"});</script></body></html>`);
 }catch{res.writeHead(500);res.end("Synthetic harness failed");}
}).listen(3112,"127.0.0.1",()=>console.log("Nutrition Goals: http://127.0.0.1:3112 · Wizard: /wizard"));
