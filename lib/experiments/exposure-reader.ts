import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {isUuid} from "../rules/validation.ts";
import {shiftDate} from "../measurements/time-window.ts";
import {readObservations} from "../measurements/sources/index.ts";
import {evaluateFrozenNutritionDay,supportedFrozenTarget} from "../nutrition/frozen-target.ts";
import {closedDates,frozenHabitDates,habitOpportunities,summarizeEvidence,type ExposureEvidence,type ExposureOpportunity} from "./exposure-evidence.ts";
import {studyPeriod} from "./study-health.ts";
type Row=Record<string,unknown>;
export const evidenceObject=(v:unknown):Row=>v&&typeof v==="object"&&!Array.isArray(v)?v as Row:{};
const habitFields="id,title,activity_type,tracking_type,target_value,target_unit,minimum_value,allow_partial_completion,recurrence_type,days_of_week,interval_days,start_date,end_date,scheduled_time,is_active";
const CAP=1000;
function bounded(response:{data:unknown;error:unknown;count?:number|null}):Row[] {
  if(response.error||!Array.isArray(response.data)||response.data.length>=CAP||response.count!==response.data.length)throw new Error("INCOMPLETE_EVIDENCE");return response.data as Row[];
}
const string=(v:unknown,fallback="unknown")=>typeof v==="string"?v:fallback;
/** Only the owned status service supplies the snapshot and experiment. No client overrides. */
export async function readExposureEvidence(client:SupabaseClient,owner:string,experiment:Row,snapshot:unknown,now=new Date()):Promise<ExposureEvidence> {
  const snap=evidenceObject(snapshot),frozen=evidenceObject(snap.configuration),intervention=evidenceObject(frozen.intervention),source=evidenceObject(intervention.configuration);
  const evidence:ExposureEvidence={contractVersion:1,interventionType:string(intervention.type),frozenSourceId:isUuid(source.id)?source.id:null,frozenRevision:Number.isSafeInteger(source.revision)?Number(source.revision):null,experimentRevision:Number(experiment.config_revision),phase:string(experiment.current_phase),evaluatedAt:now.toISOString(),window:null,denominator:"unknown",eligibleOpportunityCount:null,adherentCount:null,nonAdherentCount:null,unknownCount:null,classification:"unknown",evidenceCompleteness:"unsupported",sourceIntegrity:"unverifiable",pauseState:"not_evaluated",opportunities:[],warnings:[],today:"Today's evidence is pending or unsupported; use the linked tracker."};
  const unavailable=(message:string)=>({...evidence,warnings:[...evidence.warnings,message]});
  if(snap.snapshot_version!==1||snap.config_revision!==experiment.config_revision||!Number.isSafeInteger(experiment.config_revision)||Number(experiment.config_revision)<1||!isUuid(source.id))return {...unavailable("A matching version-1 Start snapshot and frozen source identity are required."),sourceIntegrity:"unavailable"};
  if(evidence.phase==="baseline"||evidence.phase==="planning")return {...summarizeEvidence(evidence,[],"not_applicable"),warnings:["Intervention exposure is not expected in this non-intervention phase."]};
  if(evidence.phase!=="intervention"||!["active","paused"].includes(string(experiment.status)))return unavailable("Exposure reconciliation is only supported for the intervention phase of active or paused studies.");
  const period=studyPeriod(frozen.intervention_start_date,frozen.intervention_end_date,frozen.analysis_timezone,now);
  if(!period||period.closedEnd<period.start)return unavailable("No supported completed intervention-day window is available.");
  evidence.window={startDate:period.start,endDateExclusive:period.closedEnd};
  let opportunities:ExposureOpportunity[]=[];
  try {
    // Current phase events are not a complete versioned pause ledger. Do not invent a precise adjusted denominator.
    const pauses=await client.from("experiment_phase_events").select("id").eq("user_id",owner).eq("experiment_id",experiment.id).eq("event_type","paused").limit(1).abortSignal(AbortSignal.timeout(10000));
    if(pauses.error||!Array.isArray(pauses.data)||pauses.data.length||experiment.status==="paused")return {...unavailable("Pause history is present or unavailable; eligible opportunities cannot be reconstructed safely."),pauseState:"unknown"};
    evidence.pauseState="clear";
    if(intervention.type==="habit") {
      if(source.is_active!==true||source.activity_type!=="habit")return unavailable("The frozen habit definition is inactive or unsupported.");
      const dates=frozenHabitDates(source,period.start,period.closedEnd);
      opportunities=dates.map(date=>({date,state:"unknown",reason:"Habit evidence unavailable."}));
      evidence.denominator="frozen_schedule";
      const live=await client.from("planned_activities").select(habitFields).eq("user_id",owner).eq("id",source.id).limit(1).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
      if(live.error)throw new Error("SOURCE_UNAVAILABLE");
      const matches=(row:unknown)=>!!row&&habitFields.split(",").every(key=>JSON.stringify(evidenceObject(row)[key])===JSON.stringify(source[key==="title"?"name":key]));
      if(!matches(live.data))return summarizeEvidence({...evidence,sourceIntegrity:live.data?"mismatch":"unavailable",warnings:["Linked habit differs from frozen criteria or is unavailable. No historical reinterpretation was performed."]},opportunities,"frozen_schedule",false);
      evidence.sourceIntegrity="current_criteria_match";
      const rows=bounded(await client.from("planned_activity_occurrences").select("user_id,planned_activity_id,scheduled_date,status",{count:"exact"}).eq("user_id",owner).eq("planned_activity_id",source.id).gte("scheduled_date",period.start).lte("scheduled_date",period.today<period.end?period.today:period.end).limit(CAP).abortSignal(AbortSignal.timeout(10000)));
      if(rows.some(r=>r.user_id!==owner||r.planned_activity_id!==source.id))throw new Error("INVALID_EVIDENCE_CHAIN");
      const after=await client.from("planned_activities").select(habitFields).eq("user_id",owner).eq("id",source.id).limit(1).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
      if(after.error||!matches(after.data))return summarizeEvidence({...evidence,sourceIntegrity:"mismatch",warnings:["Linked habit changed during the evidence read or could not be rechecked."]},opportunities,"frozen_schedule",false);
      const records=rows as {scheduled_date:string;status:string}[];
      const due=frozenHabitDates(source,period.today,shiftDate(period.today,1)).length>0&&period.today<=period.end;
      evidence.today=due?habitOpportunities([period.today],records)[0].reason:"No habit opportunity scheduled today.";
      evidence.warnings=["Frozen scheduled habit opportunities; explicit skips differ from unknown records.","Current criteria match only: edit-and-revert history and past completion-rule versions cannot be reconstructed."];
      return summarizeEvidence(evidence,habitOpportunities(dates,records),"frozen_schedule");
    }
    if(intervention.type==="nutrition_target") {
      const supported=supportedFrozenTarget(source.definition);
      if(!supported||!Number.isSafeInteger(source.revision)||Number(source.revision)<1)return unavailable("Unsupported frozen nutrition target. Supported: daily calories/protein/carbohydrate/fat/fiber numeric minimum, maximum or equality rules, version 1.");
      evidence.sourceIntegrity="frozen_definition_verified";evidence.denominator="frozen_schedule";
      opportunities=closedDates(period.start,period.closedEnd).map(date=>({date,state:"unknown",reason:"Nutrition evidence unavailable."}));
      if(!opportunities.length)return summarizeEvidence(evidence,[],"frozen_schedule");
      const result=await readObservations(client,{outcome:{registry_key:supported.key,registry_version:1,outcome_role:"primary",aggregation_method:"average",expected_direction:"unknown",source_config:{}},timeZone:string(frozen.analysis_timezone),startDate:period.start,endDateExclusive:period.closedEnd},()=>now);
      if(result.queryCompleteness!=="complete")throw new Error("INCOMPLETE_NUTRITION_READ");
      const days=result.nutritionDays??[];
      evidence.warnings=["Frozen nutrition criteria are evaluated only on fully logged days with known nutrient values; insufficient logging remains unknown.","Live rule edits do not replace the frozen definition. Nutrition records are current-record retrospective evidence, not an immutable as-of-start ledger."];
      return summarizeEvidence(evidence,opportunities.map(o=>{const matches=days.filter(d=>d.logicalDate===o.date);return {...o,...evaluateFrozenNutritionDay(source.definition,matches.length===1?matches[0]:undefined,true)};}),"frozen_schedule");
    }
    if(intervention.type==="protocol")return unavailable("Protocol required/optional membership is frozen, but historical execution and pause/member-version reconciliation are unavailable. Optional-item completion cannot prove required exposure.");
    if(intervention.type==="nutrition_pattern")return unavailable("Pattern rules are frozen, but a versioned whole-pattern composition/evidence contract is unavailable. No heuristic pattern score is calculated.");
    if(intervention.type==="workout") {
      if(!Array.isArray(source.prescribed_exercises)||!source.prescribed_exercises.length)return unavailable("Frozen workout prescription is missing or unsupported.");
      const rows=bounded(await client.from("planned_workouts").select("id,user_id,workout_template_id,scheduled_date,status",{count:"exact"}).eq("user_id",owner).eq("workout_template_id",source.id).gte("scheduled_date",period.start).lt("scheduled_date",period.closedEnd).limit(CAP).abortSignal(AbortSignal.timeout(10000)));
      if(new Set(rows.map(r=>r.id)).size!==rows.length||rows.some(r=>r.user_id!==owner||r.workout_template_id!==source.id))throw new Error("AMBIGUOUS_WORKOUT_EVIDENCE");
      opportunities=rows.filter(r=>r.status!=="draft"&&r.status!=="cancelled").map(r=>({date:string(r.scheduled_date),state:"unknown",reason:r.status==="skipped"?"Recorded scheduled workout explicitly skipped; frozen prescription equivalence is unverifiable.":r.status==="completed"?"Recorded scheduled workout marked complete; performed frozen prescription is unverified.":"Scheduled workout has no verified matching performance."}));
      evidence.warnings=["Only recorded scheduled workout occurrences are counted, never calendar days; missing/deleted schedules cannot be reconstructed.","Template identity and completion/skip status alone do not verify the frozen prescription. Group rounds/rest and performed prescription linkage are incomplete."];
      return summarizeEvidence(evidence,opportunities,"recorded_workout_schedule",false);
    }
    return unavailable("Unsupported intervention source.");
  }catch {
    evidence.warnings=[...evidence.warnings,"Evidence was invalid, unavailable, timed out or incomplete. No missing records were classified as non-adherence."];
    return summarizeEvidence(evidence,opportunities,evidence.denominator,false);
  }
}
