import type { HealthEventInput } from "../health-events/ingestion.ts";
import { validateHealthEventInput } from "../health-events/ingestion.ts";
import { addLocalDays, calendarDateInZone } from "../timeline/dates.ts";
import type { NutritionDraft } from "../nutrition/voice-nutrition.ts";

export const eventTypes = ["food", "fluid", "supplement", "exercise", "symptom", "medication", "note"] as const;
export const MAX_SECONDS = 75;
export const MAX_AUDIO_BYTES = 3_000_000;
export const MAX_EVENTS = 12;
export type VoiceEvent = Omit<HealthEventInput, "user_id" | "input_method">;
export type VoiceCandidate = { event: VoiceEvent; nutrition?: NutritionDraft; source_fragment: string; time_note: string; requires_review: true };
const nullableText = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };
const properties = {
  event_type: { type: "string", enum: eventTypes }, title: { type: "string" },
  amount: nullableText, dose_amount: nullableNumber, dose_unit: nullableText,
  duration_minutes: nullableNumber, distance: nullableNumber, distance_unit: nullableText,
  intensity: nullableText, severity: nullableNumber, notes: nullableText,
  time_expression: nullableText, source_fragment: { type: "string" },
};
export const extractionSchema = {
  type: "object", additionalProperties: false, required: ["events"], properties: {
    events: { type: "array", maxItems: MAX_EVENTS, items: {
      type: "object", additionalProperties: false, required: Object.keys(properties), properties,
    } },
  },
};
export class VoiceError extends Error {
  constructor(code: string) { super(code); this.name = "VoiceError"; }
}
const invalid = (): never => { throw new VoiceError("INVALID_AI_RESPONSE"); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) return invalid();
  return value;
}
const contains = (source: string, value: string) => source.toLowerCase().includes(value.toLowerCase());
const numericWords: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, sixty: 60, half: 0.5 };
function groundedNumber(value: unknown, source: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100000) return invalid();
  const tokens = source.toLowerCase().match(/\d+(?:\.\d+)?|[a-z]+/g) ?? [];
  if (!tokens.some(token => (/^\d/.test(token) ? Number(token) : numericWords[token]) === value)) return invalid();
  return value;
}
function numberPattern(value: number) {
  return [String(value).replace(".", "\\."), ...Object.entries(numericWords).filter(([, number]) => number === value).map(([word]) => word)].join("|");
}
function hasQuantity(value: number, unit: string, source: string) {
  const escaped = unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:${numberPattern(value)})\\s*${escaped}\\b`, "i").test(source);
}

/** No guessed morning/lunch hour. Approximate phrases retain the reference clock,
 * with yesterday/last-night date shifts and an explicit review notice. */
export function resolveVoiceTime(expression: string | null, now: Date, timeZone: string) {
  let event_date = calendarDateInZone(now.toISOString(), timeZone);
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now);
  const phrase = expression?.trim().toLowerCase() ?? "";
  if (/\byesterday\b|\blast night\b/.test(phrase)) event_date = addLocalDays(event_date, -1);
  // Accept explicit 24-hour clocks, or an hour with AM/PM. Bare 'at 7' is ambiguous.
  const qualified = phrase.replace(/^(?:today|yesterday|this morning|this afternoon|this evening|tonight|last night)\s+(?:at\s+)?/, "").replace(/^at\s+/, "");
  if (qualified === "noon" || qualified === "midnight") return { event_date, event_time: qualified === "noon" ? "12:00:00" : "00:00:00", time_note: "Time interpreted from your words. Please check the date and time." };
  const exact = qualified.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?$/);
  const period = /morning/.test(phrase) ? "am" : /afternoon|evening|tonight|last night/.test(phrase) ? "pm" : null;
  if (exact && (exact[2] || exact[3] || period)) {
    let hour = Number(exact[1]);
    const meridiem = exact[3] || period;
    if (meridiem && hour >= 1 && hour <= 12) hour = hour % 12 + (meridiem === "pm" ? 12 : 0);
    else if (meridiem || hour > 23) return { event_date, event_time: clock, time_note: "Time unclear; recording time used. Please adjust." };
    return { event_date, event_time: `${String(hour).padStart(2, "0")}:${exact[2] ?? "00"}:00`, time_note: "Time interpreted from your words. Please check the date and time." };
  }
  return { event_date, event_time: clock, time_note: phrase ? "Approximate time; recording clock used. Please adjust the date and time." : "Recording time used. Change it if this happened earlier." };
}

export function validateExtraction(value: unknown, transcript: string, now: Date, timeZone: string): VoiceCandidate[] {
  const root = object(value);
  if (Object.keys(root).length !== 1 || !Array.isArray(root.events) || root.events.length > MAX_EVENTS) return invalid();
  if (!root.events.length) throw new VoiceError("NO_EVENTS");
  return root.events.map(item => {
    const row = object(item);
    if (Object.keys(row).length !== Object.keys(properties).length || Object.keys(row).some(key => !(key in properties))) return invalid();
    const fragment = text(row.source_fragment, 1200);
    if (!contains(transcript, fragment)) return invalid();
    const title = text(row.title, 160);
    if (!contains(fragment, title) || !eventTypes.includes(row.event_type as typeof eventTypes[number])) return invalid();
    const type = row.event_type as typeof eventTypes[number];
    const optionalText = (key: string) => {
      if (row[key] === null) return null;
      const value = text(row[key]);
      if (!contains(fragment, value)) return invalid();
      return value;
    };
    const amount = optionalText("amount"), dose_unit = optionalText("dose_unit"), distance_unit = optionalText("distance_unit");
    const notes = optionalText("notes"), intensity = optionalText("intensity"), expression = optionalText("time_expression");
    const dose_amount = groundedNumber(row.dose_amount, fragment), duration_minutes = groundedNumber(row.duration_minutes, fragment);
    const distance = groundedNumber(row.distance, fragment), severity = groundedNumber(row.severity, fragment);
    // Restrict fields to their canonical categories and require explicit unit context.
    if (amount !== null && !["food", "fluid"].includes(type)) return invalid();
    if ((dose_amount !== null || dose_unit !== null) && !["supplement", "medication"].includes(type)) return invalid();
    if (dose_amount !== null && (!dose_unit || !hasQuantity(dose_amount, dose_unit, fragment))) return invalid();
    if ((duration_minutes !== null || distance !== null || distance_unit !== null || intensity !== null) && type !== "exercise") return invalid();
    if (distance !== null && (!distance_unit || !hasQuantity(distance, distance_unit, fragment))) return invalid();
    if (duration_minutes !== null && !["minute", "minutes", "min", "mins"].some(unit => hasQuantity(duration_minutes, unit, fragment))) return invalid();
    if (severity !== null && (type !== "symptom" || severity > 10 || !new RegExp(`(?:\\bseverity\\s*(?:of\\s*)?(?:${numberPattern(severity)})\\b|\\b(?:${numberPattern(severity)})\\s*(?:out of\\s*10|/\\s*10)\\b)`, "i").test(fragment))) return invalid();
    const { time_note, ...time } = resolveVoiceTime(expression, now, timeZone);
    const event: VoiceEvent = {
      event_type: type, title, ...time, amount, dose_amount, dose_unit, duration_minutes, distance, distance_unit,
      intensity, severity, notes, tags: [],
      supplement_name: type === "supplement" ? title : null,
      exercise_type: type === "exercise" ? title : null,
      description: type === "food" || type === "fluid" ? title : null,
      dose: dose_amount !== null && dose_unit ? `${dose_amount} ${dose_unit}` : null,
      duration: duration_minutes !== null ? `${duration_minutes} min` : null,
    };
    validateHealthEventInput({ ...event, user_id: "validation", input_method: "voice" });
    return { event, source_fragment: fragment, time_note, requires_review: true };
  });
}

/** Explicit UI confirmation is the only caller. Food relationship provenance is retained; raw AI output is not. */
export function reviewedInputs(events: VoiceEvent[], userId: string): HealthEventInput[] {
  if (!events.length || events.length > MAX_EVENTS) throw new VoiceError("INVALID_EVENT");
  return events.map(event => {
    if (!event.title?.trim() || event.title.length > 160 || (event.notes?.length ?? 0) > 2000 || (event.tags?.length ?? 0) > 20 || event.tags?.some(tag => tag.length > 80)) throw new VoiceError("INVALID_EVENT");
    for (const key of ["dose_amount", "duration_minutes", "distance", "severity"] as const) {
      const value = event[key];
      if (value != null && (!Number.isFinite(value) || value < 0 || value > (key === "severity" ? 10 : 100000))) throw new VoiceError("INVALID_EVENT");
    }
    return validateHealthEventInput({ ...event, tags: event.tags?.filter(tag => tag.trim()) ?? [], user_id: userId, input_method: "voice",
      supplement_name: event.event_type === "supplement" ? event.title : null,
      exercise_type: event.event_type === "exercise" ? event.title : null,
      description: ["food", "fluid"].includes(event.event_type) ? event.title : null,
      dose: event.dose_amount != null && event.dose_unit ? `${event.dose_amount} ${event.dose_unit}` : null,
      duration: event.duration_minutes != null ? `${event.duration_minutes} min` : null,
    });
  });
}
