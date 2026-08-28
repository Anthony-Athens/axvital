// Disposable synthetic HTTP transport; production components and domain engines.
import {createServer} from "node:http";
import {readFileSync,readdirSync} from "node:fs";
import {build} from "esbuild";
import {testHooks} from "../lib/experiments/testing/tsx-hooks.ts";
const hooks=testHooks();
const {fixtureCapture,fixtureResult,fixtureMetadata}=await import("../lib/experiments/testing/results-fixture.ts");
const {replayDurableCapture}=await import("../lib/experiments/durable-evidence.ts");
const {evaluateReadiness}=await import("../lib/measurements/readiness-policies.ts");
const {discoverOutcomes}=await import("../lib/experiments/discovery.ts");
hooks.deregister();
const result=await fixtureResult("body_weight"),bundle=await replayDurableCapture(fixtureCapture("body_weight").row);
const source=bundle.input.baseline;
const ready=evaluateReadiness(source),ambiguous=evaluateReadiness({...source,observations:[],observationCount:0,counts:{...source.counts,excluded:7},exclusions:{legacy_unit_ambiguous:7},warnings:["WEIGHT_UNVERIFIED_RECORDS_EXCLUDED"]});
const common={bundle:true,write:false,format:"iife",platform:"browser",define:{"process.env.NODE_ENV":'"development"',"process.env":"{}"}};
const wizard=(await build({...common,entryPoints:["lib/experiments/testing/weight-wizard-harness.tsx"],plugins:[{name:"local-navigation",setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:"router",namespace:"fixture"}));b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:"export const useRouter=()=>({push:()=>{},refresh:()=>{}});"}));}}]})).outputFiles[0].text;
const results=(await build({...common,entryPoints:["lib/experiments/testing/results-harness.tsx"],globalName:"ResultsHarness"})).outputFiles[0].text;
const css=readdirSync(".next/static",{recursive:true}).filter(p=>p.endsWith(".css")).map(p=>readFileSync(".next/static/"+p,"utf8")).join("\n");
createServer((req,res)=>{
 const url=new URL(req.url,"http://127.0.0.1:3111");
 const json=value=>{res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(value));};
 if(url.pathname.endsWith("/outcomes"))return json(discoverOutcomes());
 if(url.pathname.endsWith("/targets"))return json({items:url.searchParams.get("kind")==="target_rules"?[{id:"bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",label:"Protein ≥180 g/day",identity:"rule_id",available:true}]:[],nextCursor:null});
 if(url.pathname.endsWith("/baseline-readiness"))return json((req.headers.referer??"").includes("ambiguous")?ambiguous:ready);
 if(url.pathname==="/wizard.js"||url.pathname==="/results.js"){res.writeHead(200,{"content-type":"text/javascript"});res.end(url.pathname==="/wizard.js"?wizard:results);return;}
 const isResults=url.pathname==="/results";
 const payload=JSON.stringify({metadata:fixtureMetadata([result]),result}).replaceAll("<","\\u003c");
 res.writeHead(200,{"content-type":"text/html; charset=utf-8"});
 res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><p class="p-4">Synthetic weight verification — no linked data</p><main id="${isResults?"results-root":"wizard-root"}" class="pb-24"></main><script src="/${isResults?"results":"wizard"}.js"></script>${isResults?`<script>const f=${payload};ResultsHarness.mount(f.metadata,[f.result],{...f.result,analysisRevision:2});</script>`:""}</body></html>`);
}).listen(3111,"127.0.0.1",()=>console.log("Weight wizard/results: http://127.0.0.1:3111"));
