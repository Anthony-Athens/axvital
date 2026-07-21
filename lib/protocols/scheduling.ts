import { addDaysToDateString, getWeekdayFromDateString } from "./dates.ts";
import type { ProtocolTemplateActivityInput, TranslatedSchedule } from "./types";
export function firstWeekdayOnOrAfter(start:string,day:number){ let date=start; while(getWeekdayFromDateString(date)!==day) date=addDaysToDateString(date,1); return date; }
export function translateProtocolSchedule(activity:ProtocolTemplateActivityInput,protocolStart:string,protocolEnd:string|null):TranslatedSchedule {
  if(activity.schedule_type==="day_offset") return { recurrence_type:"none",start_date:addDaysToDateString(protocolStart,activity.day_offset??0),end_date:null,days_of_week:null,interval_days:null };
  if(activity.schedule_type==="weekly"){ const day=activity.days_of_week?.[0]??getWeekdayFromDateString(protocolStart); return { recurrence_type:"weekly",start_date:firstWeekdayOnOrAfter(protocolStart,day),end_date:protocolEnd,days_of_week:null,interval_days:null }; }
  return { recurrence_type:activity.schedule_type,start_date:protocolStart,end_date:protocolEnd,days_of_week:activity.schedule_type==="specific_days"?activity.days_of_week:null,interval_days:activity.schedule_type==="interval"?activity.interval_days:null };
}
