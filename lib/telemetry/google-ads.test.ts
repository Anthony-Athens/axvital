import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { googleAdsBootstrap, googleAdsTagId } from "./google-ads.ts";

test("Google Ads accepts only a destination ID and queues a single generic configuration", () => {
  const id = "AW-18445445142";
  assert.equal(googleAdsTagId(id), id);
  for (const value of ["", "G-123", "AW-123<script>", " AW-123", "AW-private"]) assert.equal(googleAdsTagId(value), null);
  const window = {dataLayer: [] as IArguments[]};
  runInNewContext(googleAdsBootstrap(id), {window, Date});
  const calls = window.dataLayer.map(args => Array.from(args));
  assert.equal(calls.filter(c => c[0] === "config").length, 1);
  assert.equal(calls[2][1], id);
  const config = JSON.parse(JSON.stringify(calls[2][2]));
  assert.deepEqual(config, {send_page_view:false,page_location:"https://axvital.com/",page_referrer:"",page_title:"AXVital",allow_ad_personalization_signals:false,allow_enhanced_conversions:false});
  assert.equal(calls[0][0], "set");
  assert.equal(calls[1][0], "js");
  assert.ok(calls.every(c => c[0] !== "event"));
  assert.doesNotMatch(googleAdsBootstrap(id), /document\.|location\.|user_data|user_id|source_page|utm_|conversion_label/);
  assert.doesNotThrow(() => runInNewContext(googleAdsBootstrap(id), {window:{gtag:()=>{throw Error("blocked")}},Date}));
});

test("one global Google integration preserves Vercel and uses Next script deduplication", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const root = read("../../app/layout.tsx");
  assert.equal((root.match(/<GoogleAdsTag\s*\/>/g) ?? []).length, 1);
  assert.equal((root.match(/<ProductAnalytics\s*\/>/g) ?? []).length, 1);
  const component = read("../../components/GoogleAdsTag.tsx");
  assert.equal((component.match(/googletagmanager.com\/gtag\/js/g) ?? []).length, 1);
  assert.match(component, /if \(!tagId\) return null/);
  assert.match(component, /id="axvital-google-ads-library"/);
  assert.match(component, /id="axvital-google-ads-config"/);
  assert.equal((component.match(/strategy="afterInteractive"/g) ?? []).length, 2);
  assert.match(read("../../components/ProductAnalytics.tsx"), /analyticsUrl\(event.url\)/);
});
