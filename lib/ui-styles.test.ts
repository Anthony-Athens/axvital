import assert from "node:assert/strict";
import test from "node:test";
import { uiStyles } from "./ui-styles.ts";

test("shared primary buttons use blue brand styling", () => { assert.match(uiStyles.button.primary, /bg-blue-600/); assert.match(uiStyles.button.primary, /hover:bg-blue-700/); assert.doesNotMatch(uiStyles.button.primary, /emerald/); });
test("shared form controls use slate borders and blue focus", () => { assert.match(uiStyles.control, /border-slate-300/); assert.match(uiStyles.control, /focus:border-blue-600/); assert.match(uiStyles.control, /focus:ring-blue-100/); });
test("semantic success remains emerald", () => { assert.match(uiStyles.status.success, /emerald/); assert.doesNotMatch(uiStyles.status.success, /blue/); });
test("active status is informational blue", () => { assert.match(uiStyles.status.active, /blue/); });
