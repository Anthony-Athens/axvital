// Synthetic evidence only. Never import this fixture into production routes.
import {createHash} from "node:crypto";
import {measurement} from "../../measurements/registry.ts";
import {replayDurableCapture,publicAnalysis} from "../durable-evidence.ts";
import {retainedResultsDisplay} from "../results-display.ts";
import type {ResultsDTO,RevisionData} from "../../../components/experiments/ResultsView.tsx";
export const fixtureId="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
export function fixtureCapture(key="nutrition_protein_grams",revision=1,value=20){
 const start="2026-08-08T00:00:00.000Z",end="2026-08-22T00:00:00.000Z",cutoff="2026-08-23T12:00:00.000Z";
 const definition=measurement(key,key==="body_weight"?2:1)!;
 const configuration={model_version:2,name:`Protein 15 & ${definition.label}`,question:"Does my routine appear associated with my recorded outcome?",baseline_mode:"historical",analysis_timezone:"UTC",baseline_start_date:"2026-08-01",baseline_end_date:"2026-08-07",intervention_start_date:"2026-08-08",intervention_end_date:"2026-08-21",outcomes:[{registry_key:key,registry_version:definition.version,outcome_role:"primary",aggregation_method:definition.scale==="ratio"?"average":"median",expected_direction:"unknown",source_config:{},definition}],intervention:{type:"nutrition_target",configuration:{id:"bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",revision:1,definition:{version:1,domain:"nutrition",kind:"numeric",metric:"protein_grams",operator:"gte",value:15,unit:"g",period:"day"}}}};
 const frame=(first:number,count:number,grams:number)=>{const dates=Array.from({length:count},(_,i)=>`2026-08-${String(first+i).padStart(2,"0")}`);return {start:dates[0],end:`2026-08-${String(first+count).padStart(2,"0")}`,checkins:dates.map(d=>({id:d,user_id:fixtureId,checkin_date:d,energy_score:first===1?5:7,mood_score:first===1?4:6,sleep_quality:first===1?"Average":"Good",...(key==="body_weight"?{weight:first===1?180:175,weight_source_value:first===1?180:175,weight_source_unit:"lb",weight_provenance_version:1,weight_kg:(first===1?180:175)*0.45359237}:{})})),nutrition:{version:1,truncated:false,entries:dates.map(d=>({id:d,user_id:fixtureId,consumed_at:`${d}T12:00:00Z`})),items:dates.map(d=>({id:d,nutrition_entry_id:d,protein_grams:grams})),coverage:dates.map(d=>({local_date:d,time_zone:"UTC",coverage_status:"complete"}))}};};
 const raw={captureVersion:1,analysisPolicyVersion:2,versions:{analysisContract:2,readinessPolicy:1,sourceAdapter:1,measurementRegistry:definition.version,exposureContract:1,lifecycleContract:1},cutoff,experiment:{id:fixtureId,user_id:fixtureId,config_revision:1,model_version:2,status:"completed",current_phase:"complete",actual_started_at:start,actual_completed_at:end,ended_early_at:null},startSnapshot:{snapshot_version:1,config_revision:1,configuration},events:[{event_type:"intervention_started",occurred_at:start,from_status:"draft",to_status:"active",from_phase:"planning",to_phase:"intervention",metadata:{model_version:2,config_revision:1}},{event_type:"completed",occurred_at:end,from_status:"active",to_status:"completed",from_phase:"intervention",to_phase:"complete",metadata:{lifecycle_version:1,lifecycle_revision:1,provenance:"v2_transition_rpc",config_revision:1}}],baseline:frame(1,7,10),intervention:frame(8,14,value)};
 const evidence_text=JSON.stringify(raw);
 return {raw,row:{analysis_revision:revision,config_revision:1,lifecycle_revision:1,analysis_policy_version:2,capture_version:1,captured_at:cutoff,evidence_text,digest:createHash("sha256").update(evidence_text).digest("hex")}};
}
export async function fixtureResult(key="nutrition_protein_grams",revision=1,value=20):Promise<ResultsDTO>{const {row}=fixtureCapture(key,revision,value),bundle=await replayDurableCapture(row);return {...publicAnalysis(bundle.result,revision),capturedAt:row.captured_at,display:retainedResultsDisplay(bundle.input)};}
export async function fixtureVariant(kind:string):Promise<ResultsDTO>{
 const {row,raw}=fixtureCapture();let evidence:unknown=raw;
 if(kind==="insufficient_data")raw.baseline.nutrition.coverage.slice(0,4).forEach(c=>{c.coverage_status="partial";});
 if(kind==="unable_to_determine")raw.baseline.nutrition.truncated=true;
 if(kind==="unsupported_design")raw.startSnapshot.configuration.outcomes[0].aggregation_method="sum";
 if(kind==="blocked_by_integrity")raw.events[1].metadata.lifecycle_version=0;
 if(kind==="partial_adherence"){
  raw.intervention.nutrition.items.slice(0,2).forEach(item=>{item.protein_grams=10;});
 }
 if(kind==="unknown_adherence"){
  raw.intervention.nutrition.coverage.slice(-2).forEach(day=>{day.coverage_status="partial";});
 }
 if(kind==="early_pause"){
  const event=(event_type:string,occurred_at:string,lifecycle_revision:number,from_status:string,to_status:string)=>({event_type,occurred_at,from_status,to_status,from_phase:"intervention",to_phase:to_status==="ended_early"?"analysis":"intervention",metadata:{lifecycle_version:1,lifecycle_revision,provenance:"v2_transition_rpc",config_revision:1}});
  const nutrition=raw.intervention.nutrition;
  evidence={...raw,experiment:{...raw.experiment,status:"ended_early",current_phase:"analysis",actual_completed_at:null,ended_early_at:"2026-08-18T12:00:00Z"},events:[raw.events[0],event("paused","2026-08-10T12:00:00Z",1,"active","paused"),event("resumed","2026-08-11T12:00:00Z",2,"paused","active"),event("ended_early","2026-08-18T12:00:00Z",3,"active","ended_early")],intervention:{...raw.intervention,end:"2026-08-18",checkins:raw.intervention.checkins.filter(c=>c.checkin_date<"2026-08-18"),nutrition:{...nutrition,entries:nutrition.entries.filter(e=>e.id<"2026-08-18"),items:nutrition.items.filter(e=>e.id<"2026-08-18"),coverage:nutrition.coverage.filter(c=>c.local_date<"2026-08-18")}}};row.lifecycle_revision=3;
 }
 const evidence_text=JSON.stringify(evidence),bundle=await replayDurableCapture({...row,evidence_text,digest:createHash("sha256").update(evidence_text).digest("hex")});
 return {...publicAnalysis(bundle.result,1),capturedAt:row.captured_at,display:retainedResultsDisplay(bundle.input)};
}
export function fixtureMetadata(results:ResultsDTO[]):RevisionData {
 return {experiment:{id:fixtureId,name:"Disposable synthetic study",question:"Does my routine appear associated with my recorded outcome?",status:"completed",phase:"complete",plannedEnd:"2026-08-21",actualEnd:"2026-08-22T00:00:00Z"},latestRevision:results.at(-1)?.analysisRevision??0,lifecycleRevision:1,canCapture:true,captureReason:null,revisions:[...results].reverse().map(r=>({revision:r.analysisRevision,capturedAt:r.capturedAt!,analysisPolicyVersion:r.analysisPolicyVersion,analysisContractVersion:r.analysisContractVersion,eligibility:r.eligibility.state})),nextBefore:null};
}
