import assert from "node:assert/strict";
import test from "node:test";
import { completedGettingStartedSteps, shouldShowGettingStarted } from "./getting-started.ts";

const empty = { checkin: false, logged: false, setup: false, dashboard: false, experiments: false };

test("shows Getting Started to a new user", () => {
  assert.equal(completedGettingStartedSteps(empty), 0);
  assert.equal(shouldShowGettingStarted(empty, false), true);
});

test("hides Getting Started after dismissal", () => {
  assert.equal(shouldShowGettingStarted(empty, true), false);
});

test("hides Getting Started after meaningful progress", () => {
  const progress = { ...empty, checkin: true, logged: true, setup: true, dashboard: true };
  assert.equal(completedGettingStartedSteps(progress), 4);
  assert.equal(shouldShowGettingStarted(progress, false), false);
});
