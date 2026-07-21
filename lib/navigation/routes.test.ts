import assert from "node:assert/strict";
import test from "node:test";
import { activeNavigationId, isFocusedWorkoutRoute, matchesRoute, moreNavigationItems, primaryMobileItems } from "./routes.ts";

test("mobile navigation has four destinations plus More", () => { assert.equal(primaryMobileItems.length + 1, 5); assert.deepEqual(primaryMobileItems.map((item) => item.mobileLabel ?? item.label), ["Today", "Planner", "Workouts", "Progress"]); });
test("primary routes map to the intended destinations", () => { assert.equal(primaryMobileItems.find((item) => item.id === "today")?.href, "/today"); assert.equal(primaryMobileItems.find((item) => item.id === "planner")?.href, "/weekly-overview"); assert.equal(primaryMobileItems.find((item) => item.id === "workouts")?.href, "/workouts"); assert.equal(primaryMobileItems.find((item) => item.id === "progress")?.href, "/dashboard"); });
test("nested workout routes activate Workouts", () => { assert.equal(activeNavigationId("/workouts/templates/123"), "workouts"); assert.equal(activeNavigationId("/workouts/planned/123"), "workouts"); assert.equal(activeNavigationId("/workouts/sessions/123"), "workouts"); });
test("dedicated workout progress activates More", () => { assert.equal(activeNavigationId("/workouts/progress"), "more"); });
test("secondary routes activate More", () => { assert.equal(activeNavigationId("/habits/123"), "more"); assert.equal(activeNavigationId("/protocols/123"), "more"); assert.equal(activeNavigationId("/profile"), "more"); });
test("secondary destinations are not duplicated in primary navigation", () => { const primaryIds = new Set(primaryMobileItems.map((item) => item.id)); assert.equal(moreNavigationItems.some((item) => primaryIds.has(item.id)), false); assert.ok(moreNavigationItems.some((item) => item.id === "exercise-library")); });
test("route matching respects segment boundaries", () => { assert.equal(matchesRoute("/habits/abc", ["/habits"]), true); assert.equal(matchesRoute("/habits-old", ["/habits"]), false); });
test("only active workout execution uses focused mode", () => { assert.equal(isFocusedWorkoutRoute("/workouts/sessions/123"), true); assert.equal(isFocusedWorkoutRoute("/workouts/sessions/123/summary"), false); });
