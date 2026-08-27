export function localDateString(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;}
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDateString(date) === value;
}
export function selectedCalendarDate(value: string | null, today = localDateString()) {
  const date = value === null ? today : value;
  return isCalendarDate(date) && date <= today ? date : null;
}
export function addLocalDays(date: string, amount: number) {
  if (!isCalendarDate(date)) throw new Error("INVALID_DATE");
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return localDateString(value);
}
export function localDayRange(date: string) {
  if (!isCalendarDate(date)) throw new Error("INVALID_DATE");
  const start = new Date(`${date}T00:00:00`), end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString(), startDate: date, endDate: date };
}
export function localDateForTimestamp(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? localDateString(date) : "unknown";
}
export function formatTimelineTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date) : "Unknown time";
}
export function calendarDateInZone(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
/** Daily observations have no event clock; noon is an analysis anchor, not a logged time. */
export function calendarNoonInZone(date: string, timeZone: string) {
  if (!isCalendarDate(date)) throw new Error("INVALID_DATE");
  const target = Date.parse(`${date}T12:00:00Z`);
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(instant));
    const part = (type: string) => parts.find(p => p.type === type)!.value;
    const rendered = Date.parse(`${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}Z`);
    if (rendered === target) return new Date(instant).toISOString();
    instant += target - rendered;
  }
  throw new Error("INVALID_LOCAL_DATE");
}
