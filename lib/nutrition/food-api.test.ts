import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";

const code = (await build({ entryPoints: ["app/api/nutrition/resolve/route.ts"], bundle: true, write: false, platform: "node", format: "cjs", plugins: [{ name: "food-route-fixture", setup(b) {
  const mocks: Record<string, string> = {
    "@/lib/supabase/server": "export const createClient=async()=>fixtureClient;",
    "@/lib/nutrition/food-catalog": "export const loadFoodCatalog=async()=>{catalogReads++;return {foods:[{id:'00000000-0000-4000-8000-000000000001',name:'Bread',aliases:[],categories:[]}],components:[]}};",
    "@/lib/nutrition/food-ai": "export const inferFood=async(base)=>{inferenceCalls++;return base};",
  };
  b.onResolve({ filter: /^@\// }, args => mocks[args.path] ? { path: args.path, namespace: "mock" } : undefined);
  b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path] }));
} }] })).outputFiles[0].text;
function fixture(user: string | null = "owner", budget = true) {
  const mod = { exports: {} as { POST: (request: Request) => Promise<Response> } };
  const context = { module: mod, exports: mod.exports, Response, URL, TextDecoder, Date, Intl, catalogReads: 0, inferenceCalls: 0, console: { error: () => {} }, fixtureClient: { from: (table: string) => ({ select: () => ({ limit: async () => { assert.equal(table, "food_servings"); return { data: [], error: null }; } }) }), auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) }, rpc: async (name: string, args: unknown) => { assert.equal(name, "axvital_consume_api_budget"); assert.equal(JSON.stringify(args), '{"route_key":"http/nutrition/resolve:POST"}'); return { data: budget }; } } };
  runInNewContext(code, context);
  return { context, run: (body: unknown = { label: "Bread", context: "Bread" }, origin = "https://example.test") => mod.exports.POST(new Request("https://example.test/api/nutrition/resolve", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) })) };
}
test("food resolver authenticates, validates bounds/origin and consumes a shared budget without writes", async () => {
  assert.equal((await fixture(null).run()).status, 401); assert.equal((await fixture("owner", false).run()).status, 429);
  const f = fixture(); assert.equal((await f.run(undefined, "https://attacker.test")).status, 403);
  for (const body of [{ label: "", context: "" }, { label: "x".repeat(161), context: "" }, { label: "Bread", context: "x".repeat(2001) }, { label: "Bread", context: "Bread", user_id: "other" }, null]) assert.equal((await f.run(body)).status, 400);
  assert.equal(f.context.catalogReads, 0);
  const response = await f.run(); assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await response.json()).food.method, "exact"); assert.equal(f.context.inferenceCalls, 0);
  const unknown = await f.run({ label: "Family stew", context: "Family stew" }); assert.equal((await unknown.json()).food.method, "provisional"); assert.equal(f.context.inferenceCalls, 1);
});
