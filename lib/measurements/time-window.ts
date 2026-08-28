const DAY = 86400000;
export function isLogicalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function shiftDate(date: string, days: number) {
  if (!isLogicalDate(date)) throw new Error("INVALID_DATE");
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}
export function calendarDays(start: string, endExclusive: string) {
  return (Date.parse(`${endExclusive}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY;
}
function dateFormatter(timeZone: string) {
  if (typeof timeZone !== "string" || timeZone.length > 100 || /^[+-]/.test(timeZone)) throw new Error("INVALID_TIME_ZONE");
  try { return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }); }
  catch { throw new Error("INVALID_TIME_ZONE"); }
}
function formattedDate(formatter: Intl.DateTimeFormat, time: number) {
  const parts = formatter.formatToParts(new Date(time));
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function dateInZone(time: Date, timeZone: string) { return formattedDate(dateFormatter(timeZone), time.getTime()); }
/** First instant belonging to a local date, including a midnight DST gap or
 * repeated midnight. Entirely skipped dates fail explicitly. No process TZ.
 * Scan to the first date crossing, then bisect to millisecond precision.
 */
export function localDateBoundary(date: string, timeZone: string): string {
  if (!isLogicalDate(date)) throw new Error("INVALID_DATE");
  const formatter = dateFormatter(timeZone), nominal = Date.parse(`${date}T00:00:00Z`);
  let low = nominal - 2 * DAY;
  for (let high = low + 1800000; high <= nominal + 2 * DAY; high += 1800000) {
    if (formattedDate(formatter, high) >= date) {
      let right = high;
      while (right - low > 1) {
        const middle = Math.floor((low + right) / 2);
        if (formattedDate(formatter, middle) >= date) right = middle; else low = middle;
      }
      if (formattedDate(formatter, right) !== date) throw new Error("NONEXISTENT_LOCAL_DATE");
      return new Date(right).toISOString();
    }
    low = high;
  }
  throw new Error("INVALID_DATE_BOUNDARY");
}
export type HistoricalWindow = {
  startDate: string; endDateExclusive: string; timeZone: string; expectedDays: number;
  startAt: string; endAtExclusive: string; effectiveEndAtExclusive: string; evaluatedAt: string;
};
export function historicalWindow(timeZone: string, evaluatedAt: Date, startDate?: string, endDateExclusive?: string): HistoricalWindow {
  if (!Number.isFinite(evaluatedAt.getTime())) throw new Error("INVALID_CUTOFF");
  const today = dateInZone(evaluatedAt, timeZone);
  if ((startDate === undefined) !== (endDateExclusive === undefined)) throw new Error("INVALID_WINDOW");
  const start = startDate ?? shiftDate(today, -14), end = endDateExclusive ?? today;
  if (!isLogicalDate(start) || !isLogicalDate(end)) throw new Error("INVALID_DATE");
  const days = calendarDays(start, end);
  if (days < 1 || days > 366 || start > today || end > shiftDate(today, 1)) throw new Error("INVALID_WINDOW");
  const startAt = localDateBoundary(start, timeZone), endAt = localDateBoundary(end, timeZone), cutoff = evaluatedAt.toISOString();
  return { startDate: start, endDateExclusive: end, timeZone, expectedDays: days, startAt, endAtExclusive: endAt, effectiveEndAtExclusive: endAt < cutoff ? endAt : cutoff, evaluatedAt: cutoff };
}
