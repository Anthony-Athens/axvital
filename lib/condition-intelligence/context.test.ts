import test from "node:test";
import assert from "node:assert/strict";
import { episodeContext, focusEvidence, intervalContext } from "./context.ts";
import { compareAssociations } from "./associations.ts";
import { activityDay, aggregateActivity, DAY, episodeWindow, localRangeStart, type Activity, type Episode } from "./model.ts";
import { dayOrdinal, localDateBoundary } from "../measurements/time-window.ts";
const zone = "America/Los_Angeles";
const ep: Episode = { id: "e", start: Date.parse("2026-03-10T07:00:00Z"), end: Date.parse("2026-03-12T07:00:00Z"), severity: null };
const log = (date: string, checkin: Activity["checkin"] = { sleepQuality: "Poor", energy: 4 }): Activity => ({ id: date, at: Date.parse(`${date}T00:00:00Z`), logicalDate: date, dateOnly: true, category: "Check-in", checkin });
test("timestamp midnight and date-only semantics are deterministic", () => {
  assert.equal(dayOrdinal("2026-09-10T01:00:00Z", zone), dayOrdinal("2026-09-09", zone));
  assert.equal(dayOrdinal("2026-09-10T06:30:00Z", zone), dayOrdinal("2026-09-09", zone));
  assert.equal(dayOrdinal("2026-09-10T07:00:00Z", zone), dayOrdinal("2026-09-10", zone));
  assert.equal(dayOrdinal("2026-09-10", "Pacific/Auckland"), dayOrdinal("2026-09-10", zone));
  assert.equal(activityDay(log("2026-09-10"), zone), dayOrdinal("2026-09-10", zone));
});
test("DST lookbacks contain seven calendar days even across a 23-hour day", () => {
  const window = episodeWindow(ep, zone);
  assert.equal(window.start, dayOrdinal("2026-03-03", zone));
  assert.equal(window.end, dayOrdinal("2026-03-10", zone));
  const elapsed = Date.parse(localDateBoundary("2026-03-10",zone)) - Date.parse(localDateBoundary("2026-03-03",zone));
  assert.equal(elapsed, 7 * DAY - 3600000);
  assert.equal(Date.parse(localDateBoundary("2026-11-02",zone)) - Date.parse(localDateBoundary("2026-11-01",zone)), 25 * 3600000);
});
test("local comparison excludes onset day and uses exact local lookback boundary", () => {
  const now = Date.parse("2026-04-01T07:00:00Z"), start = Date.parse(localDateBoundary("2026-03-01",zone));
  const rows = [log("2026-03-02"), log("2026-03-03"), log("2026-03-09"), log("2026-03-10"), log("2026-03-12"), log("2026-03-13")];
  const result = compareAssociations([ep], rows, start, now, true, zone)[0];
  assert.equal(result.preEpisodeEligibleDays, 2); assert.equal(result.baselineEligibleDays, 2);
  const midnight: Activity = { id: "midnight", at: Date.parse("2026-03-10T06:59:00Z"), category: "Check-in", checkin: { sleepQuality: "Poor" } };
  assert.equal(compareAssociations([ep], [midnight], start, now, true, zone)[0].preEpisodeEligibleDays, 1);
});
test("completed/ongoing details preserve duration, severity absence, and prior interval", () => {
  const prior = { ...ep, id: "prior", start: ep.start - 10 * DAY };
  const completed = episodeContext(ep, [prior, ep], [], zone);
  assert.equal(completed.duration, 2); assert.equal(completed.priorInterval, 10); assert.equal(ep.severity, null);
  assert.equal(episodeContext({ ...ep, end: null }, [ep], [], zone).duration, null);
});
test("coverage counts valid field answers; full, partial, zero and unavailable remain distinct", () => {
  const all = Array.from({ length: 7 }, (_,i) => log(`2026-03-${String(i+3).padStart(2,"0")}`));
  assert.equal(episodeContext(ep, [ep], all, zone).usableDays, 7);
  const partial = episodeContext(ep, [ep], [...all.slice(0,3), log("2026-03-08", {})], zone);
  assert.equal(partial.usableDays, 3);
  assert.equal(partial.coverage.find(c => c.key === "exercise")?.days, 0);
  assert.equal(episodeContext(ep,[ep],[],zone).usableDays,0);
  assert.equal(episodeContext(ep,[ep],all,zone,false).usableDays,null);
  assert.ok(episodeContext(ep,[ep],all,zone,false).coverage.every(c=>c.days===null));
});
test("evidence maps only supporting IDs to stable local clusters and windows; clearing restores defaults", () => {
  const events = [log("2026-03-03"), log("2026-03-04", {sleepQuality:"Good"})];
  const result = compareAssociations([ep], events, Date.parse(localDateBoundary("2026-03-01",zone)), Date.parse("2026-04-01T07:00:00Z"), true, zone);
  const focus = focusEvidence({ kind: "association", key: "poor_sleep" }, result, [ep], events, zone);
  assert.deepEqual([...focus.episodeIds],["e"]); assert.equal(focus.clusterKeys.size,1);
  assert.ok(focus.clusterKeys.has(`${dayOrdinal("2026-03-03",zone)}:Check-in`));
  assert.equal(focusEvidence(null,result,[ep],events,zone).clusterKeys.size,0);
  assert.equal(focusEvidence({kind:"association",key:"poor_sleep"},result,[ep],[],zone).clusterKeys.size,0);
  assert.equal(focusEvidence({kind:"episode",id:"e"},result,[ep],events,zone).clusterKeys.size,2);
  assert.equal(aggregateActivity([...events,events[0]],zone)[0].count,2);
});
test("historical interval context is neutral and requires two prior intervals", () => {
  const episodes = [0,10,20].map((d,i)=>({...ep,id:String(i),start:ep.start+d*DAY}));
  assert.equal(intervalContext(episodes,ep.start+35*DAY),"5 days longer than your average interval");
  assert.equal(intervalContext(episodes,ep.start+25*DAY),"5 days shorter than your average interval");
  assert.equal(intervalContext(episodes,ep.start+30*DAY),"Equal to your average interval");
  assert.equal(intervalContext(episodes.slice(0,2),ep.start+35*DAY),null);
});
test("local range starts at local midnight one year before the current local day", () => {
  assert.equal(new Date(localRangeStart(Date.parse("2026-09-10T01:00:00Z"),zone)).toISOString(),"2025-09-09T07:00:00.000Z");
});
