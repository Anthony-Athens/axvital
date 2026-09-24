import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";

const code = (await build({ entryPoints: ["lib/voice/provider.ts"], bundle: true, write: false, platform: "node", format: "cjs", plugins: [{ name: "server-marker", setup(b) {
  b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "mock" }));
  b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: "export {};" }));
} }] })).outputFiles[0].text;
const event = { event_type: "supplement", title: "magnesium", source_fragment: "I took magnesium.", amount: null, dose_amount: null, dose_unit: null, duration_minutes: null, distance: null, distance_unit: null, intensity: null, severity: null, notes: null, time_expression: null };
function fixture(options: { missingKey?: boolean; transcribe?: unknown; extract?: unknown; fail?: number } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fixtureModule = { exports: {} as { processVoice: (file: File, context: unknown) => Promise<{ candidates: { event: { dose_amount: number | null } }[] }> } };
  runInNewContext(code, { module: fixtureModule, exports: fixtureModule.exports, FormData, File, AbortSignal, Date, Intl, console: { error: () => { throw Error("Must not log provider data"); } }, process: { env: { OPENAI_API_KEY: options.missingKey ? "" : "server-secret" } }, fetch: async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (calls.length === options.fail) return new Response("sensitive failure", { status: 500 });
    return Response.json(calls.length === 1 ? options.transcribe ?? { text: "I took magnesium.", duration: 4 } : options.extract ?? { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ events: [event] }) }] }] });
  } });
  return { calls, run: () => fixtureModule.exports.processVoice(new File(["audio"], "input.webm", { type: "audio/webm" }), { now: new Date("2026-09-24T17:00:00Z"), timeZone: "America/New_York", signal: new AbortController().signal }) };
}
test("provider uses server-only auth, verified duration, strict output and store:false; returns no transcript", async () => {
  const f = fixture(), result = await f.run();
  assert.equal(f.calls.length, 2);
  const form = f.calls[0].init.body as FormData;
  assert.equal(form.get("model"), "whisper-1"); assert.equal(form.get("response_format"), "verbose_json");
  const body = JSON.parse(String(f.calls[1].init.body));
  assert.equal(body.model, "gpt-4.1-mini"); assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true); assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.tools, undefined); assert.match(body.instructions, /Never infer common doses/);
  assert.equal(result.candidates[0].event.dose_amount, null);
  assert.equal("transcript" in result, false); assert.doesNotMatch(JSON.stringify(result), /server-secret/);
});
test("missing config, silence, excessive decoded duration and provider failure fail safely", async () => {
  for (const [options, expected, calls] of [
    [{ missingKey: true }, "VOICE_UNAVAILABLE", 0],
    [{ transcribe: { text: "", duration: 3 } }, "NO_SPEECH", 1],
    [{ transcribe: { text: "hallucinated subtitle", duration: 3, segments: [{ no_speech_prob: 0.99 }] } }, "NO_SPEECH", 1],
    [{ transcribe: { text: "I took magnesium.", duration: 80 } }, "RECORDING_TOO_LONG", 1],
    [{ fail: 1 }, "TRANSCRIPTION_FAILED", 1], [{ fail: 2 }, "EXTRACTION_FAILED", 2],
    [{ extract: { status: "incomplete" } }, "INVALID_AI_RESPONSE", 2],
    [{ extract: { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] } }, "INVALID_AI_RESPONSE", 2],
  ] as const) {
    const f = fixture(options); await assert.rejects(f.run(), new RegExp(expected)); assert.equal(f.calls.length, calls);
  }
});
