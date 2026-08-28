import { calendarDays, dateInZone, isLogicalDate, shiftDate } from "../measurements/time-window.ts";
import { occursOnDate, type RecurrenceRule } from "../planner/recurrence.ts";
import type { ReadinessResult } from "../measurements/readiness-policies.ts";

export const studyHealthExplanation = "Study health reflects whether AXVital is collecting enough exposure and outcome data to evaluate this experiment later. It does not indicate whether the intervention is working.";
export type Exposure = { state: "adherent" | "non-adherent" | "unknown"; eligible: number | null; completed: number | null; skipped: number | null; unknown: number | null; today: string; reason: string };
export type Completeness = { state: "complete" | "missing" | "unknown"; expected: number | null; captured: number | null; missing: number | null; unit: string; reason: string };
export const unknownExposure = (reason: string): Exposure => ({state:"unknown",eligible:null,completed:null,skipped:null,unknown:null,today:"Unable to determine today's requirements.",reason});
export const unknownCompleteness = (reason: string): Completeness => ({state:"unknown",expected:null,captured:null,missing:null,unit:"observations",reason});
export function studyPeriod(start: unknown, end: unknown, zone: unknown, now: Date) {
  if(!isLogicalDate(start)||!isLogicalDate(end)||end<start||typeof zone!=="string")return null;
  try { const today=dateInZone(now,zone),total=calendarDays(start,shiftDate(end,1));if(total>366)return null;
    const elapsed=Math.max(0,Math.min(total,calendarDays(start,today)));
    return {start,end,today,total,day:today<start?0:Math.min(total,elapsed+1),elapsed,percent:Math.round(elapsed/total*100),ended:today>end,closedEnd:today<shiftDate(end,1)?today:shiftDate(end,1)};
  } catch { return null; }
}
/** Frozen schedule, existing recurrence semantics; missing records are unknown.
 * Only completed calendar days enter the study denominator. Today stays pending.
 */
export function habitExposure(rule: RecurrenceRule, rows: {scheduled_date:string;status:string}[], start:string, endExclusive:string, today:string, end:string):Exposure {
  const dates:string[]=[];for(let d=start;d<endExclusive;d=shiftDate(d,1))if(occursOnDate(rule,d))dates.push(d);
  const status=(d:string)=>{const matches=rows.filter(r=>r.scheduled_date===d);return matches.length===1?matches[0].status:"unknown";};
  const completed=dates.filter(d=>status(d)==="completed").length,skipped=dates.filter(d=>status(d)==="skipped").length,unknown=dates.length-completed-skipped;
  const due=today>=start&&today<=end&&occursOnDate(rule,today), current=status(today);
  return {state:unknown||!dates.length?"unknown":skipped?"non-adherent":"adherent",eligible:dates.length,completed,skipped,unknown,
    today:!due?"No habit opportunity scheduled today.":current==="completed"?"Today's linked habit is recorded complete.":current==="skipped"?"Today's linked habit is recorded skipped.":"Today's linked habit has no confirmed completion yet.",
    reason:"Frozen scheduled opportunities on completed study days only. Explicit skips are non-adherence; absent or planned records remain unknown. Current records cannot reconstruct all past edits."};
}
export function outcomeCompleteness(r:ReadinessResult):Completeness {
  if(r.queryCompleteness!=="complete")return unknownCompleteness("The source read failed or was truncated. Retry; this is not evidence of missing measurements.");
  if(r.coverage.expectedDays==null)return {...unknownCompleteness("This event/workout source has no expected measurement cadence. Recorded observations do not establish surveillance or scheduled coverage."),captured:r.observationCount};
  const captured=r.nutrition?.qualifyingCompleteDays??r.coverage.observedDays,expected=r.coverage.expectedDays,missing=Math.max(0,expected-captured);
  return {state:missing?"missing":"complete",expected,captured,missing,unit:"days",reason:r.nutrition?"Days with both complete logging and known nutrient values. Other days lack confirmed complete data, not necessarily intake.":"Check-in observation days under existing backend coverage semantics. Missing data does not imply a missing health event."};
}
export function collectionHealth(exposure:Exposure,outcome:Completeness) {
  return exposure.state==="unknown"||outcome.state==="unknown"?"Unable to determine":exposure.state==="non-adherent"||outcome.state==="missing"?"Needs attention":"Good";
}
export type StudyStatus = {
  name?:string;
  id:string;revision:number;status:string;phase:string;question:string;timezone:string|null;checkedAt:string;
  period:ReturnType<typeof studyPeriod>;intervention:{name:string;type:string;href:string;criteria:string[]};outcome:{name:string;href:string};
  exposure:Exposure;completeness:Completeness;health:string;snapshotMessage:string;
};
