import {isObject} from "../rules/validation.ts";
import type {ResultsDTO,RevisionData} from "../../components/experiments/ResultsView";
const fail=():never=>{throw new Error("The results response did not match the supported public contract. Refresh safely.");};
const object=(v:unknown):Record<string,unknown>=>isObject(v)?v:fail();
const finite=(v:unknown)=>typeof v==="number"&&Number.isFinite(v);
const count=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
const nullableCount=(v:unknown)=>v===null||count(v);
const text=(v:unknown)=>typeof v==="string"&&v.length<=2000;
const state=(v:unknown)=>["ready","insufficient_data","unable_to_determine","unsupported_design","blocked_by_integrity"].includes(String(v));
const keys=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
function summary(v:unknown){const s=object(v);if(!count(s.count))fail();if(s.kind==="continuous"){if(![s.mean,s.median,s.minimum,s.maximum].every(finite))fail();}else if(s.kind==="ordinal"){if(!finite(s.medianLower)||!finite(s.medianUpper)||!Array.isArray(s.distribution)||s.distribution.length>100||s.distribution.some(d=>!isObject(d)||!finite(d.value)||!count(d.count)))fail();}else fail();}
function reliability(v:unknown){
 const r=object(v);if(!keys(r,["version","methodVersion","status","method","estimate","interval","nullReference","comparison","sample","assumptions","limitations"])||r.version!==1||r.methodVersion!==1||!["supported","insufficient_data","unsupported_method","unable_to_determine"].includes(String(r.status)))fail();
 const comparison=object(r.comparison),sample=object(r.sample);
 if(!keys(comparison,["state"])||!["difference_detected","no_clear_difference","indeterminate"].includes(String(comparison.state))||!keys(sample,["baseline","intervention","baselineBlockLength","interventionBlockLength","iterations"])||![sample.baseline,sample.intervention].every(count)||Number(sample.baseline)>366||Number(sample.intervention)>366||![sample.baselineBlockLength,sample.interventionBlockLength,sample.iterations].every(nullableCount)||!Array.isArray(r.assumptions)||!Array.isArray(r.limitations)||r.assumptions.length>20||r.limitations.length>20||[...r.assumptions,...r.limitations].some(c=>!text(c)))fail();
 if(r.status==="supported"){
  const estimate=object(r.estimate),interval=object(r.interval);
  if(r.method!=="moving_block_bootstrap_period_mean_difference_v1"||!keys(estimate,["value","unit"])||!finite(estimate.value)||!(estimate.unit===null||text(estimate.unit))||!keys(interval,["lower","upper","level"])||!finite(interval.lower)||!finite(interval.upper)||Number(interval.lower)>Number(interval.upper)||interval.level!==0.95||r.nullReference!==0||comparison.state==="indeterminate"||sample.iterations!==2000)fail();
 }else if(r.method!==null||r.estimate!==null||r.interval!==null||r.nullReference!==null||comparison.state!=="indeterminate")fail();
}
/** Validate response shape before rendering; this performs no analysis. */
export function parseResultsResponse(value:unknown):ResultsDTO {
 const v=object(value);
 if(!keys(v,["analysisRevision","analysisPolicyVersion","analysisContractVersion","eligibility","family","method","facts","reliability","outcomeQuality","exposureQuality","interpretationTier","limitations","capturedAt","display"])||!count(v.analysisRevision)||Number(v.analysisRevision)<1||Number(v.analysisRevision)>32||![1,2].includes(Number(v.analysisContractVersion))||![1,2].includes(Number(v.analysisPolicyVersion)))fail();
 const eligibility=object(v.eligibility);
 if(!state(eligibility.state)||!Array.isArray(eligibility.reasons)||eligibility.reasons.some(r=>!isObject(r)||!text(r.code)||!state(r.state)))fail();
 if(!["descriptive","indeterminate"].includes(String(v.interpretationTier))||!Array.isArray(v.limitations)||v.limitations.some(c=>!text(c))||!(v.capturedAt===null||typeof v.capturedAt==="string"&&Number.isFinite(Date.parse(v.capturedAt))))fail();
 const quality=object(v.outcomeQuality);
 for(const period of ["baseline","intervention"]){const q=object(quality[period]);if(![q.expected,q.observed,q.missing].every(nullableCount)||!["complete","failed","truncated","unavailable"].includes(String(q.readCompleteness)))fail();}
 if(v.exposureQuality!==null){const e=object(v.exposureQuality);if(![e.eligible,e.adherent,e.nonAdherent,e.unknown].every(nullableCount)||!text(e.completeness)||!text(e.integrity))fail();}
 if(v.facts!==null){const f=object(v.facts);if(eligibility.state!=="ready")fail();summary(f.baseline);summary(f.intervention);if(![f.absoluteChange,f.relativeChangePercent].every(n=>n===null||finite(n))||!["higher","lower","unchanged","indeterminate"].includes(String(f.neutralMovement))||!["improved","worsened","little_change","indeterminate"].includes(String(f.direction)))fail();}
 reliability(v.reliability);
 if(v.display!==undefined&&v.display!==null){const d=object(v.display);if(![1,2].includes(Number(d.version)))return {...v,display:null} as ResultsDTO;const common=!text(d.outcomeLabel)||!(d.unit===null||text(d.unit))||!(d.scaleLabel===null||text(d.scaleLabel));if(common)fail();if(d.version===1&&!keys(d,["version","outcomeLabel","unit","scaleLabel"]))fail();if(d.version===2){if(!keys(d,["version","outcomeLabel","unit","scaleLabel","experimentName","question","interventionLabel","design"])||![d.experimentName,d.question,d.interventionLabel].every(x=>x===null||text(x)))fail();const design=object(d.design);if(!keys(design,["baselineDays","plannedDays","activeDays","excludedDays","baselineStart","baselineEnd","experimentStart","experimentEnd"])||![design.baselineDays,design.plannedDays,design.activeDays,design.excludedDays].every(nullableCount)||![design.baselineStart,design.baselineEnd,design.experimentStart,design.experimentEnd].every(x=>x===null||text(x)))fail();}}
 return v as ResultsDTO;
}
export function parseRevisionResponse(value:unknown):RevisionData {
 const v=object(value),e=object(v.experiment);
 if(!text(e.id)||!text(e.name)||!text(e.question)||!text(e.status)||!(e.plannedEnd===null||text(e.plannedEnd))||!(e.actualEnd===null||text(e.actualEnd))||!count(v.latestRevision)||Number(v.latestRevision)>32||!count(v.lifecycleRevision)||Number(v.lifecycleRevision)>100||typeof v.canCapture!=="boolean"||!(v.captureReason===null||text(v.captureReason)))fail();
 if(!Array.isArray(v.revisions)||v.revisions.length>4)fail();
 let previous=33;
 for(const item of v.revisions as unknown[]){const r=object(item);if(!count(r.revision)||Number(r.revision)<1||Number(r.revision)>=previous||Number(r.revision)>Number(v.latestRevision)||!state(r.eligibility)||typeof r.capturedAt!=="string"||!Number.isFinite(Date.parse(r.capturedAt)))fail();previous=Number(r.revision);}
 if(v.nextBefore!==null&&(!count(v.nextBefore)||Number(v.nextBefore)!==previous||previous<=1))fail();
 return v as RevisionData;
}
