import "server-only";
import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ApiError} from "../api/validation.ts";
import {isUuid,isObject} from "../rules/validation.ts";
import {readObservations} from "../measurements/sources/index.ts";
import {supportedFrozenTarget} from "../nutrition/frozen-target.ts";
import {summarizeEvidence,reconciledNutritionOpportunities,type ExposureEvidence} from "./exposure-evidence.ts";
import {captureAnalysisBundle,inspectAnalysisPlan} from "./analysis.ts";
import type {AnalysisInput,AnalysisResult} from "./analysis-contract.ts";
import type {LifecycleEvent} from "./lifecycle.ts";

type Frame={start:string;end:string;nutrition:unknown;checkins:Record<string,unknown>[]};
type Evidence={captureVersion:1;analysisPolicyVersion:2;versions:Record<string,number>;cutoff:string;experiment:{id:string;user_id:string;config_revision:number;model_version:number;status:string;current_phase:string;actual_started_at:string|null;actual_completed_at:string|null;ended_early_at:string|null};startSnapshot:NonNullable<AnalysisInput["startSnapshot"]>;events:LifecycleEvent[];baseline:Frame;intervention:Frame};
export type StoredCapture={analysis_revision:number;config_revision:number;lifecycle_revision:number;analysis_policy_version:number;capture_version:number;captured_at:string;evidence_text:string;digest:string};
const iso=(s:string|null)=>s===null?null:new Date(s).toISOString();
// PostgreSQL timestamps can carry microseconds. Round starts/resumes inward so
// a sub-millisecond partial day can never become a whole active day in JS.
const inwardStart=(s:string|null)=>s===null?null:new Date(Date.parse(s)+(/\.(\d+)/.exec(s)?.[1].slice(3).match(/[1-9]/)?1:0)).toISOString();

/** Fixed-purpose in-memory transport for the existing adapters. It can read only
 * rows inside this durable capture; no database, source mutation or fallback path.
 */
function capturedClient(owner:string,frame:Frame):SupabaseClient {
  return {auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},
    rpc(name:string){if(name!=="read_nutrition_observations_v1")throw new Error("UNSUPPORTED_CAPTURE_ADAPTER");return {abortSignal:async()=>({data:frame.nutrition,error:null})};},
    from(name:string){if(name!=="daily_checkins")throw new Error("UNSUPPORTED_CAPTURE_ADAPTER");
      let rows=frame.checkins;
      const q={select(){return q;},eq(k:string,v:unknown){rows=rows.filter(r=>r[k]===v);return q;},gte(k:string,v:string){rows=rows.filter(r=>String(r[k])>=v);return q;},lt(k:string,v:string){rows=rows.filter(r=>String(r[k])<v);return q;},order(){return q;},limit(){return q;},abortSignal:async()=>({data:rows,count:rows.length,error:null})};return q;
    }} as unknown as SupabaseClient;
}

/** Private replay API. The stored SHA-256 covers the exact UTF-8 SQL JSON text,
 * avoiding cross-language JSON canonicalization assumptions. No current reads.
 */
export async function replayDurableCapture(capture:StoredCapture) {
  if(capture.capture_version!==1||capture.analysis_policy_version!==2||Buffer.byteLength(capture.evidence_text,"utf8")>2097152||createHash("sha256").update(capture.evidence_text).digest("hex")!==capture.digest)throw new ApiError(409,"CAPTURE_INTEGRITY_MISMATCH");
  const raw=JSON.parse(capture.evidence_text) as Evidence;
  const versions={analysisContract:2,readinessPolicy:1,sourceAdapter:1,measurementRegistry:1,exposureContract:1,lifecycleContract:1};
  if(Object.entries(versions).some(([k,v])=>raw.versions?.[k]!==v))throw new ApiError(409,"CAPTURE_VERSION_UNSUPPORTED");
  if(raw.captureVersion!==1||raw.analysisPolicyVersion!==2||raw.experiment.config_revision!==capture.config_revision||iso(raw.cutoff)!==iso(capture.captured_at)||!Number.isSafeInteger(capture.analysis_revision)||capture.analysis_revision<1)throw new ApiError(409,"CAPTURE_METADATA_MISMATCH");
  const e=raw.experiment,cutoff=iso(raw.cutoff)!;
  const input:AnalysisInput={analysisContractVersion:2,analysisPolicyVersion:2,readinessPolicyVersion:1,
    experiment:{id:e.id,revision:e.config_revision,modelVersion:e.model_version,status:e.status,phase:e.current_phase},startSnapshot:raw.startSnapshot,cutoff,reproducibility:"captured_inputs_only",
    lifecycle:{version:1,revision:capture.lifecycle_revision,actualStartedAt:inwardStart(e.actual_started_at),actualCompletedAt:iso(e.actual_completed_at),endedEarlyAt:iso(e.ended_early_at),events:raw.events.map(ev=>({...ev,occurred_at:["intervention_started","resumed"].includes(ev.event_type)?inwardStart(ev.occurred_at)!:iso(ev.occurred_at)!}))},
    durableCapture:{revision:capture.analysis_revision,digest:capture.digest,captureVersion:1},baseline:null,intervention:null,exposure:null,acquisitionIssues:[],
    integrityLimitations:["DURABLE_SOURCE_CAPTURE_NOT_SOURCE_HISTORY","CAPTURE_AT_ONE_DATABASE_READ_SNAPSHOT","SELF_REPORTED_EVIDENCE","PRE_CAPTURE_EDITS_NOT_RECONSTRUCTED"]};
  const plan=inspectAnalysisPlan(input);
  if(plan.issues.length||!plan.outcome||!plan.baselineWindow||!plan.interventionWindow||!plan.lifecycle)return captureAnalysisBundle(input);
  const zone=String(plan.frozen.analysis_timezone),now=()=>new Date(cutoff),outcome=plan.outcome;
  if(raw.baseline.start!==plan.baselineWindow.startDate||raw.baseline.end!==plan.baselineWindow.endDateExclusive||raw.intervention.start!==plan.interventionWindow.startDate||raw.intervention.end!==plan.interventionWindow.endDateExclusive)throw new ApiError(409,"CAPTURE_WINDOW_MISMATCH");
  const baselineClient=capturedClient(e.user_id,raw.baseline),interventionClient=capturedClient(e.user_id,raw.intervention);
  [input.baseline,input.intervention]=await Promise.all([
    readObservations(baselineClient,{outcome,timeZone:zone,startDate:raw.baseline.start,endDateExclusive:raw.baseline.end},now),
    readObservations(interventionClient,{outcome,timeZone:zone,startDate:raw.intervention.start,endDateExclusive:raw.intervention.end},now),
  ]);
  const target=supportedFrozenTarget(plan.source.definition);
  if(target){
    const source=await readObservations(interventionClient,{outcome:{registry_key:target.key,registry_version:1,outcome_role:"primary",aggregation_method:"average",expected_direction:"unknown",source_config:{}},timeZone:zone,startDate:raw.intervention.start,endDateExclusive:raw.intervention.end},now);
    const evidence:ExposureEvidence={contractVersion:1,interventionType:"nutrition_target",frozenSourceId:String(plan.source.id),frozenRevision:Number(plan.source.revision),experimentRevision:e.config_revision,phase:e.current_phase,evaluatedAt:cutoff,window:{startDate:raw.intervention.start,endDateExclusive:raw.intervention.end},denominator:"frozen_schedule",eligibleOpportunityCount:null,adherentCount:null,nonAdherentCount:null,unknownCount:null,classification:"unknown",evidenceCompleteness:"incomplete",sourceIntegrity:"frozen_definition_verified",opportunities:[],warnings:["Retained frozen nutrition evidence; whole active local days only."],today:"Study ended; historical capture.",pauseState:"clear"};
    input.exposure=summarizeEvidence(evidence,reconciledNutritionOpportunities(plan.lifecycle.activeDates,plan.source.definition,source),"frozen_schedule",source.queryCompleteness==="complete");
  }
  return captureAnalysisBundle(input);
}

/** Explicit allowlist projection. No source IDs, dates, raw observations, frozen
 * definitions, opportunity lists, digest, or private input bundle reach callers.
 */
export function publicAnalysis(result:AnalysisResult,analysisRevision:number) {
  const quality=(q:AnalysisResult["outcomeQuality"]["baseline"])=>({readCompleteness:q.readCompleteness,expected:q.expectedObservations,observed:q.eligibleObservations,missing:q.missingObservations,cadence:q.cadence});
  const exposure=result.exposureQuality;
  return {analysisRevision,analysisPolicyVersion:result.analysisPolicyVersion,analysisContractVersion:result.analysisContractVersion,eligibility:result.eligibility,family:result.family,method:result.method,facts:result.facts,
    outcomeQuality:{baseline:quality(result.outcomeQuality.baseline),intervention:quality(result.outcomeQuality.intervention)},
    exposureQuality:exposure?{eligible:exposure.eligibleOpportunityCount,adherent:exposure.adherentCount,nonAdherent:exposure.nonAdherentCount,unknown:exposure.unknownCount,completeness:exposure.evidenceCompleteness,integrity:exposure.sourceIntegrity}:null,
    interpretationTier:result.interpretationTier,limitations:result.limitations};
}
async function owner(client:SupabaseClient,id:string){
  if(!isUuid(id))throw new ApiError(400,"INVALID_EXPERIMENT_ID");
  const auth=await client.auth.getUser();if(auth.error||!auth.data.user)throw new ApiError(401,"AUTH_REQUIRED");return auth.data.user.id;
}
export async function readDurableAnalysis(client:SupabaseClient,id:string,revision:number) {
  const user=await owner(client,id);if(!Number.isSafeInteger(revision)||revision<1||revision>32)throw new ApiError(400,"INVALID_ANALYSIS_REVISION");
  const {data,error}=await client.from("experiment_evidence_captures").select("analysis_revision,config_revision,lifecycle_revision,analysis_policy_version,capture_version,captured_at,evidence_text,digest").eq("user_id",user).eq("experiment_id",id).eq("analysis_revision",revision).limit(1).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
  if(error)throw new ApiError(503,"TEMPORARILY_UNAVAILABLE");if(!data)throw new ApiError(404,"ANALYSIS_NOT_FOUND");
  const bundle=await replayDurableCapture(data as StoredCapture);
  if(bundle.input.experiment.id!==id)throw new ApiError(409,"CAPTURE_METADATA_MISMATCH");
  return {...publicAnalysis(bundle.result,revision),capturedAt:iso((data as StoredCapture).captured_at)};
}
/** Explicit mutation only; never called by a render/read. Optimistic revisions
 * make retries/conflicts explicit. SQL accepts identifiers, not scientific data.
 */
export async function captureDurableAnalysis(client:SupabaseClient,id:string,expectedAnalysisRevision:number,expectedLifecycleRevision:number) {
  await owner(client,id);
  if(![expectedAnalysisRevision,expectedLifecycleRevision].every(n=>Number.isSafeInteger(n)&&n>=0))throw new ApiError(400,"INVALID_REVISION");
  const {data,error}=await client.rpc("capture_experiment_evidence_v1",{target_id:id,expected_analysis_revision:expectedAnalysisRevision,expected_lifecycle_revision:expectedLifecycleRevision}).abortSignal(AbortSignal.timeout(10000));
  if(error){
    const known=["CAPTURE_REVISION_CONFLICT","CAPTURE_LIMIT","UNSUPPORTED_CAPTURE_DESIGN","UNSUPPORTED_CAPTURE_SOURCE","UNSUPPORTED_CAPTURE_OUTCOME","INVALID_CAPTURE_WINDOW","START_SNAPSHOT_REQUIRED"];
    if(known.includes(error.message))throw new ApiError(409,error.message);
    throw new ApiError(503,"CAPTURE_OUTCOME_UNCERTAIN");
  }
  if(!isObject(data)||data.analysisRevision!==expectedAnalysisRevision+1)throw new ApiError(503,"CAPTURE_OUTCOME_UNCERTAIN");
  return readDurableAnalysis(client,id,Number(data.analysisRevision));
}
