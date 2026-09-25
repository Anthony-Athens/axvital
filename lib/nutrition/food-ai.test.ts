import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { provisionalFood, type FoodCatalog, type FoodResolution } from "./food-resolution.ts";

const code = (await build({ entryPoints: ["lib/nutrition/food-ai.ts"], bundle: true, write: false, platform: "node", format: "cjs", plugins: [{ name: "server-marker", setup(b) {
  b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "mock" })); b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: "export {};" }));
} }] })).outputFiles[0].text;
const parentId = "00000000-0000-4000-8000-000000000001", componentId = "00000000-0000-4000-8000-000000000002";
const catalog: FoodCatalog = { foods: [{ id: parentId, name: "Sandwich", aliases: [], categories: [] }, { id: componentId, name: "Bread", aliases: [], categories: [] }], components: [{ parent_food_id: parentId, component_food_id: componentId, source: "library", confidence: null }] };
function fixture(output: unknown = { food_id: null, components: [] }, options: { key?: string; refusal?: boolean; fail?: boolean } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const mod = { exports: {} as { inferFood: (base: FoodResolution, context: string, catalog: FoodCatalog, signal: AbortSignal) => Promise<FoodResolution>; validateFoodAI: (value: unknown, base: FoodResolution, context: string, catalog: FoodCatalog) => FoodResolution } };
  runInNewContext(code, { module: mod, exports: mod.exports, structuredClone, AbortSignal, process: { env: { OPENAI_API_KEY: options.key ?? "secret-server-key" } }, fetch: async (url: string, init: RequestInit) => {
    calls.push({ url, init }); if (options.fail) throw Error("private provider error");
    return Response.json({ status: "completed", output: [{ type: "message", content: options.refusal ? [{ type: "refusal", refusal: "private" }] : [{ type: "output_text", text: JSON.stringify(output) }] }] });
  } });
  return { calls, validate: (value: unknown) => mod.exports.validateFoodAI(value, provisionalFood("Family sandwich"), "Family sandwich with bread", catalog), run: () => mod.exports.inferFood(provisionalFood("Family sandwich"), "Family sandwich with bread", catalog, new AbortController().signal) };
}
test("AI is strict, server-authenticated, store:false and all inferred suggestions need review", async () => {
  const f = fixture({ food_id: parentId, components: [{ food_id: componentId, label: "Bread", source: "explicit", evidence: "with bread", confidence: 0.8 }, { food_id: null, label: "Filling", source: "ai_inferred", evidence: null, confidence: 0.5 }] });
  const result = await f.run(); assert.equal(f.calls.length, 1);
  const body = JSON.parse(String(f.calls[0].init.body));
  assert.equal(body.store, false); assert.equal(body.text.format.strict, true); assert.equal(body.text.format.schema.additionalProperties, false); assert.equal(body.tools, undefined);
  assert.match(body.instructions, /No quantities/); assert.equal(result.method, "ai"); assert.equal(result.confirmed, false);
  assert.equal(result.components[0].source, "library", "library knowledge takes precedence over model provenance");
  assert.equal(result.components[1].source, "ai_inferred"); assert.ok(result.components.every(c => !c.included && !c.confirmed));
  assert.doesNotMatch(JSON.stringify(result), /secret-server-key|evidence|calories|macros/);
});
test("invalid schemas, invented references and unsupported explicit claims are rejected", () => {
  const f = fixture();
  for (const value of [{ food_id: parentId, components: [], calories: 500 }, { food_id: "invented", components: [] }, { food_id: null, components: [{ food_id: null, label: "mayo", source: "explicit", evidence: "mayo", confidence: 1 }] }, { food_id: null, components: [{ food_id: componentId, label: "Bread", source: "ai_inferred", evidence: null, confidence: 2 }] }, { food_id: null, components: [{ food_id: componentId, label: "Bread", source: "ai_inferred", evidence: null, confidence: 0.5, quantity: 3 }] }]) assert.throws(() => f.validate(value), /INVALID_FOOD_AI/);
});
test("missing credentials, refusal, provider errors and invalid output preserve the provisional label", async () => {
  for (const options of [{ key: "" }, { refusal: true }, { fail: true }, {}]) {
    const f = fixture({ invalid: true }, options), result = await f.run();
    assert.equal(result.label, "Family sandwich"); assert.equal(result.method, "provisional"); assert.equal(result.components.length, 0);
    if (options.key === "") assert.equal(f.calls.length, 0);
  }
});
