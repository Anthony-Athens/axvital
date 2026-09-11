import assert from "node:assert/strict";
import test from "node:test";
import { attributionFromSearch, campaignAllowlist, campaignEvents, campaignKeys, campaignPayload, campaignSignupUrl, safeAttribution } from "./campaign.ts";
import { analyticsUrl } from "./policy.ts";
import { newlyCreatedSignup } from "../auth/signup-result.ts";
import { conditionCampaigns } from "../campaigns/conditions.ts";

test("initial Google Ads defaults accept exactly the approved rollout labels", () => {
  assert.deepEqual(campaignAllowlist("{}"), {
    utm_source: ["google"], utm_medium: ["cpc"],
    utm_campaign: ["ms_launch", "psoriasis_launch", "hsv_launch"],
    utm_content: ["ad_a", "ad_b", "ad_c"], utm_term: [],
  });
  for (const [i, key] of campaignKeys.entries()) {
    const content = ["ad_a", "ad_b", "ad_c"][i];
    const search = `?utm_source=google&utm_medium=cpc&utm_campaign=${key}_launch&utm_content=${content}`;
    const expected = { source_page: `conditions_${key}`, utm_source: "google", utm_medium: "cpc", utm_campaign: `${key}_launch`, utm_content: content };
    const signup = campaignSignupUrl(key, search);
    assert.deepEqual(attributionFromSearch(signup.split("?")[1]), expected);
    for (const event of Object.values(campaignEvents)) assert.deepEqual(campaignPayload(event, expected), expected);
    assert.equal(analyticsUrl(`https://axvital.com/conditions/${key}${search}`), `https://axvital.com/conditions/${key}`);
  }
  for (const search of [
    "?utm_source=random_site&utm_medium=unknown&utm_campaign=test123&utm_content=whatever",
    "?utm_source=GOOGLE&utm_medium=CPC&utm_campaign=MS_LAUNCH&utm_content=AD_A",
    "?utm_source=bing&utm_medium=organic&utm_term=keyword_1",
    "?utm_term=private%40example.test&email=private&user_id=secret&symptoms=private&episode_id=secret",
  ]) assert.deepEqual(attributionFromSearch(search), {});
  assert.deepEqual(campaignAllowlist('{"utm_campaign":[],"utm_term":[]}').utm_campaign, []);
});

test("campaign properties admit only reviewed labels, never arbitrary query text", () => {
  assert.deepEqual(campaignKeys, Object.keys(conditionCampaigns));
  const allowed = campaignAllowlist('{"utm_campaign":["launch"],"utm_term":["keyword_1"],"utm_content":["ad_a"]}');
  assert.deepEqual(safeAttribution({ source_page: "conditions_ms", utm_source: "google", utm_campaign: "launch", utm_term: "keyword_1", utm_content: "ad_a", email: "private@example.test", user_id: "secret", notes: "private" }, allowed), { source_page: "conditions_ms", utm_source: "google", utm_campaign: "launch", utm_term: "keyword_1", utm_content: "ad_a" });
  assert.deepEqual(safeAttribution({ source_page: "private", utm_campaign: "private_name", utm_term: "my symptoms", utm_source: "private@example.test" }, allowed), {});
  assert.deepEqual(campaignAllowlist("not json"), campaignAllowlist("{}"));
  assert.deepEqual(attributionFromSearch("?utm_source=google&utm_source=private&gclid=secret", "ms"), { source_page: "conditions_ms" });
  assert.equal(campaignPayload(campaignEvents.cta, { source_page: "unknown" }), null);
  for (const key of campaignKeys) {
    const url = campaignSignupUrl(key, "?utm_source=google&utm_medium=cpc&email=secret");
    assert.equal(url, `/signup?source_page=conditions_${key}&utm_source=google&utm_medium=cpc`);
    assert.equal(analyticsUrl(`https://axvital.com/conditions/${key}?token=secret`), `https://axvital.com/conditions/${key}`);
    assert.deepEqual(campaignPayload(campaignEvents.cta, { ...attributionFromSearch(url.split("?")[1]), health: "private" }), { source_page: `conditions_${key}`, utm_source: "google", utm_medium: "cpc" });
  }
});

test("signup conversion requires a real fresh account reply", () => {
  const start = Date.parse("2026-09-11T12:00:00Z"), end = start + 1000;
  const fresh = { created_at: new Date(start + 100).toISOString(), identities: [{}] };
  assert.equal(newlyCreatedSignup(fresh, start, end), true);
  for (const user of [null, {}, { ...fresh, identities: [] }, { ...fresh, created_at: "invalid" }, { ...fresh, created_at: new Date(start - 1000).toISOString() }, { ...fresh, created_at: new Date(end + 1000).toISOString() }]) assert.equal(newlyCreatedSignup(user, start, end), false);
});
