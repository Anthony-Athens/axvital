import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { voiceParseApi, readVoiceUpload } from "./api.ts";
import { VoiceError, MAX_AUDIO_BYTES } from "./schema.ts";
import { database } from "../security/test-database.ts";

function request(patch: Record<string, string | Blob | undefined> = {}, origin = "https://example.test") {
  const form = new FormData();
  const fields = { audio: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 1])], { type: "audio/webm" }), timeZone: "America/New_York", recordedAt: new Date().toISOString(), duration: "4", ...patch };
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) form.set(key, value);
  return new Request("https://example.test/api/voice-log/parse", { method: "POST", headers: { origin }, body: form });
}
test("voice route authenticates, enforces rate/origin/type/bounds and never writes health data", async () => {
  let calls = 0;
  const provider = async () => { calls++; return { candidates: [] }; };
  for (const [user, budget, status] of [[null, true, 401], ["owner", false, 429], ["owner", true, 200]] as const) {
    const client = { auth: { getUser: async () => ({ data: { user: user ? { id: user } : null }, error: null }) }, rpc: async (name: string, args: unknown) => { assert.equal(name, "axvital_consume_api_budget"); assert.deepEqual(args, { route_key: "voice-log/parse:POST" }); return { data: budget, error: null }; } } as unknown as SupabaseClient;
    const api = voiceParseApi(async () => client, provider);
    const response = await api(request());
    assert.equal(response.status, status); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    if (user) assert.equal((await api(request({}, "https://attacker.test"))).status, 403);
  }
  assert.equal(calls, 1);
  for (const patch of [{ duration: "90" }, { duration: "NaN" }, { timeZone: "nonsense" }, { recordedAt: "2020-01-01" }, { unexpected: "secret" }, { audio: new Blob([], { type: "audio/webm" }) }, { audio: new Blob(["fake"], { type: "audio/webm" }) }, { audio: new Blob(["fake"], { type: "text/plain" }) }]) await assert.rejects(readVoiceUpload(request(patch)));
  await assert.rejects(readVoiceUpload(new Request("https://example.test", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=test" }, body: new Uint8Array(MAX_AUDIO_BYTES + 9000) })), /BODY_TOO_LARGE/);
});
test("voice failures expose only fixed codes and preserve no provider data", async () => {
  const client = { auth: { getUser: async () => ({ data: { user: { id: "owner" } }, error: null }) }, rpc: async () => ({ data: true, error: null }) } as unknown as SupabaseClient;
  for (const code of ["NO_SPEECH", "NO_EVENTS", "INVALID_AI_RESPONSE", "TRANSCRIPTION_FAILED", "EXTRACTION_FAILED"]) {
    const response = await voiceParseApi(async () => client, async () => { throw new VoiceError(code); })(request());
    assert.equal(response.status, 422); assert.deepEqual(await response.json(), { error: code });
  }
});
test("database voice budget permits three requests and preserves existing budget routes", async () => {
  const db = await database();
  try {
    await db.exec("set role authenticated; select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',false)");
    for (let i = 0; i < 4; i++) assert.equal((await db.query<{ allowed: boolean }>("select public.axvital_consume_api_budget('voice-log/parse:POST') allowed")).rows[0].allowed, i < 3);
    assert.equal((await db.query<{ allowed: boolean }>("select public.axvital_consume_api_budget('timeline:GET') allowed")).rows[0].allowed, true);
    await assert.rejects(db.exec("select * from public.api_request_budgets"), /permission denied/);
  } finally { await db.close(); }
});
