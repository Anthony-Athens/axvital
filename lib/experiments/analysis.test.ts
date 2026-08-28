import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import {readFileSync} from "node:fs";
import type {SupabaseClient} from "@supabase/supabase-js";
import {measurement} from "../measurements/registry.ts";
import {historicalWindow,shiftDate} from "../measurements/time-window.ts";
import type {SourceResult,SupportedKey} from "../measurements/observations.ts";
import type {AnalysisInput} from "./analysis-contract.ts";
type Resolved={url:string;shortCircuit?:boolean};
const {registerHooks}=nodeModule as unknown as {registerHooks(hooks:{resolve:(s:string,c:unknown,next:(s:string,c:unknown)=>Resolved)=>Resolved}):{deregister():void}};
const hook=registerHooks({resolve(s,c,next){return s==="server-only"?{url:"data:text/javascript,export{}",shortCircuit:true}:next(s,c);}});
const {analyzeCapturedInput,captureAnalysisBundle,inspectAnalysisPlan,summarizeContinuous,summarizeOrdinal,classifyDirection}=await import("./analysis.ts");
const {buildExperimentAnalysis}=await import("./analysis-service.ts");hook.deregister();
const ID="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",SOURCE="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",CUTOFF="2026-08-15T12:00:00.000Z";
const rule={version:1,domain:"nutrition",kind:"numeric",metric:"calories",operator:"gte",value:15,unit:"kcal",period:"day"};
function observations(key:SupportedKey,start:string,values:number[]):SourceResult {
  const def=measurement(key,1)!;
  const points=values.map((value,index)=>({sourceId:`${start}-${index}`,logicalDate:shiftDate(start,index),precision:"date" as const,value:{kind:"numeric" as const,value},eligibility:"eligible" as const}));
  return {contractVersion:1,registryKey:key,registryVersion:1,adapterVersion:1,sourceDomain:def.sourceAdapter,target:{kind:"none"},grain:def.grain,unit:def.unit,aggregation:def.aggregations[0],
    window:historicalWindow("America/New_York",new Date(CUTOFF),start,shiftDate(start,7)),observations:points,observationCount:points.length,queryCompleteness:"complete",counts:{sourceRows:points.length,nullValues:0,excluded:0,censored:0,absentDays:7-points.length},exclusions:{},warnings:[],temporalLimitations:[],
    ...(def.sourceAdapter==="nutrition"?{nutritionDays:points.map(p=>({logicalDate:p.logicalDate,entryCount:1,knownItemCount:1,unknownItemCount:0,hasItems:true,fieldComplete:true,coverageStatus:"complete" as const,subtotal:p.value.value}))}:{})};
}
function fixture(key:SupportedKey="nutrition_protein_grams",b=[10,10,10,10,10,10,10],i=[20,20,20,20,20,20,20]):AnalysisInput {
  const def=measurement(key,1)!;
  return {analysisContractVersion:1,analysisPolicyVersion:1,readinessPolicyVersion:1,experiment:{id:ID,revision:1,modelVersion:2,status:"active",phase:"intervention"},
    startSnapshot:{snapshot_version:1,config_revision:1,configuration:{model_version:2,analysis_timezone:"America/New_York",baseline_mode:"historical",baseline_start_date:"2026-08-01",baseline_end_date:"2026-08-07",intervention_start_date:"2026-08-08",intervention_end_date:"2026-08-14",intervention:{type:"nutrition_target",configuration:{id:SOURCE,revision:1,definition:rule}},outcomes:[{registry_key:key,registry_version:1,outcome_role:"primary",aggregation_method:def.aggregations[0],expected_direction:"increase",source_config:{},definition:structuredClone(def)}]}},
    cutoff:CUTOFF,reproducibility:"captured_inputs_only",baseline:observations(key,"2026-08-01",b),intervention:observations(key,"2026-08-08",i),acquisitionIssues:[],integrityLimitations:["MUTABLE_HISTORY_NOT_RECONSTRUCTED"],
    exposure:{contractVersion:1,interventionType:"nutrition_target",frozenSourceId:SOURCE,frozenRevision:1,experimentRevision:1,phase:"intervention",evaluatedAt:CUTOFF,window:{startDate:"2026-08-08",endDateExclusive:"2026-08-15"},denominator:"frozen_schedule",eligibleOpportunityCount:7,adherentCount:7,nonAdherentCount:0,unknownCount:0,classification:"adherent",evidenceCompleteness:"complete",sourceIntegrity:"frozen_definition_verified",pauseState:"clear",opportunities:Array.from({length:7},(_,n)=>({date:shiftDate("2026-08-08",n),state:"adherent",reason:"Frozen target met."})),warnings:[],today:"Pending."}};
}
function primary(input:AnalysisInput){return (input.startSnapshot!.configuration.outcomes as Record<string,unknown>[])[0];}
const hasReason=(input:AnalysisInput,code:string)=>assert.ok(analyzeCapturedInput(input).eligibility.reasons.some(r=>r.code===code),code);

test("analysis ready keeps descriptive facts, independent qualities, and neutral direction",()=>{
  const r=analyzeCapturedInput(fixture());assert.equal(r.eligibility.state,"ready");assert.equal(r.facts?.absoluteChange,10);assert.equal(r.facts?.relativeChangePercent,100);assert.equal(r.facts?.direction,"indeterminate");assert.equal(r.facts?.neutralMovement,"higher");assert.equal(r.interpretationTier,"descriptive");assert.equal(r.outcomeQuality.baseline.eligibleObservations,7);assert.equal(r.exposureQuality?.eligibleOpportunityCount,7);
});
for(const [scope,code] of [["baseline","INSUFFICIENT_BASELINE_OBSERVATIONS"],["intervention","INSUFFICIENT_INTERVENTION_OBSERVATIONS"]] as const)test(`analysis insufficient ${scope} does not invent observations`,()=>{
  const input=fixture();input[scope]!.observations.splice(4);input[scope]!.observationCount=4;
  const r=analyzeCapturedInput(input);assert.equal(r.eligibility.state,"insufficient_data");assert.equal(r.outcomeQuality[scope].missingObservations,3);assert.equal(r.facts,null);hasReason(input,code);
});
test("analysis unknown exposure is not non-adherence",()=>{
  const input=fixture();Object.assign(input.exposure!,{adherentCount:6,unknownCount:1,evidenceCompleteness:"incomplete",classification:"unknown"});input.exposure!.opportunities[0].state="unknown";
  assert.equal(analyzeCapturedInput(input).eligibility.state,"insufficient_data");assert.equal(analyzeCapturedInput(input).exposureQuality?.nonAdherentCount,0);
});
for(const completeness of ["failed","truncated"] as const)test(`analysis ${completeness} read has unavailable denominator and no effect`,()=>{
  const input=fixture();input.baseline!.queryCompleteness=completeness;const r=analyzeCapturedInput(input);
  assert.equal(r.eligibility.state,"unable_to_determine");assert.equal(r.outcomeQuality.baseline.missingObservations,null);assert.equal(r.facts,null);
});
for(const [name,mutate,code] of [
  ["pause",(i:AnalysisInput)=>{i.exposure!.pauseState="unknown";},"UNRESOLVED_PAUSE_HISTORY"],
  ["revision",(i:AnalysisInput)=>{i.experiment.revision=2;},"START_SNAPSHOT_OR_REVISION_MISMATCH"],
  ["source",(i:AnalysisInput)=>{i.exposure!.frozenSourceId=ID;},"EXPOSURE_IDENTITY_OR_CUTOFF_MISMATCH"],
  ["current-only integrity",(i:AnalysisInput)=>{i.exposure!.sourceIntegrity="current_criteria_match";},"EXPOSURE_HISTORICAL_INTEGRITY_UNVERIFIED"],
  ["source window",(i:AnalysisInput)=>{i.baseline!.window.evaluatedAt="2026-08-16T12:00:00.000Z";},"OBSERVATION_IDENTITY_VERSION_OR_CUTOFF_MISMATCH"],
  ["definition",(i:AnalysisInput)=>{(primary(i).definition as Record<string,unknown>).unit="kg";},"OUTCOME_DEFINITION_VERSION_MISMATCH"],
  ["duplicate day",(i:AnalysisInput)=>{i.baseline!.observations[1].logicalDate=i.baseline!.observations[0].logicalDate;},"DUPLICATE_OBSERVATION_DAY"],
  ["target",(i:AnalysisInput)=>{i.baseline!.target={kind:"exercise",exerciseId:ID};},"OBSERVATION_TARGET_OR_GRAIN_MISMATCH"],
  ["exposure dates",(i:AnalysisInput)=>{i.exposure!.opportunities[0].date="2026-08-01";},"EXPOSURE_OPPORTUNITY_OR_REVISION_MISMATCH"],
] as const)test(`analysis blocks ${name} integrity`,()=>{const input=fixture();mutate(input);hasReason(input,code);assert.equal(analyzeCapturedInput(input).facts,null);});
test("analysis unsupported baseline and terminal lifecycle remain explicit",()=>{
  for(const mode of ["none","prospective"]){const input=fixture();input.startSnapshot!.configuration.baseline_mode=mode;assert.equal(analyzeCapturedInput(input).eligibility.state,"unsupported_design");}
  const input=fixture();input.experiment.status="completed";hasReason(input,"UNSUPPORTED_LIFECYCLE_PHASE");
});
test("analysis count, binary and pre/post contracts never fabricate denominators or tests",()=>{
  for(const [key,code,target] of [["condition_episode_frequency","EVENT_SURVEILLANCE_DENOMINATOR_UNAVAILABLE",{user_condition_id:ID}],["exercise_estimated_1rm","PRE_POST_ASSESSMENT_PROTOCOL_UNAVAILABLE",{exercise_id:ID}],["body_weight","UNSUPPORTED_OUTCOME_TYPE",{}],["binary_present_absent","UNSUPPORTED_OUTCOME_TYPE",{}]] as const){
    const input=fixture(),def=measurement(key,1);Object.assign(primary(input),{registry_key:key,definition:def,aggregation_method:def?.aggregations[0]??"proportion",...target});const plan=inspectAnalysisPlan(input);assert.ok(plan.issues.some(r=>r.code===code));assert.equal(plan.method,null);
  }
});
test("analysis ratio summaries and zero baseline percent are safe",()=>{
  assert.deepEqual(summarizeContinuous([1,2,3,4]),{kind:"continuous",count:4,mean:2.5,median:2.5,minimum:1,maximum:4});
  const r=analyzeCapturedInput(fixture("nutrition_protein_grams",[0,0,0,0,0],[1,1,1,1,1]));assert.equal(r.facts?.relativeChangePercent,null);assert.equal(r.facts?.absoluteChange,1);
});
test("analysis ordinal medians preserve ranks without averaging or percent change",()=>{
  assert.deepEqual(summarizeOrdinal([1,2,3,4]),{kind:"ordinal",count:4,medianLower:2,medianUpper:3,distribution:[1,2,3,4].map(value=>({value,count:1}))});
  const r=analyzeCapturedInput(fixture("energy_score",[1,2,2,3,3,4],[4,5,5,6,6,7]));assert.equal(r.eligibility.state,"ready");assert.equal(r.facts?.baseline.kind,"ordinal");assert.equal(r.facts?.absoluteChange,null);assert.equal(r.facts?.relativeChangePercent,null);assert.equal(r.facts?.neutralMovement,"higher");
});
test("analysis partial nutrition values are not known intake and known non-adherent days remain",()=>{
  const input=fixture();input.baseline!.nutritionDays![0].coverageStatus="partial";input.intervention!.nutritionDays![0].fieldComplete=false;
  Object.assign(input.exposure!,{adherentCount:6,nonAdherentCount:1,classification:"non-adherent"});input.exposure!.opportunities[0].state="non-adherent";
  const r=analyzeCapturedInput(input);assert.equal(r.eligibility.state,"ready");assert.equal(r.outcomeQuality.baseline.eligibleObservations,6);assert.equal(r.outcomeQuality.intervention.eligibleObservations,6);assert.equal(r.outcomeQuality.baseline.missingObservations,1);assert.ok(r.limitations.includes("MISSING_OBSERVATIONS_NOT_IMPUTED"));
});
test("analysis explicit frozen desirability controls direction, not expected movement",()=>{
  assert.equal(classifyDirection("higher","lower"),"worsened");assert.equal(classifyDirection("lower","lower"),"improved");assert.equal(classifyDirection("unchanged","higher"),"little_change");assert.equal(classifyDirection("higher","unknown"),"indeterminate");
  const input=fixture();primary(input).success_criterion={version:1,kind:"change",basis:"absolute",direction:"decrease",operator:"gte",amount:1,unit:measurement("nutrition_protein_grams",1)!.unit};assert.equal(analyzeCapturedInput(input).facts?.direction,"worsened");
});
test("analysis captured cutoff replay is deterministic and detached, digest detects changes",()=>{
  const input=fixture(),bundle=captureAnalysisBundle(input);input.baseline!.observations[0].value.value=999;
  const replay=JSON.parse(JSON.stringify(bundle));assert.deepEqual(analyzeCapturedInput(replay.input,replay.inputDigest),bundle.result);
  replay.input.experiment.revision=99;assert.equal(analyzeCapturedInput(replay.input,replay.inputDigest).eligibility.state,"blocked_by_integrity");
  const reordered={...bundle.input,experiment:{...bundle.input.experiment}};assert.deepEqual(captureAnalysisBundle(reordered).result,bundle.result);
});
test("analysis no effects for unfinished windows and invalid cutoff",()=>{
  const input=fixture();input.cutoff="2026-08-14T12:00:00.000Z";assert.ok(inspectAnalysisPlan(input).issues.some(i=>i.code==="INTERVENTION_PERIOD_NOT_FINISHED"));
  input.cutoff="invalid";hasReason(input,"INVALID_REPRODUCIBLE_CUTOFF");
});
test("analysis tier vocabulary is conservative and implementation is server-only",()=>{
  const result=analyzeCapturedInput(fixture());assert.ok(["descriptive","indeterminate"].includes(result.interpretationTier));assert.equal(result.facts?.trend,null);assert.equal(result.facts?.rateRatio,null);
  for(const file of ["analysis.ts","analysis-service.ts"])assert.match(readFileSync(new URL(file,import.meta.url),"utf8"),/^import "server-only"/);
  assert.doesNotMatch(JSON.stringify(result.facts),/proven|caused|p_value|confidence|significance/i);
});

function fakeClient({anonymous=false,foreign=false,failSnapshot=false}={}) {
  const input=fixture(),calls:{table:string;filters:Record<string,unknown>}[]=[];
  // Unsupported baseline stops before adapters; checks auth, ownership and frozen selection.
  input.startSnapshot!.configuration.baseline_mode="none";
  const client={auth:{getUser:async()=>({data:{user:anonymous?null:{id:ID}},error:null})},from(table:string){
    const filters:Record<string,unknown>={};calls.push({table,filters});
    const q={select(){return q;},eq(k:string,v:unknown){filters[k]=v;return q;},limit(){return q;},abortSignal(){return q;},maybeSingle:async()=>({data:foreign?null:table==="experiments"?{id:ID,config_revision:1,model_version:2,status:"active",current_phase:"intervention"}:input.startSnapshot,error:failSnapshot&&table==="experiment_start_snapshots"?{message:"private failure"}:null})};return q;
  }} as unknown as SupabaseClient;
  return {client,calls};
}
test("analysis service authenticates before data reads and does not reveal foreign experiments",async()=>{
  const anon=fakeClient({anonymous:true});await assert.rejects(()=>buildExperimentAnalysis(anon.client,ID),/AUTH_REQUIRED/);assert.equal(anon.calls.length,0);
  const foreign=fakeClient({foreign:true});await assert.rejects(()=>buildExperimentAnalysis(foreign.client,ID),/EXPERIMENT_NOT_FOUND/);assert.equal(foreign.calls.length,1);
});
test("analysis service uses owned frozen configuration, safe failures and bounded query paths",async()=>{
  const fake=fakeClient(),r=await buildExperimentAnalysis(fake.client,ID,()=>new Date(CUTOFF));assert.equal(r.result.eligibility.state,"unsupported_design");assert.equal(r.input.cutoff,CUTOFF);
  assert.equal(fake.calls.length,2);assert.ok(fake.calls.every(c=>c.filters.user_id===ID));assert.equal(fake.calls[1].filters.experiment_id,ID);
  await assert.rejects(()=>buildExperimentAnalysis(fakeClient({failSnapshot:true}).client,ID),/TEMPORARILY_UNAVAILABLE/);
  await assert.rejects(()=>buildExperimentAnalysis(fake.client,"invalid"),/INVALID_EXPERIMENT_ID/);
});

function acquiringClient(changeLifecycle=false,failObservations=false) {
  const input=fixture(),calls:{name:string;args:Record<string,unknown>}[]=[];let experimentReads=0;
  const client={auth:{getUser:async()=>({data:{user:{id:ID}},error:null})},
    from(name:string){const filters:Record<string,unknown>={};calls.push({name,args:filters});let single=false;
      const q={select(){return q;},eq(k:string,v:unknown){filters[k]=v;return q;},limit(){return q;},abortSignal(){return q;},maybeSingle(){single=true;return q;},then(resolve:(v:unknown)=>unknown){
        const data=name==="experiments"?{id:ID,config_revision:1,model_version:2,status:++experimentReads>1&&changeLifecycle?"paused":"active",current_phase:"intervention"}:name==="experiment_start_snapshots"?input.startSnapshot:[];
        return Promise.resolve({data:single?data:[],error:null}).then(resolve);
      }};return q;},
    rpc(name:string,args:Record<string,unknown>){calls.push({name,args});
      const dates=Array.from({length:7},(_,n)=>shiftDate(String(args.start_date),n));
      const value=args.start_date==="2026-08-01"?10:20;
      const data={version:1,truncated:false,entries:dates.map(d=>({id:`entry-${d}`,user_id:ID,consumed_at:`${d}T12:00:00Z`})),items:dates.map(d=>({id:`item-${d}`,nutrition_entry_id:`entry-${d}`,protein_grams:value,calories:20})),coverage:dates.map(d=>({local_date:d,time_zone:"America/New_York",coverage_status:"complete"}))};
      return {abortSignal(){return this;},then(resolve:(v:unknown)=>unknown){return Promise.resolve({data,error:failObservations?{message:"private detail"}:null}).then(resolve);}};
    }} as unknown as SupabaseClient;
  return {client,calls};
}
test("analysis service acquires ready nutrition evidence through authoritative adapters with one cutoff",async()=>{
  const f=acquiringClient(),bundle=await buildExperimentAnalysis(f.client,ID,()=>new Date(CUTOFF));
  assert.equal(bundle.result.eligibility.state,"ready",JSON.stringify(bundle.result.eligibility));assert.equal(bundle.result.facts?.absoluteChange,10);
  const rpc=f.calls.filter(c=>c.name==="read_nutrition_observations_v1");assert.equal(rpc.length,3);assert.ok(rpc.every(c=>c.args.evaluation_cutoff===CUTOFF));
  assert.deepEqual(analyzeCapturedInput(bundle.input,bundle.inputDigest),bundle.result);assert.equal(f.calls.filter(c=>c.name==="experiments").length,2);
});
test("analysis service lifecycle races and failed acquisition cannot return facts",async()=>{
  const changed=await buildExperimentAnalysis(acquiringClient(true).client,ID,()=>new Date(CUTOFF));assert.ok(changed.result.eligibility.reasons.some(r=>r.code==="LIFECYCLE_CHANGED_DURING_CAPTURE"));assert.equal(changed.result.facts,null);
  const failed=await buildExperimentAnalysis(acquiringClient(false,true).client,ID,()=>new Date(CUTOFF));assert.notEqual(failed.result.eligibility.state,"ready");assert.equal(failed.result.facts,null);assert.doesNotMatch(JSON.stringify(failed),/private detail/);
});
test("analysis detects contradictory separately captured exposure and outcome for the same nutrient",()=>{
  const input=fixture(),intervention=input.startSnapshot!.configuration.intervention as {configuration:Record<string,unknown>};
  intervention.configuration.definition={...rule,metric:"protein_grams",unit:"g",value:30};
  hasReason(input,"EXPOSURE_OUTCOME_CAPTURE_CONFLICT");assert.equal(analyzeCapturedInput(input).facts,null);
});
