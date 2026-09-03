import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { conditionCampaigns, getConditionCampaign, isConditionCampaignPath } from "./conditions.ts";
import { protectedRoutes, isRoute } from "../supabase/routes.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
test("only the three requested condition campaigns exist and are public", () => {
  assert.deepEqual(Object.keys(conditionCampaigns), ["ms", "psoriasis", "hsv"]);
  for (const slug of Object.keys(conditionCampaigns)) {
    assert.equal(isRoute(`/conditions/${slug}`, protectedRoutes), false);
    assert.equal(isConditionCampaignPath(`/conditions/${slug}`), true);
    const content = getConditionCampaign(slug)!;
    assert.ok(content.symptoms.length && content.context.length && content.questions.length);
    assert.ok(content.experiment.endsWith("?"));
    assert.ok(content.title && content.description && content.caution);
  }
  assert.equal(getConditionCampaign("constructor"), undefined);
  assert.equal(getConditionCampaign("migraine"), undefined);
  assert.equal(isConditionCampaignPath("/health/conditions/123"), false);
});
test("campaign conversion does not attach health context or introduce telemetry", () => {
  const source = read("../../components/campaigns/ConditionLandingPage.tsx");
  assert.match(source, /href="\/signup" rel="noreferrer"/);
  assert.equal((source.match(/<Signup\/>/g) ?? []).length, 3);
  for (const route of ["privacy", "terms", "contact", "health-disclaimer"]) assert.ok(source.includes(`href="/${route}"`));
  assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage|trackEvent|gtag|fbq|\/signup\?/);
  assert.match(source, /does not provide medical advice, diagnosis, or treatment/);
  assert.match(source, /not medical advice or a recommended intervention/);
});
test("campaign routes are indexable and referrer-safe without inbound public navigation", () => {
  const route = read("../../app/conditions/[slug]/page.tsx");
  assert.match(route, /index: true/);
  assert.match(route, /referrer: "no-referrer"/);
  assert.match(route, /dynamicParams = false/);
  assert.match(read("../../next.config.ts"), /Referrer-Policy.*no-referrer/);
  for (const file of ["../../app/page.tsx", "../../components/Footer.tsx"]) assert.doesNotMatch(read(file), /\/conditions\//);
});
