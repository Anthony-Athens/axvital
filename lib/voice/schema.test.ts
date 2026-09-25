import test from "node:test";
import assert from "node:assert/strict";
import { validateExtraction, resolveVoiceTime, reviewedInputs, extractionSchema } from "./schema.ts";
import { analyticsPayload, voiceAnalyticsEvents, type BillingInterval } from "../telemetry/policy.ts";

const now = new Date("2026-09-24T17:23:45Z"), zone = "America/New_York";
export function raw(event_type: string, title: string, source_fragment: string, patch: Record<string, unknown> = {}) {
  return { event_type, title, source_fragment, amount: null, food_quantity: null, food_unit: null, dose_amount: null, dose_unit: null, duration_minutes: null, distance: null, distance_unit: null, intensity: null, severity: null, notes: null, time_expression: null, ...patch };
}
const parse = (transcript: string, events: unknown[]) => validateExtraction({ events }, transcript, now, zone);

test("representative structured responses preserve counts, types, explicit amounts and unknown values", () => {
  const examples = [
    { transcript: "I had eggs and coffee.", events: [raw("food", "eggs", "I had eggs and coffee."), raw("fluid", "coffee", "I had eggs and coffee.")] },
    { transcript: "I took 5 grams of creatine.", events: [raw("supplement", "creatine", "I took 5 grams of creatine.", { dose_amount: 5, dose_unit: "grams" })] },
    { transcript: "I took magnesium.", events: [raw("supplement", "magnesium", "I took magnesium.")] },
    { transcript: "I ran this morning.", events: [raw("exercise", "ran", "I ran this morning.", { time_expression: "this morning" })] },
    { transcript: "My left knee hurts.", events: [raw("symptom", "left knee hurts", "My left knee hurts.")] },
    { transcript: "Lunch was a turkey sandwich and Coke Zero, and I took 5 grams of creatine.", events: [raw("food", "turkey sandwich", "Lunch was a turkey sandwich", { time_expression: "Lunch" }), raw("fluid", "Coke Zero", "Coke Zero"), raw("supplement", "creatine", "I took 5 grams of creatine.", { dose_amount: 5, dose_unit: "grams" })] },
  ];
  for (const example of examples) {
    const candidates = parse(example.transcript, example.events);
    assert.equal(candidates.length, example.events.length);
    candidates.forEach((candidate, index) => {
      assert.equal(candidate.event.event_type, example.events[index].event_type);
      assert.equal(candidate.event.dose_amount, example.events[index].dose_amount);
      assert.equal(candidate.event.distance, null); assert.equal(candidate.event.duration_minutes, null);
      assert.equal(candidate.event.severity, null); assert.equal(candidate.requires_review, true);
      assert.equal(candidate.event.calories, undefined);
    });
  }
});
test("schema is closed; fabricated values, diagnoses, unknown fields, excess events and missing fields fail", () => {
  const fragment = "I took magnesium.", valid = raw("supplement", "magnesium", fragment);
  for (const event of [{ ...valid, dose_amount: 400 }, { ...valid, dose_unit: "mg" }, { ...valid, title: "Magnesium deficiency" }, { ...valid, source_fragment: "Not spoken" }, { ...valid, input_method: "voice" }, { ...valid, event_type: "diagnosis" }, { ...valid, notes: "Take more magnesium" }, { ...valid, dose_amount: Infinity }]) assert.throws(() => parse(fragment, [event]), /INVALID_AI_RESPONSE/);
  assert.throws(() => parse(fragment, [{}]), /INVALID_AI_RESPONSE/);
  assert.throws(() => parse(fragment, Array(13).fill(valid)), /INVALID_AI_RESPONSE/);
  assert.throws(() => parse("", []), /NO_EVENTS/);
  assert.equal(extractionSchema.additionalProperties, false);
  assert.throws(() => parse("At 5 pm I took magnesium.", [raw("supplement", "magnesium", "At 5 pm I took magnesium.", { dose_amount: 5 })]), /INVALID_AI_RESPONSE/);
  assert.throws(() => parse("I ran 30 minutes and 5 miles.", [raw("exercise", "ran", "I ran 30 minutes and 5 miles.", { duration_minutes: 5 })]), /INVALID_AI_RESPONSE/);
  const explicit = parse("I took five grams of creatine.", [raw("supplement", "creatine", "I took five grams of creatine.", { dose_amount: 5, dose_unit: "grams" })]);
  assert.equal(explicit[0].event.dose_amount, 5);
});
test("relative dates respect the timezone; approximate phrases never acquire a made-up hour", () => {
  for (const phrase of [null, "this morning", "this afternoon", "tonight", "at lunch"]) assert.equal(resolveVoiceTime(phrase, now, zone).event_time, "13:23:45");
  for (const phrase of ["last night", "yesterday"]) assert.equal(resolveVoiceTime(phrase, now, zone).event_date, "2026-09-23");
  assert.equal(resolveVoiceTime("yesterday at 8:30 pm", now, zone).event_time, "20:30:00");
  assert.equal(resolveVoiceTime("at 08:30", now, zone).event_time, "08:30:00");
  assert.equal(resolveVoiceTime("this morning at 8", now, zone).event_time, "08:00:00");
  assert.equal(resolveVoiceTime("last night at 9", now, zone).event_time, "21:00:00");
  assert.equal(resolveVoiceTime("yesterday at noon", now, zone).event_time, "12:00:00");
  assert.equal(resolveVoiceTime("at 7", now, zone).event_time, "13:23:45");
  assert.equal(resolveVoiceTime("this morning", new Date("2026-09-24T02:00:00Z"), zone).event_date, "2026-09-23");
});
test("review conversion preserves edits and timestamps, includes only remaining rows and stamps voice", () => {
  const candidates = parse("I had eggs and coffee.", [raw("food", "eggs", "I had eggs and coffee."), raw("fluid", "coffee", "I had eggs and coffee.")]);
  const edited = { ...candidates[1].event, title: "Decaf coffee", amount: "8 oz", event_date: "2026-09-23", event_time: "08:15", tags: ["morning", "custom"], notes: "My edit" };
  const inputs = reviewedInputs([edited], "owner");
  assert.equal(inputs.length, 1); assert.equal(inputs[0].title, "Decaf coffee");
  assert.equal(inputs[0].input_method, "voice"); assert.equal(inputs[0].user_id, "owner");
  assert.equal(inputs[0].event_date, "2026-09-23"); assert.equal(inputs[0].event_time, "08:15");
  assert.deepEqual(inputs[0].tags, edited.tags); assert.equal(inputs[0].notes, edited.notes);
  assert.equal("source_fragment" in inputs[0], false);
  assert.throws(() => reviewedInputs([{ ...edited, event_time: "25:00" }], "owner"), /INVALID_EVENT/);
  assert.throws(() => reviewedInputs([{ ...edited, title: "" }], "owner"), /INVALID_EVENT/);
});
test("every voice analytics event drops all health data and identifiers", () => {
  for (const event of voiceAnalyticsEvents) assert.deepEqual(analyticsPayload(event, { transcript: "private", dose: 5, user_id: "secret", food: "eggs" } as unknown as BillingInterval), {});
});
