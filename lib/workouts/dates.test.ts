import assert from "node:assert/strict";
import test from "node:test";
import { endOfMonth } from "./dates.ts";

test("endOfMonth returns a valid final day for every month length", () => {
  assert.equal(endOfMonth("2026-09-01"), "2026-09-30");
  assert.equal(endOfMonth("2026-02-10"), "2026-02-28");
  assert.equal(endOfMonth("2024-02-10"), "2024-02-29");
  assert.equal(endOfMonth("2026-12-31"), "2026-12-31");
});

test("endOfMonth rejects malformed or impossible dates", () => {
  assert.throws(() => endOfMonth("2026-09-31"), /INVALID_DATE/);
  assert.throws(() => endOfMonth("09/01/2026"), /INVALID_DATE/);
});
