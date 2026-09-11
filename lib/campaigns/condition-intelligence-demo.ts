import { compareAssociations } from "../condition-intelligence/associations.ts";
import { DAY, rangeStart, type Activity, type Episode } from "../condition-intelligence/model.ts";

// Fictional, fixed snapshots. These are examples of the UI, never condition findings.
function snapshot(slug: string, offsets: number[], factor: "sleep" | "stress" | "energy") {
  const now = Date.parse("2026-09-01T00:00:00Z"), start = rangeStart(now);
  const episodes: Episode[] = offsets.map((offset, i) => ({
    id: `illustrative-${slug}-${i}`, start: now - offset * DAY,
    end: now - (offset - [5, 4, 6, 3][i]) * DAY, severity: [6, 4, 5, 3][i],
  }));
  const healthEvents: Activity[] = [];
  for (let i = 1; i <= 365; i++) {
    const at = now - i * DAY;
    const before = episodes.some(e => at >= e.start - 7 * DAY && at < e.start);
    const present = before ? i % 3 !== 0 : i % 11 === 0;
    healthEvents.push({ id: `${slug}-checkin-${i}`, at, category: "Check-in", logicalDate: new Date(at).toISOString().slice(0, 10), checkin: {
      sleepQuality: factor === "sleep" && present ? "Poor" : "Good",
      stress: factor === "stress" && present ? "High" : "Low",
      energy: factor === "energy" && present ? 2 : 7,
      exercise: i % 2 ? "Light" : "None",
    } });
    if (i % 3 === 0) healthEvents.push({ id: `${slug}-meal-${i}`, at, category: "Nutrition" });
    if (i % 4 === 0) healthEvents.push({ id: `${slug}-workout-${i}`, at, category: "Workout" });
    if (i % 5 === 0) healthEvents.push({ id: `${slug}-supplement-${i}`, at, category: "Supplement" });
  }
  return { episodes, healthEvents, now, start, timeZone: "UTC", associations: compareAssociations(episodes, healthEvents, start, now) };
}

export const conditionIntelligenceDemos = {
  ms: snapshot("ms", [310, 221, 129, 39], "energy"),
  psoriasis: snapshot("psoriasis", [295, 205, 117, 27], "stress"),
  hsv: snapshot("hsv", [320, 233, 146, 55], "sleep"),
};
export type DemoConditionKey = keyof typeof conditionIntelligenceDemos;
