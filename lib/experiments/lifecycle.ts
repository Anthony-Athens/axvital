import {calendarDays,dateInZone,isLogicalDate,localDateBoundary,shiftDate} from "../measurements/time-window.ts";

export type LifecycleEvent={event_type:string;occurred_at:string;from_status:string|null;to_status:string|null;from_phase:string|null;to_phase:string|null;metadata:Record<string,unknown>|null};
export type LifecycleEvidence={version:1;revision:number;actualStartedAt:string|null;actualCompletedAt:string|null;endedEarlyAt:string|null;events:LifecycleEvent[]};
export type LifecycleReconciliation={version:1;revision:number;status:string;actualStart:string|null;actualEnd:string|null;plannedDays:number;elapsedDays:number;actualElapsedMilliseconds:number|null;activeDates:string[];excludedDates:string[];pauses:{start:string;end:string|null}[];startDate:string|null;endDateExclusive:string|null;issues:string[];limitations:string[]};
/** Whole local days only. A day touched by a pause or partial start/end is not
 * an intervention opportunity and is not an expected outcome day. No guessed duration.
 */
export function reconcileLifecycle(frozen:Record<string,unknown>,status:string,phase:string,evidence:LifecycleEvidence,cutoff:string):LifecycleReconciliation {
  const r:LifecycleReconciliation={version:1,revision:evidence.revision,status,actualStart:evidence.actualStartedAt,actualEnd:null,plannedDays:0,elapsedDays:0,actualElapsedMilliseconds:null,activeDates:[],excludedDates:[],pauses:[],startDate:null,endDateExclusive:null,issues:[],limitations:["WHOLE_ACTIVE_LOCAL_DAYS_ONLY","PAUSES_DO_NOT_EXTEND_PLANNED_END"]};
  try {
    const zone=String(frozen.analysis_timezone),start=frozen.intervention_start_date,end=frozen.intervention_end_date;
    if(evidence.version!==1||!Number.isSafeInteger(evidence.revision)||evidence.revision<0||!Array.isArray(evidence.events)||evidence.events.length>1000||!isLogicalDate(start)||!isLogicalDate(end)||calendarDays(start,shiftDate(end,1))<1||calendarDays(start,shiftDate(end,1))>366)throw new Error("INVALID_LIFECYCLE_CONTRACT");
    const stamp=(s:string|null)=>{if(!s||!Number.isFinite(Date.parse(s))||Date.parse(s)>Date.parse(cutoff))throw new Error("INVALID_LIFECYCLE_TIMESTAMP");return Date.parse(s);};
    const actualStart=stamp(evidence.actualStartedAt),cutoffAt=stamp(cutoff);
    const starts=evidence.events.filter(e=>e.event_type==="intervention_started");
    if(starts.length!==1||stamp(starts[0].occurred_at)!==actualStart||starts[0].metadata?.model_version!==2||starts[0].metadata?.config_revision===undefined)throw new Error("UNVERIFIED_INTERVENTION_START");
    let current="active",currentPhase="intervention",previous=actualStart,revision=0,open:{start:string;end:string|null}|null=null;
    const runtime=evidence.events.filter(e=>!["created","configuration_changed","intervention_started"].includes(e.event_type)).sort((a,b)=>Number(a.metadata?.lifecycle_revision)-Number(b.metadata?.lifecycle_revision));
    for(const event of runtime) {
      const at=stamp(event.occurred_at),m=event.metadata;
      if(at<previous||m?.lifecycle_version!==1||m.provenance!=="v2_transition_rpc"||m.lifecycle_revision!==++revision||event.from_status!==current||event.from_phase!==currentPhase)throw new Error("UNVERIFIED_LIFECYCLE_HISTORY");
      previous=at;
      if(event.event_type==="paused"&&current==="active"){open={start:event.occurred_at,end:null};r.pauses.push(open);current="paused";}
      else if(event.event_type==="resumed"&&current==="paused"&&open){open.end=event.occurred_at;open=null;current="active";}
      else if(event.event_type==="completed"&&current==="active"){r.actualEnd=event.occurred_at;current="completed";currentPhase="complete";}
      else if(event.event_type==="ended_early"&&current==="active"){r.actualEnd=event.occurred_at;current="ended_early";currentPhase="analysis";}
      else if(event.event_type==="abandoned"&&["active","paused"].includes(current)){r.actualEnd=event.occurred_at;current="abandoned";currentPhase="complete";}
      else if(event.event_type==="archived"&&["completed","ended_early","abandoned"].includes(current)){current="archived";}
      else throw new Error("MALFORMED_LIFECYCLE_SEQUENCE");
      if(event.to_status!==current||event.to_phase!==currentPhase)throw new Error("LIFECYCLE_EVENT_STATE_MISMATCH");
    }
    if(revision!==evidence.revision||current!==status||currentPhase!==phase)throw new Error("LIFECYCLE_REVISION_OR_STATE_MISMATCH");
    if(open)r.issues.push("OPEN_PAUSE");
    if(!["completed","ended_early"].includes(status))r.issues.push(["abandoned","archived"].includes(status)?"UNSUPPORTED_TERMINAL_STATE":"AUTHORITATIVE_END_REQUIRED");
    if(status==="completed"&&stamp(evidence.actualCompletedAt)!==stamp(r.actualEnd)||status==="ended_early"&&stamp(evidence.endedEarlyAt)!==stamp(r.actualEnd))throw new Error("ACTUAL_END_EVENT_MISMATCH");
    if(!r.actualEnd)return r;
    const actualEnd=stamp(r.actualEnd),plannedEnd=Date.parse(localDateBoundary(shiftDate(end,1),zone));
    if(actualEnd<=actualStart)throw new Error("INVALID_ACTUAL_BOUNDS");
    if(status==="completed"&&actualEnd<plannedEnd)throw new Error("COMPLETED_BEFORE_PLANNED_END");
    r.plannedDays=calendarDays(start,shiftDate(end,1));r.startDate=start;
    r.endDateExclusive=[shiftDate(end,1),dateInZone(new Date(actualEnd),zone),dateInZone(new Date(cutoffAt),zone)].sort()[0];
    r.elapsedDays=Math.max(0,calendarDays(dateInZone(new Date(actualStart),zone),dateInZone(new Date(actualEnd),zone)));
    r.actualElapsedMilliseconds=actualEnd-actualStart;
    for(let date=start;date<r.endDateExclusive;date=shiftDate(date,1)) {
      const lo=Date.parse(localDateBoundary(date,zone)),hi=Date.parse(localDateBoundary(shiftDate(date,1),zone));
      const paused=r.pauses.some(p=>Date.parse(p.start)<hi&&(p.end===null||Date.parse(p.end)>lo));
      (lo>=actualStart&&hi<=actualEnd&&!paused?r.activeDates:r.excludedDates).push(date);
    }
    if(!r.activeDates.length)r.issues.push("NO_COMPLETE_ACTIVE_DAYS");
    if(r.pauses.length)r.limitations.push("PAUSE_TOUCHED_DAYS_EXCLUDED");
    if(status==="ended_early")r.limitations.push("EARLY_END_MAY_BE_INFORMATIVE");
    r.limitations.push("ACTUAL_START_END_BOUNDARY_DAYS_EXCLUDED_IF_PARTIAL");
  }catch(error){r.issues.push(error instanceof Error?error.message:"INVALID_LIFECYCLE_CONTRACT");}
  return r;
}
