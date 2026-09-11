import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { conditionIntelligenceDemos } from "./condition-intelligence-demo.ts";
import { conditionCampaigns } from "./conditions.ts";
import { leadingAssociation } from "../condition-intelligence/associations.ts";
import { metrics } from "../condition-intelligence/model.ts";

test("every campaign has a fictional, internally consistent supported comparison", () => {
  assert.deepEqual(Object.keys(conditionIntelligenceDemos), Object.keys(conditionCampaigns));
  for (const [key, demo] of Object.entries(conditionIntelligenceDemos)) {
    assert.equal(demo.episodes.length, 4);
    assert.ok(demo.episodes.every(e => e.id.startsWith(`illustrative-${key}`) && e.start > demo.start && e.end! < demo.now));
    assert.equal(metrics(demo.episodes, demo.now).recentSeverity, 3);
    const insight = leadingAssociation(demo.associations)!;
    assert.ok(insight.sufficient);
    assert.equal(insight.eligibleEpisodes, 4);
    assert.equal(insight.episodesObserved, 4);
    assert.equal(insight.preEpisodeRate, insight.preEpisodeOccurrences / insight.preEpisodeEligibleDays);
    assert.ok(insight.preEpisodeRate! > insight.baselineRate!);
  }
});

test("marketing pages render without auth dependencies, with honest static controls and conversion", async () => {
  const bundle = await build({ stdin: { contents: `import {renderToStaticMarkup} from 'react-dom/server'; import {ConditionLandingPage} from './components/campaigns/ConditionLandingPage'; import {conditionCampaigns} from './lib/campaigns/conditions'; export const pages=Object.entries(conditionCampaigns).map(([key,content])=>renderToStaticMarkup(<ConditionLandingPage content={content} conditionKey={key}/>));`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, jsx: "automatic", platform: "node", format: "cjs", metafile: true });
  assert.ok(Object.keys(bundle.metafile!.inputs).every(path => !/supabase|condition-intelligence\/load|IntelligenceTimezone/.test(path)));
  const renderedModule = { exports: {} as { pages: string[] } };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)((await import("node:module")).createRequire(import.meta.url), renderedModule, renderedModule.exports);
  for (const html of renderedModule.exports.pages) {
    assert.match(html, /Illustrative example/);
    assert.doesNotMatch(html, /<title>[^<]*<!--/);
    assert.match(html, /aria-label="Key Insight"/);
    assert.equal((html.match(/data-lookback-band="true"/g) ?? []).length, 4);
    assert.doesNotMatch(html, /role="button"|Select an episode for details|\/my-health|\/health\/episodes/);
    assert.ok(html.indexOf("See your condition in context") < html.indexOf("There’s more to remember"));
    assert.match(html, /Start building your own episode history/);
  }
});
