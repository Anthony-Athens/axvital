import test from "node:test";
import assert from "node:assert/strict";
import { timelineLayout } from "./model.ts";

test("taller plot centers the axis and keeps full-height lanes inside shading", () => {
  const categories = ["Check-in", "Nutrition", "Fluid", "Note", "Health event", "Workout", "Exercise", "Supplement", "Medication", "Symptom"];
  const layout = timelineLayout(categories);
  assert.equal(layout.centerY, (layout.plotTop + layout.plotBottom) / 2);
  assert.ok(layout.height >= 240 * 1.4 && layout.height <= 240 * 1.6);
  assert.equal(new Set(categories.map((_,i) => layout.activityY(i))).size, categories.length);
  for (let i = 0; i < categories.length; i++) {
    assert.ok(layout.activityY(i) > layout.plotTop);
    assert.ok(layout.activityY(i) + 8 < layout.plotBottom);
    assert.ok(i < 5 ? layout.activityY(i) + 8 < layout.centerY - 9 : layout.activityY(i) > layout.centerY + 9);
  }
  assert.ok(layout.intervalY - layout.plotBottom >= 30);
  assert.ok(layout.axisY - (layout.intervalY + 2 * 14) >= 25);
  assert.ok(layout.height > layout.axisY);
});
test("category lanes stay fixed when data is sparse, reordered, or empty", () => {
  const full = ["Check-in", "Nutrition", "Workout", "Supplement", "Symptom"];
  const layout = timelineLayout(full);
  for (const [i, category] of full.entries()) assert.equal(timelineLayout([category]).activityY(0), layout.activityY(i));
  assert.equal(timelineLayout([...full].reverse()).activityY(0), layout.activityY(full.length - 1));
  assert.equal(timelineLayout([]).height, layout.height);
});
