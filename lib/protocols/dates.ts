import { addCalendarDays, daysBetween, weekday } from "../planner/recurrence.ts";
export const addDaysToDateString = addCalendarDays; export const differenceInCalendarDays = daysBetween; export const getWeekdayFromDateString = weekday;
export function getProtocolDayNumber(start:string,date:string){ return date < start ? 0 : daysBetween(start,date)+1; }
export function isDateWithinProtocol(date:string,start:string,end:string|null){ return date>=start && (!end || date<=end); }
export function isDateWithinPausePeriod(date:string,period:{paused_on:string;resumed_on:string|null}){ return date>=period.paused_on && (!period.resumed_on || date<period.resumed_on); }
