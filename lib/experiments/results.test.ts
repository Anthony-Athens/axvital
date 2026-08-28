import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,existsSync} from "node:fs";
import {fileURLToPath,pathToFileURL} from "node:url";
import * as nodeModule from "node:module";
import ts from "typescript";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {measurement} from "../measurements/registry.ts";
import {ResultsRequestState,reconcileCapture} from "./results-client.ts";
import {resultCopy} from "./results-copy.ts";
type Hooks={registerHooks(h:{resolve:(s:string,c:{parentURL?:string},next:(s:string,c:unknown)=>unknown)=>unknown;load:(u:string,c:unknown,next:(u:string,c:unknown)=>unknown)=>unknown}):{deregister():void}};
const hook=(nodeModule as unknown as Hooks).registerHooks({resolve(s,c,next){if(s==="server-only")return{url:"data:text/javascript,export{}",shortCircuit:true};if(s.startsWith(".")&&c.parentURL){const p=fileURLToPath(new URL(s,c.parentURL));for(const ext of [".ts",".tsx"])if(existsSync(p+ext))return next(pathToFileURL(p+ext).href,c);}return next(s,c);},load(u,c,next){if(u.endsWith(".tsx"))return{format:"module",source:ts.transpileModule(readFileSync(fileURLToPath(u),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};return next(u,c);}});
const {resultsApi}=await import("./results-api.ts");
const {ResultsView}=await import("../../components/experiments/ResultsView.tsx");hook.deregister();
const A="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",B="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",cutoff="2026-08-23T12:00:00.000Z";
function capture(revision=1,state="ready") {
 const outcome={registry_key:"nutrition_protein_grams",registry_version:1,outcome_role:"primary",aggregation_method:"average",expected_direction:"increase",source_config:{},definition:measurement("nutrition_protein_grams",1)};
 const configuration={model_version:2,question:"Does my routine appear associated with logged protein?",analysis_timezone:"UTC",baseline_mode:"historical",baseline_start_date:"2026-08-01",baseline_end_date:"2026-08-07",intervention_start_date:"2026-08-08",intervention_end_date:"2026-08-14",outcomes:[outcome],intervention:{type:"nutrition_target",configuration:{id:B,revision:1,definition:{version:1,domain:"nutrition",kind:"numeric",metric:"protein_grams",operator:"gte",value:15,unit:"g",period:"day"}}}};
 const frame=(start:number,value:number)=>{const dates=Array.from({length:7},(_,i)=>`2026-08-${String(start+i).padStart(2,"0")}`);return{start:dates[0],end:`2026-08-${String(start+7).padStart(2,"0")}`,checkins:[],nutrition:{version:1,truncated:state==="unable_to_determine",entries:dates.map(d=>({id:d,user_id:A,consumed_at:`${d}T12:00:00Z`})),items:dates.map(d=>({id:d,nutrition_entry_id:d,protein_grams:value})),coverage:dates.map((d,i)=>({local_date:d,time_zone:"UTC",coverage_status:state==="insufficient_data"&&i<4?"partial":"complete"}))}};};
 const raw={captureVersion:1,analysisPolicyVersion:2,versions:{analysisContract:2,readinessPolicy:1,sourceAdapter:1,measurementRegistry:1,exposureContract:1,lifecycleContract:1},cutoff,experiment:{id:A,user_id:A,config_revision:1,model_version:2,status:"completed",current_phase:"complete",actual_started_at:"2026-08-08T00:00:00.000Z",actual_completed_at:"2026-08-15T00:00:00.000Z",ended_early_at:null},startSnapshot:{snapshot_version:1,config_revision:1,configuration},events:[{event_type:"intervention_started",occurred_at:"2026-08-08T00:00:00.000Z",from_status:"draft",to_status:"active",from_phase:"planning",to_phase:"intervention",metadata:{model_version:2,config_revision:1}},{event_type:"completed",occurred_at:"2026-08-15T00:00:00.000Z",from_status:"active",to_status:"completed",from_phase:"intervention",to_phase:"complete",metadata:state==="blocked_by_integrity"?{}:{lifecycle_version:1,lifecycle_revision:1,provenance:"v2_transition_rpc",config_revision:1}}],baseline:frame(1,10),intervention:frame(8,20)};
 const evidence_text=JSON.stringify(raw);return {user_id:A,experiment_id:A,analysis_revision:revision,config_revision:1,lifecycle_revision:1,analysis_policy_version:2,capture_version:1,captured_at:cutoff,evidence_text,digest:createHash("sha256").update(evidence_text).digest("hex"),raw};
}
function fake(options:{anonymous?:boolean;foreign?:boolean;v1?:boolean;budget?:boolean;state?:string;count?:number;rpcError?:string;missing?:boolean;active?:boolean}={}) {
 const calls:{name:string;args?:Record<string,unknown>}[]=[],rows=Array.from({length:options.count??1},(_,i)=>capture(i+1,options.state));
 const client={auth:{getUser:async()=>({data:{user:options.anonymous?null:{id:A}},error:null})},rpc(name:string,args:Record<string,unknown>){calls.push({name,args});let response:unknown;
   if(name==="axvital_consume_api_budget")response={data:options.budget!==false,error:null};
   else if(options.rpcError)response={data:null,error:{message:options.rpcError}};
   else if(args.expected_analysis_revision!==rows.length||args.expected_lifecycle_revision!==1)response={data:null,error:{message:"CAPTURE_REVISION_CONFLICT"}};
   else{rows.push(capture(rows.length+1,options.state));response={data:{analysisRevision:rows.length},error:null};}
   return {abortSignal(){return this;},then(resolve:(v:unknown)=>unknown){return Promise.resolve(response).then(resolve);}};
 },from(name:string){calls.push({name});let single=false,limit=Infinity;
   let list:Record<string,unknown>[]=name==="experiments"?[{id:A,user_id:options.foreign?B:A,model_version:options.v1?1:2,config_revision:1,status:options.active?"active":"completed",current_phase:"complete",name:"Synthetic study",hypothesis:"Synthetic question",actual_completed_at:"2026-08-15T00:00:00Z"}]:name==="experiment_evidence_captures"?rows:name==="experiment_start_snapshots"?[{user_id:A,experiment_id:A,...capture().raw.startSnapshot}]:name==="experiment_phase_events"?[{user_id:A,experiment_id:A,"metadata->>lifecycle_version":"1"}]:[];
   const q={select(){return q;},eq(k:string,v:unknown){list=list.filter(r=>r[k]===v);return q;},order(k:string){list=[...list].sort((a,b)=>Number(b[k])-Number(a[k]));return q;},limit(n:number){limit=n;return q;},abortSignal(){return q;},maybeSingle(){single=true;return q;},then(resolve:(v:unknown)=>unknown){return Promise.resolve({data:single?list[0]??null:list.slice(0,limit),count:list.length,error:options.missing&&name==="experiment_evidence_captures"?{message:"private database failure"}:null}).then(resolve);}};return q;
 }} as unknown as SupabaseClient;
 return {calls,rows,api:(action:Parameters<typeof resultsApi>[0])=>resultsApi(action,async()=>client)};
}
const req=(query=`?id=${A}&revision=1`,body?:unknown,origin:string|null="https://example.test")=>new Request(`https://example.test/api/experiments/v2/results${query}`,body===undefined?{}:{method:"POST",headers:{"content-type":"application/json",...(origin?{origin}:{})},body:JSON.stringify(body)});
test("uncertain capture stays locked until authoritative discovery confirms a newer revision",()=>{
 assert.equal(reconcileCapture({before:2,uncertain:true},2),"uncertain");
 assert.equal(reconcileCapture({before:2,uncertain:true},3),"retained");
 assert.equal(reconcileCapture({before:2,uncertain:false},2),"not_created");
 assert.equal(reconcileCapture({before:2,uncertain:false},3),"retained");
});
test("results API authenticates and keeps foreign/v1 results unavailable",async()=>{for(const options of [{anonymous:true},{foreign:true},{v1:true}]){const f=fake(options),r=await f.api("read")(req());assert.equal(r.status,options.anonymous?401:404);assert.equal(f.calls.some(c=>c.name==="capture_experiment_evidence_v1"),false);}});
test("results read validates exact query and explicit integer revision",async()=>{for(const query of [`?id=${A}`,`?id=${A}&revision=0`,`?id=${A}&revision=33`,`?id=${A}&revision=1.0`,`?id=${A}&revision=01`,`?id=${A}&revision=1&revision=2`,`?id=${A}&revision=1&owner=${A}`,"?id=bad&revision=1"]){assert.equal((await fake().api("read")(req(query))).status,400);}});
for(const state of ["ready","insufficient_data","unable_to_determine","blocked_by_integrity"])test(`results API returns safe ${state} DTO and private cache headers`,async()=>{
 const f=fake({state}),r=await f.api("read")(req()),data=await r.json();assert.equal(r.status,200);assert.equal(data.eligibility.state,state);assert.equal(r.headers.get("cache-control"),"private, no-store");assert.doesNotMatch(JSON.stringify(data),/sourceId|evidence_text|digest|frozenSourceId|opportunities|user_id/);assert.ok(f.calls.some(c=>c.args?.route_key==="http/experiments/draft:GET"));
});
test("results missing revision, budget denial and missing infrastructure fail safely",async()=>{
 assert.equal((await fake().api("read")(req(`?id=${A}&revision=2`))).status,404);const denied=await fake({budget:false}).api("read")(req());assert.equal(denied.status,429);assert.equal(denied.headers.get("retry-after"),"60");const absent=await fake({missing:true}).api("revisions")(req(`?id=${A}`));assert.equal(absent.status,503);assert.doesNotMatch(await absent.text(),/private database failure/);
});
test("revision discovery is safe, bounded, newest-first and never captures",async()=>{
 const f=fake({count:6}),r=await f.api("revisions")(req(`?id=${A}`)),meta=await r.json();assert.equal(meta.latestRevision,6);assert.deepEqual(meta.revisions.map((r:{revision:number})=>r.revision),[6,5,4,3]);assert.equal(meta.nextBefore,3);assert.equal(meta.lifecycleRevision,1);assert.equal(meta.canCapture,true);assert.doesNotMatch(JSON.stringify(meta),/evidence_text|digest|user_id|metadata|sourceId/);assert.equal(f.calls.filter(c=>c.name==="capture_experiment_evidence_v1").length,0);
 const page=await(await f.api("revisions")(req(`?id=${A}&before=3`))).json();assert.deepEqual(page.revisions.map((r:{revision:number})=>r.revision),[2,1]);
});
test("capture mutation initial/next revision is explicit and uses registered strict budget",async()=>{
 const f=fake({count:0});for(let revision=0;revision<2;revision++){const r=await f.api("capture")(req("",{id:A,expectedAnalysisRevision:revision,expectedLifecycleRevision:1}));assert.equal(r.status,201);assert.equal((await r.json()).analysisRevision,revision+1);}assert.equal(f.calls.filter(c=>c.name==="capture_experiment_evidence_v1").length,2);assert.ok(f.calls.some(c=>c.args?.route_key==="http/experiments/start:POST"));
});
test("capture rejects origin, body overrides, foreign owner and active lifecycle",async()=>{
 const body={id:A,expectedAnalysisRevision:1,expectedLifecycleRevision:1};assert.equal((await fake().api("capture")(req("",body,null))).status,403);assert.equal((await fake().api("capture")(req("",{...body,cutoff}))).status,400);assert.equal((await fake({foreign:true}).api("capture")(req("",body))).status,404);assert.equal((await fake({active:true}).api("capture")(req("",body))).status,409);
});
test("capture stale analysis/lifecycle conflicts are distinct from uncertain failures",async()=>{
 for(const [analysis,life] of [[0,1],[1,0]]){const r=await fake().api("capture")(req("",{id:A,expectedAnalysisRevision:analysis,expectedLifecycleRevision:life}));assert.equal(r.status,409);assert.equal((await r.json()).error,"CAPTURE_REVISION_CONFLICT");}
 const uncertain=await fake({rpcError:"private transport failure"}).api("capture")(req("",{id:A,expectedAnalysisRevision:1,expectedLifecycleRevision:1}));assert.equal(uncertain.status,503);assert.equal((await uncertain.json()).error,"CAPTURE_OUTCOME_UNCERTAIN");
});
test("client lock is synchronous and obsolete read tokens cannot replace current results",()=>{const gate=new ResultsRequestState();assert.equal(gate.beginMutation(),true);assert.equal(gate.beginMutation(),false);const old=gate.beginRead(),next=gate.beginRead();assert.equal(gate.current(old),false);assert.equal(gate.current(next),true);gate.invalidate();assert.equal(gate.current(next),false);assert.equal(gate.beginMutation(),false);gate.releaseMutation();assert.equal(gate.beginMutation(),true);});
async function render(state="ready",empty=false){const f=fake({state,count:empty?0:1}),data=await(await f.api("revisions")(req(`?id=${A}`))).json(),result=empty?null:await(await f.api("read")(req())).json();return {data,result,html:renderToStaticMarkup(createElement(ResultsView,{data,result,selected:empty?null:1,onSelect(){},onGenerate(){},onOlder(){}}))};}
test("no-capture view offers explicit generation without creating evidence on render",async()=>{const {html}=await render("ready",true);assert.match(html,/No retained analysis/);assert.match(html,/Generate Results/);assert.match(html,/does not guarantee analyzable facts/);});
for(const [state,label] of [["ready","Ready"],["insufficient_data","Insufficient data"],["unable_to_determine","Unable to determine"],["blocked_by_integrity","Blocked by integrity"]])test(`results view distinguishes ${label} and separate quality sections`,async()=>{const {html}=await render(state);assert.match(html,new RegExp(label));assert.match(html,/Exposure quality/);assert.match(html,/Outcome quality/);assert.match(html,/Limitations/);assert.doesNotMatch(html,/evidence_text|sourceId|inputDigest|high confidence|statistically significant/);if(state!=="ready")assert.doesNotMatch(html,/What we observed/);});
test("continuous and ordinal facts, unknown values, history, early-end and pauses render conservatively",async()=>{
 const {data,result,html}=await render();assert.match(html,/Mean:/);assert.match(html,/Relative difference:/);assert.match(html,/does not establish causation/);
 result.facts.baseline={kind:"ordinal",count:6,medianLower:2,medianUpper:3,distribution:[{value:2,count:3},{value:3,count:3}]};result.facts.intervention={...result.facts.baseline};result.facts.absoluteChange=null;result.facts.relativeChangePercent=null;result.outcomeQuality.baseline.missing=null;result.limitations=["EARLY_END_MAY_BE_INFORMATIVE","PAUSE_TOUCHED_DAYS_EXCLUDED"];data.latestRevision=2;data.experiment.status="ended_early";
 const ordinal=renderToStaticMarkup(createElement(ResultsView,{data,result,selected:1,onSelect(){},onGenerate(){},onOlder(){}}));assert.match(ordinal,/Central ranks/);assert.doesNotMatch(ordinal,/Relative difference:/);assert.match(ordinal,/Historical analysis/);assert.match(ordinal,/Study ended early/);assert.match(ordinal,/not counted as non-adherent/);assert.match(ordinal,/Missing eligible observations: Unknown/);assert.match(ordinal,/sm:grid-cols-2/);
 result.eligibility={state:"unsupported_design",reasons:[{code:"EVENT_SURVEILLANCE_DENOMINATOR_UNAVAILABLE",scope:"design",state:"unsupported_design"}]};const unsupported=renderToStaticMarkup(createElement(ResultsView,{data,result,selected:1,onSelect(){},onGenerate(){},onOlder(){}}));assert.match(unsupported,/Unsupported design/);assert.match(unsupported,/Missing event logs cannot be treated as confirmed zero/);
});
test("controller and routing preserve no-auto-capture, stale clearing, uncertainty lock and v1 separation",()=>{
 const code=readFileSync(new URL("../../components/experiments/ExperimentResults.tsx",import.meta.url),"utf8");assert.equal((code.match(/method:"POST"/g)??[]).length,1);assert.match(code,/beginMutation\(\)/);assert.match(code,/setResult\(null\)/);assert.match(code,/abort.current\?\.abort/);assert.match(code,/attempt.current.uncertain/);assert.match(code,/analysis-heading/);assert.match(code,/no mutation was retried/);
 const route=readFileSync(new URL("../../components/experiments/ExperimentV2Status.tsx",import.meta.url),"utf8");assert.match(route,/ExperimentResults/);assert.doesNotMatch(route,/transitionExperiment/);assert.ok(resultCopy("NEW_LIMITATION_CODE").includes("new limitation code"));
});
