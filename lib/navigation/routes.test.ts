import assert from "node:assert/strict";
import test from "node:test";
import { activeNavigationId, desktopNavigationItems, isFocusedWorkoutRoute, matchesRoute, primaryMobileItems } from "./routes.ts";

test("desktop and mobile expose the same five concepts", () => { const expected = ["Today", "Track", "Learn", "Experiments", "Me"]; assert.deepEqual(desktopNavigationItems.map((item) => item.label), expected); assert.deepEqual(primaryMobileItems.map((item) => item.label), expected); });
test("Today and Experiments preserve their route families", () => { assert.equal(activeNavigationId("/today"), "today"); assert.equal(activeNavigationId("/checkin"), "today"); assert.equal(activeNavigationId("/experiments/new"), "experiments"); assert.equal(activeNavigationId("/experiments/123/results"), "experiments"); });
test("tracking routes activate Track", () => { for (const route of ["/track", "/weekly-overview", "/workouts", "/workouts/templates/new", "/habits/123", "/protocols/123", "/health/nutrition/goals", "/health/symptoms/history", "/health/episodes/123", "/health/timeline"]) assert.equal(activeNavigationId(route), "track", route); });
test("learning routes activate Learn, including condition analysis", () => { for (const route of ["/learn", "/dashboard", "/insights", "/weekly-recap", "/workouts/progress", "/health/conditions/123/patterns", "/health/conditions/123/patterns/sleep", "/health/conditions/123/outlook"]) assert.equal(activeNavigationId(route), "learn", route); });
test("profile, account and condition management routes activate Me", () => { for (const route of ["/me", "/profile", "/settings", "/settings/billing", "/health", "/health/conditions/123"]) assert.equal(activeNavigationId(route), "me", route); });
test("route matching respects segment boundaries", () => { assert.equal(matchesRoute("/habits/abc", ["/habits"]), true); assert.equal(matchesRoute("/habits-old", ["/habits"]), false); });
test("only active workout execution uses focused mode", () => { assert.equal(isFocusedWorkoutRoute("/workouts/sessions/123"), true); assert.equal(isFocusedWorkoutRoute("/workouts/sessions/123/summary"), false); });
