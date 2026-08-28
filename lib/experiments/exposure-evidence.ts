import { calendarDays, isLogicalDate, shiftDate } from "../measurements/time-window.ts";
import { occursOnDate, type RecurrenceRule } from "../planner/recurrence.ts";
import type { Exposure } from "./study-health.ts";
import type {SourceResult} from "../measurements/observations.ts";
import {evaluateFrozenNutritionDay} from "../nutrition/frozen-target.ts";

export type ExposureState="adherent"|"non-adherent"|"unknown";
export type SourceIntegrity="frozen_definition_verified"|"current_criteria_match"|"mismatch"|"unavailable"|"unverifiable";
export type ExposureOpportunity={date:string;state:ExposureState;reason:string};
/** Terminal evidence uses the reconciled active-day population, never status
 * spoofing or a guessed pause duration. SourceResult may come from retained data.
 */
export function reconciledNutritionOpportunities(activeDates:string[],definition:unknown,source:SourceResult):ExposureOpportunity[] {
  return activeDates.map(date=>({date,...evaluateFrozenNutritionDay(definition,source.nutritionDays?.find(d=>d.logicalDate===date),source.queryCompleteness==="complete")}));
}
export type ExposureEvidence={
  contractVersion:1;interventionType:string;frozenSourceId:string|null;frozenRevision:number|null;experimentRevision:number;
  phase:string;evaluatedAt:string;window:{startDate:string;endDateExclusive:string}|null;
  denominator:"frozen_schedule"|"recorded_workout_schedule"|"not_applicable"|"unknown";
  eligibleOpportunityCount:number|null;adherentCount:number|null;nonAdherentCount:number|null;unknownCount:number|null;
  classification:ExposureState;evidenceCompleteness:"complete"|"incomplete"|"unsupported"|"not_applicable";
  sourceIntegrity:SourceIntegrity;opportunities:ExposureOpportunity[];warnings:string[];today:string;
  pauseState:"clear"|"unknown"|"not_evaluated";
};
export function closedDates(start:string,endExclusive:string):string[] {
  if(!isLogicalDate(start)||!isLogicalDate(endExclusive)||calendarDays(start,endExclusive)<0||calendarDays(start,endExclusive)>366)throw new Error("INVALID_EXPOSURE_WINDOW");
  const dates:string[]=[];for(let d=start;d<endExclusive;d=shiftDate(d,1))dates.push(d);return dates;
}
export function frozenHabitDates(source:Record<string,unknown>,start:string,endExclusive:string):string[] {
  if(!isLogicalDate(source.start_date)||(source.end_date!==null&&!isLogicalDate(source.end_date))||!["none","daily","weekdays","specific_days","weekly","interval"].includes(String(source.recurrence_type)))throw new Error("INVALID_FROZEN_SCHEDULE");
  if(source.recurrence_type==="interval"&&(!Number.isSafeInteger(source.interval_days)||Number(source.interval_days)<1))throw new Error("INVALID_FROZEN_SCHEDULE");
  if(source.recurrence_type==="specific_days"&&(!Array.isArray(source.days_of_week)||!source.days_of_week.length||source.days_of_week.some(d=>!Number.isInteger(d)||d<0||d>6)))throw new Error("INVALID_FROZEN_SCHEDULE");
  return closedDates(start,endExclusive).filter(date=>occursOnDate(source as RecurrenceRule,date));
}
export function habitOpportunities(dates:string[],rows:{scheduled_date:string;status:string}[]):ExposureOpportunity[] {
  return dates.map(date=>{const matches=rows.filter(r=>r.scheduled_date===date),status=matches.length===1?matches[0].status:"unknown";
    return {date,state:status==="completed"?"adherent":status==="skipped"?"non-adherent":"unknown",reason:status==="completed"?"Linked habit recorded complete.":status==="skipped"?"Linked habit explicitly skipped.":"Absent, planned or ambiguous habit evidence."};});
}
export function summarizeEvidence(e:ExposureEvidence,opportunities:ExposureOpportunity[],denominator:ExposureEvidence["denominator"],complete=true):ExposureEvidence {
  const trusted=["frozen_definition_verified","current_criteria_match"].includes(e.sourceIntegrity)&&complete;
  const normalized=opportunities.map(o=>trusted?o:{...o,state:"unknown" as const});
  const adherent=normalized.filter(o=>o.state==="adherent").length,nonAdherent=normalized.filter(o=>o.state==="non-adherent").length,unknown=normalized.length-adherent-nonAdherent;
  const knownDenominator=denominator!=="unknown";
  return {...e,denominator,opportunities:normalized,eligibleOpportunityCount:knownDenominator?normalized.length:null,adherentCount:knownDenominator?adherent:null,nonAdherentCount:knownDenominator?nonAdherent:null,unknownCount:knownDenominator?unknown:null,
    classification:!trusted||!knownDenominator||!normalized.length||unknown?"unknown":nonAdherent?"non-adherent":"adherent",
    evidenceCompleteness:denominator==="not_applicable"?"not_applicable":!trusted||unknown?"incomplete":"complete"};
}
export function presentExposure(e:ExposureEvidence):Exposure {
  // Preserve the old habit-only skip field without calling a missed nutrition target a skip.
  return {state:e.classification,eligible:e.eligibleOpportunityCount,completed:e.adherentCount,skipped:e.interventionType==="habit"?e.nonAdherentCount:null,unknown:e.unknownCount,today:e.today,
    reason:e.warnings.join(" ")||"Frozen eligible opportunities on completed study days; no efficacy conclusion."};
}
