import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "../api/validation.ts";
import { ownedExperiment } from "./draft-read.ts";
import { getBaselineReadiness } from "./readiness.ts";
import type { OutcomeInput } from "../measurements/validation.ts";
import { collectionHealth, outcomeCompleteness, studyPeriod, unknownCompleteness, unknownExposure, type StudyStatus } from "./study-health.ts";
import { readExposureEvidence } from "./exposure-reader.ts";
import { presentExposure } from "./exposure-evidence.ts";
type Row=Record<string,unknown>;
const object=(v:unknown):Row=>v&&typeof v==="object"&&!Array.isArray(v)?v as Row:{};
const text=(v:unknown,fallback="Unavailable")=>typeof v==="string"?v:fallback;
export async function loadStudyStatus(client:SupabaseClient,owner:string,id:string,now=new Date()):Promise<StudyStatus> {
  const e=await ownedExperiment(client,owner,id);
  const {data,error}=await client.from("experiment_start_snapshots").select("config_revision,snapshot_version,configuration").eq("user_id",owner).eq("experiment_id",id).limit(1).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
  if(error)throw new ApiError(503,"TEMPORARILY_UNAVAILABLE");
  const valid=data?.snapshot_version===1&&data.config_revision===e.config_revision;
  const frozen=valid?object(data.configuration):{},intervention=object(frozen.intervention),source=object(intervention.configuration);
  const primary=(Array.isArray(frozen.outcomes)?frozen.outcomes:[]).map(object).find(o=>o.outcome_role==="primary"),definition=object(primary?.definition);
  const type=text(intervention.type,"unknown"),sourceId=text(source.id,"");
  const period=studyPeriod(frozen.intervention_start_date??e.intervention_start_date,frozen.intervention_end_date??e.intervention_end_date,frozen.analysis_timezone??e.analysis_timezone,now);
  const href=type==="habit"?`/habits/${sourceId}`:type==="protocol"?`/protocols/${sourceId}`:type==="workout"?"/workouts":type.startsWith("nutrition")?"/health/nutrition":"/today";
  const adapter=text(definition.sourceAdapter,"");
  const outcomeHref=adapter==="checkin"||adapter==="checkins"?"/checkin":adapter==="nutrition"?"/health/nutrition":adapter==="workout"||adapter==="workouts"?"/workouts":adapter==="symptom"||adapter==="symptoms"?"/health/symptoms":"/health";
  const result:StudyStatus={id,revision:Number(e.config_revision),status:text(e.status),phase:text(e.current_phase),question:text(frozen.question??e.question??e.hypothesis),timezone:typeof (frozen.analysis_timezone??e.analysis_timezone)==="string"?String(frozen.analysis_timezone??e.analysis_timezone):null,checkedAt:now.toISOString(),period,
    intervention:{name:text(source.name),type,href:sourceId?href:"/today",criteria:[]},outcome:{name:`${text(definition.label)}${primary?.target_label?` · ${text(primary.target_label)}`:""}`,href:outcomeHref},
    exposure:unknownExposure("Historical adherence is not safely supported for this intervention. No daily denominator or completion rule has been invented."),completeness:unknownCompleteness("No completed study-day window or supported outcome source is available."),health:"Unable to determine",
    snapshotMessage:valid?"Showing criteria frozen at Start. Linked tracking settings can change; historical source-change detection is not available for every intervention. Live settings do not replace these criteria.":"No matching supported start snapshot is available. Exposure and completeness cannot be determined safely."};
  if(type==="habit")result.intervention.criteria=[`Schedule: ${text(source.recurrence_type)}${Array.isArray(source.days_of_week)?` (${source.days_of_week.map(n=>["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][Number(n)]).join(", ")})`:""}`,`Tracking: ${text(source.tracking_type)}`,`Target: ${source.target_value??"not specified"} ${text(source.target_unit,"")}`];
  if(type==="nutrition_target"||type==="nutrition_pattern")result.intervention.criteria=[`Frozen rule revision: ${source.revision??"unavailable"}`,"Only supported frozen numeric targets with complete daily logging are evaluated; other rules remain unknown."];
  if(type==="protocol")result.intervention.criteria=[`${Array.isArray(source.members)?source.members.length:0} frozen activities; historical pause/member-change reconciliation is not supported here.`];
  if(type==="workout")result.intervention.criteria=[`${Array.isArray(source.prescribed_exercises)?source.prescribed_exercises.length:0} frozen exercise prescriptions; planned/performed prescription equivalence is not verified here.`];
  result.name=text(e.name,"Your experiment");
  const rules=type==="nutrition_target"?[source]:type==="nutrition_pattern"&&Array.isArray(source.rules)?source.rules.map(object):[];
  for(const rule of rules){const d=object(rule.definition);result.intervention.criteria.push(d.kind==="numeric"?`${text(d.metric)} ${d.operator==="gte"?"at least":d.operator==="lte"?"at most":"equal to"} ${d.value} ${text(d.unit)} per ${text(d.period)}`:d.kind==="exclusion"?`Exclude ${text(d.classification)} per ${text(d.period)}`:d.kind==="cutoff"?`No food after ${text(d.local_time)} (${text(d.time_zone)})`:"Unsupported frozen rule.");}
  result.exposureEvidence=await readExposureEvidence(client,owner,e,data,now);
  result.exposure=presentExposure(result.exposureEvidence);
  if(result.exposureEvidence.sourceIntegrity==="mismatch")result.snapshotMessage="The linked source differs from frozen criteria. The original criteria remain unchanged; exposure is unknown.";
  // Paused/terminal periods need phase-aware windows, not a guessed calendar denominator.
  if(!valid||!period||e.status!=="active"||e.current_phase!=="intervention")return result;
  if(result.exposureEvidence.pauseState!=="clear"){result.completeness=unknownCompleteness("Pause-adjusted outcome coverage is unavailable.");return result;}
  if(primary&&period.closedEnd>period.start) {
    const outcome=Object.fromEntries(Object.entries(primary).filter(([k])=>!["id","definition","target_label"].includes(k))) as OutcomeInput;
    try {result.completeness=outcomeCompleteness(await getBaselineReadiness(client,{outcome,timeZone:result.timezone!,startDate:period.start,endDateExclusive:period.closedEnd},()=>now));}
    catch {result.completeness=unknownCompleteness("Outcome capture is unavailable for this source or configuration. Retry or review the existing tracking surface.");}
  }
  result.health=collectionHealth(result.exposure,result.completeness);
  const latest=await ownedExperiment(client,owner,id);
  if(latest.config_revision!==e.config_revision||latest.status!==e.status||latest.current_phase!==e.current_phase)throw new ApiError(409,"REVISION_CONFLICT");
  return result;
}
