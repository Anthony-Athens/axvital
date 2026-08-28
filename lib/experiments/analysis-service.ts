import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ApiError} from "../api/validation.ts";
import {isUuid} from "../rules/validation.ts";
import {readObservations} from "../measurements/sources/index.ts";
import {ownedExperiment} from "./draft-read.ts";
import {readExposureEvidence} from "./exposure-reader.ts";
import {captureAnalysisBundle,inspectAnalysisPlan,reason} from "./analysis.ts";
import type {AnalysisInput} from "./analysis-contract.ts";

/** Private, read-only server service; never serialize this bundle to an HTTP client.
 * Clock is a server/test dependency, not a caller-supplied analysis override.
 * Replay requires retaining the returned bundle: current records are not an as-of store.
 */
export async function buildExperimentAnalysis(client:SupabaseClient,id:string,clock:()=>Date=()=>new Date()) {
  if(!isUuid(id))throw new ApiError(400,"INVALID_EXPERIMENT_ID");
  const auth=await client.auth.getUser().catch(()=>{throw new ApiError(401,"AUTH_REQUIRED");});
  if(auth.error||!auth.data.user)throw new ApiError(401,"AUTH_REQUIRED");
  const owner=auth.data.user.id,experiment=await ownedExperiment(client,owner,id),now=clock();
  const {data,error}=await client.from("experiment_start_snapshots").select("snapshot_version,config_revision,configuration").eq("user_id",owner).eq("experiment_id",id).limit(1).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
  if(error)throw new ApiError(503,"TEMPORARILY_UNAVAILABLE");
  const input:AnalysisInput={analysisContractVersion:1,analysisPolicyVersion:1,readinessPolicyVersion:1,
    experiment:{id,revision:Number(experiment.config_revision),modelVersion:Number(experiment.model_version),status:String(experiment.status),phase:String(experiment.current_phase)},
    startSnapshot:data,cutoff:now.toISOString(),reproducibility:"captured_inputs_only",baseline:null,intervention:null,exposure:null,acquisitionIssues:[],
    integrityLimitations:["CURRENT_RECORD_RETROSPECTIVE","MUTABLE_HISTORY_NOT_RECONSTRUCTED","MULTIPLE_READS_NOT_TRANSACTIONALLY_ATOMIC","REPLAY_REQUIRES_RETAINED_INPUT_BUNDLE"]};
  const plan=inspectAnalysisPlan(input);
  if(plan.issues.length===0&&plan.outcome&&plan.baselineWindow&&plan.interventionWindow) {
    const outcome=plan.outcome;
    const results=await Promise.allSettled([
      readObservations(client,{outcome,timeZone:plan.baselineWindow.timeZone,startDate:plan.baselineWindow.startDate,endDateExclusive:plan.baselineWindow.endDateExclusive},()=>now),
      readObservations(client,{outcome,timeZone:plan.interventionWindow.timeZone,startDate:plan.interventionWindow.startDate,endDateExclusive:plan.interventionWindow.endDateExclusive},()=>now),
      readExposureEvidence(client,owner,experiment,data,now),
    ] as const);
    if(results[0].status==="fulfilled")input.baseline=results[0].value;
    if(results[1].status==="fulfilled")input.intervention=results[1].value;
    if(results[2].status==="fulfilled")input.exposure=results[2].value;
    const latest=await ownedExperiment(client,owner,id);
    if(["config_revision","status","current_phase"].some(k=>latest[k]!==experiment[k]))input.acquisitionIssues.push(reason("LIFECYCLE_CHANGED_DURING_CAPTURE","input","blocked_by_integrity"));
    const pauses=await client.from("experiment_phase_events").select("id").eq("user_id",owner).eq("experiment_id",id).eq("event_type","paused").limit(1).abortSignal(AbortSignal.timeout(10000));
    if(pauses.error||!Array.isArray(pauses.data)||pauses.data.length)input.acquisitionIssues.push(reason("UNRESOLVED_PAUSE_HISTORY","input","blocked_by_integrity"));
  }
  return captureAnalysisBundle(input);
}
