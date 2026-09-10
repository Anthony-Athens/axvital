import test from "node:test";
import assert from "node:assert/strict";
import { compareAssociations, factors, leadingAssociation, MIN_BASELINE_DAYS, MIN_LOOKBACK_DAYS } from "./associations.ts";
import { DAY, rangeStart, calendarDay, lookback, timelineX, timelineLayout, type Activity, type Episode } from "./model.ts";
const start = Date.parse("2025-12-01T00:00:00Z"), now = start + 100 * DAY;
const episode = (day: number, end: number | null = day + 2): Episode => ({ id: String(day), start: start + day * DAY, end: end === null ? null : start + end * DAY, severity: null });
const episodes = [episode(30), episode(60)];
const pre = (day: number) => day >= 23 && day < 30 || day >= 53 && day < 60;
const event = (day: number, present = true): Activity => ({ id: String(day), at: start + day * DAY, dateOnly: true, category: "Check-in", checkin: { sleepQuality: present ? "Poor" : "Good", stress: present ? "High" : "Low", energy: present ? 3 : 4, exercise: present ? "Light" : "None" } });
const events = Array.from({ length: 100 }, (_,day) => event(day, pre(day) || day % 10 === 0));
const compare = (rows = events, eps = episodes) => compareAssociations(eps, rows, start, now)[0];

test("12-month range clamps leap day and shared timeline coordinates put daily ticks inside shaded windows", () => {
  assert.equal(new Date(rangeStart(Date.parse("2026-09-10T12:00:00Z"))).toISOString(), "2025-09-10T12:00:00.000Z");
  assert.equal(new Date(rangeStart(Date.parse("2024-02-29T00:00:00Z"))).toISOString(), "2023-02-28T00:00:00.000Z");
  const window = lookback(calendarDay(episodes[0].start));
  for (let day = window.start; day < window.end; day += DAY) {
    const x = timelineX(day + DAY / 2, start, now, 1200);
    assert.ok(x > timelineX(window.start, start, now, 1200));
    assert.ok(x < timelineX(window.end, start, now, 1200));
  }
  const layout = timelineLayout(["Check-in", "Nutrition", "Fluid", "Note", "Health event", "Workout", "Exercise", "Supplement", "Medication", "Symptom"]);
  for (let i = 0; i < 10; i++) { assert.ok(layout.activityY(i) >= layout.plotTop); assert.ok(layout.activityY(i) + 8 < layout.plotBottom); }
  assert.ok(layout.intervalY > layout.plotBottom); assert.ok(layout.axisY < layout.height);
});
test("separates pre-episode, baseline and inclusive episode calendar days", () => {
  const result = compare();
  assert.equal(result.preEpisodeEligibleDays, 14); assert.equal(result.preEpisodeOccurrences, 14);
  assert.equal(result.baselineEligibleDays, 80); assert.equal(result.baselineOccurrences, 8);
  assert.equal(result.preEpisodeRate, 1); assert.equal(result.baselineRate, 0.1); assert.equal(result.relativeRate, 10);
  assert.equal(result.episodesObserved, 2); assert.equal(result.eligibleEpisodes, 2);
});
test("factor definitions distinguish valid absence from missing or invalid answers", () => {
  for (const factor of factors) { assert.equal(factor.evaluate({}), null); assert.equal(factor.evaluate(event(0, true).checkin!), true); assert.equal(factor.evaluate(event(0, false).checkin!), false); }
  assert.equal(factors[0].evaluate({ sleepQuality: "6 hours" }), null);
  for (const energy of [0, 11, 2.5, "3", NaN, null]) assert.equal(factors[2].evaluate({ energy }), null);
  assert.equal(factors[3].evaluate({ exercise: "No Workout" }), false);
});
test("missing and untracked days never enter denominators", () => {
  const rows = events.filter(e => e.id !== "25"); rows.push({ ...event(25), checkin: {} });
  assert.equal(compare(rows).preEpisodeEligibleDays, 13);
  assert.equal(compare(rows).baselineEligibleDays, 80);
});
test("overlapping lookbacks count each day once; episode days cannot contaminate either group", () => {
  const result = compare(events, [episode(30, 30), episode(33, 33)]);
  // Union 23..32, excluding episode day 30: 9 unique days, not 13 summed days.
  assert.equal(result.preEpisodeEligibleDays, 9);
  assert.equal(result.evidence[0].eligibleDays, 7); assert.equal(result.evidence[1].eligibleDays, 6);
  assert.equal(result.baselineEligibleDays, 89);
});
test("one/no episode and sparse tracking suppress all percentages and ratios", () => {
  for (const result of [compare(events, []), compare(events, [episodes[0]]), compare([event(25), event(55)])]) {
    assert.equal(result.sufficient, false); assert.equal(result.preEpisodeRate, null); assert.equal(result.baselineRate, null); assert.equal(result.relativeRate, null);
  }
});
test("zero baseline stays finite; zero lookback and equal rates produce no leading increase", () => {
  const zeroBaseline = compare(events.map(e => event(Number(e.id), pre(Number(e.id)))));
  assert.equal(zeroBaseline.baselineRate, 0); assert.equal(zeroBaseline.relativeRate, null); assert.ok(leadingAssociation([zeroBaseline]));
  const zeroPre = compare(events.map(e => event(Number(e.id), !pre(Number(e.id)))));
  assert.equal(zeroPre.preEpisodeRate, 0); assert.equal(zeroPre.relativeRate, 0); assert.equal(leadingAssociation([zeroPre]), null);
  const equal = compare(events.map(e => event(Number(e.id), true)));
  assert.equal(equal.relativeRate, 1); assert.equal(leadingAssociation([equal]), null);
});
test("minimum thresholds are enforced exactly and zero observations stay insufficient", () => {
  const rows = [...Array.from({ length: MIN_BASELINE_DAYS }, (_,i) => event(i < 23 ? i : i + 40)), ...[23,24,25,26,53,54,55].map(d => event(d))];
  assert.equal(compare(rows).preEpisodeEligibleDays, MIN_LOOKBACK_DAYS);
  assert.equal(compare(rows).sufficient, true);
  assert.equal(compare(rows.slice(1)).sufficient, false);
  assert.equal(compare(rows.slice(0,-1)).sufficient, false);
  assert.equal(compare(events.map(e => event(Number(e.id), false))).sufficient, false);
});
test("boundary days across year transition exclude onset, resolution and partial current day", () => {
  const result = compare([22,23,29,30,31,32,33,53,59,60,62,63,100].map(d => event(d)));
  assert.equal(result.preEpisodeEligibleDays, 4); assert.equal(result.baselineEligibleDays, 3);
  assert.equal(result.evidence[0].start, start + 23 * DAY);
});
test("carry-in ongoing and resolved episodes prevent baseline contamination", () => {
  assert.equal(compare(events, [...episodes, episode(-20,null)]).baselineEligibleDays, 0);
  assert.equal(compare(events, [...episodes, episode(-20,10)]).baselineEligibleDays, 69);
});
test("duplicates do not inflate counts and conflicting duplicate answers become unknown", () => {
  assert.equal(compare([...events, event(25)]).preEpisodeEligibleDays, 14);
  assert.equal(compare([...events, event(25,false)]).preEpisodeEligibleDays, 13);
});
test("incomplete source suppresses comparison and quantity labels never imply certainty", () => {
  const result = compareAssociations(episodes, events, start, now, false)[0];
  assert.equal(result.sufficient, false); assert.equal(result.dataQuality, "low"); assert.equal(result.relativeRate, null);
  assert.equal(compare().dataQuality, "moderate");
});
test("ranking uses absolute difference, episode coverage, quantity, then stable factor key", () => {
  const a = compare();
  const b = { ...a, factorKey: "high_stress" as const, preEpisodeRate: 0.9 };
  assert.equal(leadingAssociation([b,a])?.factorKey, a.factorKey);
  b.preEpisodeRate = 1; b.eligibleEpisodes = 3;
  assert.equal(leadingAssociation([b,a])?.factorKey, a.factorKey);
  b.eligibleEpisodes = 2; b.baselineEligibleDays = 100;
  assert.equal(leadingAssociation([a,b])?.factorKey, b.factorKey);
  assert.equal(leadingAssociation([{ ...a, episodesObserved: 1 }]), null);
});
