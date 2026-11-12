import assert from "node:assert/strict";
import test from "node:test";
import { uiStyles } from "./ui-styles.ts";

test("shared primary buttons use the blue accent role", () => {
  assert.match(uiStyles.button.primary, /bg-accent(?![\w-])/);
  assert.match(uiStyles.button.primary, /hover:bg-accent-hover/);
  assert.match(uiStyles.button.primary, /text-white/);
  assert.doesNotMatch(uiStyles.button.primary, /emerald/);
});
test("shared form controls use dark surfaces, strong borders and accent focus", () => {
  assert.match(uiStyles.control, /bg-raised/);
  assert.match(uiStyles.control, /border-line-strong/);
  assert.match(uiStyles.control, /focus:border-accent-fg/);
  assert.match(uiStyles.control, /focus:ring-accent-fg\/30/);
});
test("no shared style uses light-theme surfaces", () => {
  const all = JSON.stringify(uiStyles);
  assert.doesNotMatch(all, /bg-white(?![\w/-])|bg-slate-(50|100)\b|text-slate-|border-slate-/);
});
test("semantic success remains emerald", () => {
  assert.match(uiStyles.status.success, /emerald/);
  assert.doesNotMatch(uiStyles.status.success, /blue/);
});
test("active status is informational blue", () => {
  assert.match(uiStyles.status.active, /blue/);
});
