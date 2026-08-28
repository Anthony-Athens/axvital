import { addLocalDays, isCalendarDate } from "../timeline/dates.ts";

export class ApiError extends Error {
  status: number;
  constructor(status: number, code: string) { super(code); this.status = status; }
}
export async function boundedText(request: Request, limit = 8192) {
  if (Number(request.headers.get("content-length")) > limit) throw new ApiError(413, "BODY_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) return "";
  let size = 0, text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { void reader.cancel().catch(() => {}); throw new ApiError(413, "BODY_TOO_LARGE"); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_BODY");
  } finally { reader.releaseLock(); }
}
const invalid = () => { throw new ApiError(400, "INVALID_REQUEST"); };
export function validateDateRange(start: unknown, end: unknown, first: unknown, last: unknown, maxDays: number) {
  if (typeof start !== "string" || typeof end !== "string" || !isCalendarDate(first) || !isCalendarDate(last)) return invalid();
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  const a = Date.parse(start), b = Date.parse(end), day = 86400000;
  if (!iso.test(start) || !iso.test(end) || !isCalendarDate(start.slice(0,10)) || !isCalendarDate(end.slice(0,10)) || !Number.isFinite(a) || !Number.isFinite(b) || b <= a || b-a > (maxDays+1)*day || first > last || Date.parse(last)-Date.parse(first) >= maxDays*day) return invalid();
  // Client local midnight may be up to 14 hours from UTC. Disjoint logical and
  // timestamp ranges must not produce contradictory queries across sources.
  if (Math.abs(a-Date.parse(first)) > 14*3600000 || Math.abs(b-Date.parse(addLocalDays(last,1))) > 14*3600000 || Date.parse(last)>Date.now()+day) return invalid();
}
export async function validateApiRequest(request: Request, route: string) {
  if (request.url.length > 2048) throw new ApiError(414, "URL_TOO_LONG");
  const url = new URL(request.url), query = url.searchParams;
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    if (((route.startsWith("account/") || route.startsWith("http/experiments/")) && origin !== url.origin) || (origin && origin !== url.origin)) throw new ApiError(403, "INVALID_ORIGIN");
  }
  const allowed: Record<string, string[]> = {
    "http/experiments/results": request.method === "GET" || request.method === "HEAD" ? ["id","revision"] : [],
    "http/experiments/result-revisions": ["id","before"],
    "http/experiments/status": ["id"],
    "http/experiments/targets": ["kind", "search", "cursor", "limit"],
    "http/experiments/draft": request.method === "GET" || request.method === "HEAD" ? ["id"] : [],
    analytics: ["start","end","endDate","window","timeZone"], timeline: ["start","end","startDate","endDate"],
    "trigger-patterns": ["condition","window","timeZone"], "condition-outlook": ["condition","timeZone"],
  };
  for (const key of query.keys()) if (!allowed[route]?.includes(key) || query.getAll(key).length !== 1) invalid();
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    const raw = await boundedText(request.clone(), route === "http/experiments/draft" ? 24576 : 8192);
    if (route.startsWith("http/experiments/") && !raw) invalid();
    if (raw) {
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ApiError(415,"JSON_REQUIRED");
      try { body = JSON.parse(raw); } catch { invalid(); }
      if (!body || typeof body !== "object" || Array.isArray(body)) invalid();
    }
    const experimentKeys: Record<string, string[]> = { "http/experiments/results": ["id","expectedAnalysisRevision","expectedLifecycleRevision"], "http/experiments/draft": ["id", "revision", "input"], "http/experiments/start": ["id", "revision"], "http/experiments/readiness": ["outcome", "timeZone", "startDate", "endDateExclusive"] };
    const keys = experimentKeys[route] ?? (route === "account/delete" ? ["confirmation","password","acceptConsequences"] : route === "weekly-recap" ? ["start","end","endDate","timeZone"] : route === "billing/checkout" ? ["interval"] : route === "product-events" ? ["event"] : []);
    if (Object.keys(body).some(key => !keys.includes(key))) invalid();
  }
  const values = route === "weekly-recap" ? body : Object.fromEntries(query);
  if (route === "analytics" || route === "weekly-recap" && request.method === "POST") {
    if (!isCalendarDate(values.endDate)) invalid();
    validateDateRange(values.start, values.end, addLocalDays(values.endDate as string,-96), values.endDate,97);
    if (route === "analytics" && ![7,30,90].includes(Number(values.window))) invalid();
  }
  if (route === "timeline") validateDateRange(values.start,values.end,values.startDate,values.endDate,32);
  if (route === "trigger-patterns" || route === "condition-outlook") {
    if (typeof values.condition !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values.condition)) invalid();
    if (route === "trigger-patterns" && ![24,48,72,168].includes(Number(values.window))) invalid();
  }
  if (values.timeZone !== undefined) {
    if (typeof values.timeZone !== "string" || values.timeZone.length > 100) invalid();
    try { Intl.DateTimeFormat(undefined, { timeZone: values.timeZone as string }); } catch { invalid(); }
  }
}
