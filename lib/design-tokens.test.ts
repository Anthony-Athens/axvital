import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { colors, todaySectionOrder } from "./design-tokens.ts";

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test("every text and category color meets WCAG AA on every surface", () => {
  const foregrounds = [
    ...Object.values(colors.text),
    colors.accent.onDark,
    ...Object.values(colors.category),
  ];
  for (const bg of [colors.surface.ground, colors.surface.surface, colors.surface.raised])
    for (const fg of foregrounds)
      assert.ok(contrast(fg, bg) >= 4.5, `${fg} on ${bg} is ${contrast(fg, bg).toFixed(2)}:1`);
});
test("white button text meets AA on the accent", () => {
  assert.ok(contrast("#FFFFFF", colors.accent.action) >= 4.5);
});
test("design tokens match the CSS custom properties", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").toLowerCase();
  const pairs: [string, string][] = [
    ["--ground", colors.surface.ground],
    ["--surface", colors.surface.surface],
    ["--raised", colors.surface.raised],
    ["--line", colors.surface.line],
    ["--fg", colors.text.primary],
    ["--fg-2", colors.text.secondary],
    ["--fg-3", colors.text.muted],
    ["--accent", colors.accent.action],
    ["--cat-food", colors.category.food],
    ["--cat-workout", colors.category.workout],
  ];
  for (const [name, hex] of pairs)
    assert.match(css, new RegExp(`${name}:\\s*${hex.toLowerCase()};`), name);
});
test("Today prioritizes status and plan before optional forms", () => {
  assert.deepEqual(todaySectionOrder, [
    "header",
    "summary",
    "plan",
    "checkin",
    "events",
    "timeline",
  ]);
});
