import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ApiError} from "../api/validation.ts";
import {ownedExperiment} from "./draft-read.ts";
import {readDurableAnalysis} from "./durable-evidence.ts";
import {isObject} from "../rules/validation.ts";
import {measurement} from "../measurements/registry.ts";
import {supportedFrozenTarget} from "../nutrition/frozen-target.ts";

const object=(v:unknown)=>isObject(v)?v:{};
/** Metadata pages replay at most four retained revisions, never all 32 bundles.
 * Returned values are an explicit allowlist; no artifact or event metadata.
 */
export async function discoverResultRevisions(client:SupabaseClient,owner:string,id:string,before=33) {
  const e=await ownedExperiment(client,owner,id);
  const [revisions,snapshot,events,bounds]=await Promise.all([
    client.from("experiment_evidence_captures").select("analysis_revision,captured_at,analysis_policy_version").eq("user_id",owner).eq("experiment_id",id).order("analysis_revision",{ascending:false}).limit(33).abortSignal(AbortSignal.timeout(10000)),
    client.from("experiment_start_snapshots").select("snapshot_version,config_revision,configuration").eq("user_id",owner).eq("experiment_id",id).limit(1).abortSignal(AbortSignal.timeout(10000)).maybeSingle(),
    client.from("experiment_phase_events").select("id",{count:"exact",head:true}).eq("user_id",owner).eq("experiment_id",id).eq("metadata->>lifecycle_version","1").abortSignal(AbortSignal.timeout(10000)),
    client.from("experiments").select("actual_completed_at,ended_early_at").eq("user_id",owner).eq("id",id).eq("model_version",2).limit(1).abortSignal(AbortSignal.timeout(10000)).maybeSingle(),
  ]);
  if([revisions,snapshot,events,bounds].some(r=>r.error)||!Array.isArray(revisions.data)||revisions.data.length>32||events.count===null||events.count>100)throw new ApiError(503,"RESULTS_INFRASTRUCTURE_UNAVAILABLE");
  const latestRevision=revisions.data[0]?.analysis_revision??0,lifecycleRevision=events.count;
  const frozen=object(snapshot.data?.configuration),intervention=object(frozen.intervention),source=object(intervention.configuration);
  const primary=(Array.isArray(frozen.outcomes)?frozen.outcomes:[]).map(object).find(o=>o.outcome_role==="primary"),def=measurement(String(primary?.registry_key),Number(primary?.registry_version));
  let captureReason:string|null=null;
  if(!["completed","ended_early"].includes(String(e.status)))captureReason="TERMINAL_STUDY_REQUIRED";
  else if(snapshot.data?.snapshot_version!==1||snapshot.data.config_revision!==e.config_revision)captureReason="START_SNAPSHOT_REQUIRED";
  else if(frozen.baseline_mode!=="historical")captureReason="HISTORICAL_BASELINE_REQUIRED";
  else if(intervention.type!=="nutrition_target"||!supportedFrozenTarget(source.definition))captureReason="UNSUPPORTED_INTERVENTION_SOURCE";
  else if(!def?.enabled||!["nutrition","checkins"].includes(def.sourceAdapter)||def.sourceAdapter==="nutrition"&&primary?.aggregation_method!=="average")captureReason=primary?.registry_key==="exercise_estimated_1rm"?"PRE_POST_ASSESSMENT_PROTOCOL_UNAVAILABLE":def?.grain==="window"?"EVENT_SURVEILLANCE_DENOMINATOR_UNAVAILABLE":"UNSUPPORTED_OUTCOME_TYPE";
  else if(latestRevision>=32)captureReason="CAPTURE_LIMIT";
  const page=revisions.data.filter(r=>r.analysis_revision<before).slice(0,4);
  const items=await Promise.all(page.map(async r=>{
    let eligibility:string,analysisContractVersion:number|null=null;
    try{const result=await readDurableAnalysis(client,id,r.analysis_revision);eligibility=result.eligibility.state;analysisContractVersion=result.analysisContractVersion;}
    catch(error){if(error instanceof ApiError&&error.status===409)eligibility="blocked_by_integrity";else throw error;}
    return {revision:r.analysis_revision,capturedAt:r.captured_at,analysisPolicyVersion:r.analysis_policy_version,analysisContractVersion,eligibility};
  }));
  return {experiment:{id,name:String(e.name),question:String(frozen.question??e.question??e.hypothesis??"Your experiment"),status:String(e.status),phase:String(e.current_phase),plannedEnd:typeof frozen.intervention_end_date==="string"?frozen.intervention_end_date:null,actualEnd:bounds.data?.ended_early_at??bounds.data?.actual_completed_at??null},latestRevision,lifecycleRevision,canCapture:captureReason===null,captureReason,revisions:items,nextBefore:revisions.data.some(r=>r.analysis_revision<(page.at(-1)?.analysis_revision??0))?page.at(-1)!.analysis_revision:null};
}
