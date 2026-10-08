import test from "node:test";
import assert from "node:assert/strict";
import { database } from "../security/test-database.ts";
import { GENERATOR_VERSION, SCORING_VERSION, type Completion } from "./model.ts";
import { saveSession } from "./persistence.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
const A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const id = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const session: Completion = { id, config: { mode: "time", value: 2, operation: "+", difficulty: "standard" }, startedAt: "2026-10-01T12:00:00.000Z", elapsedMs: 120000, scoringVersion: SCORING_VERSION, generatorVersion: GENERATOR_VERSION, answers: [{ a: 1, b: 2, operator: "+", answer: 3, atMs: 1000 }, { a: 2, b: 2, operator: "+", answer: 0, atMs: 2000 }] };

test("migrations execute; atomic save recomputes metrics, retries safely, enforces ownership, exports and cascades deletion", async () => {
  const db = await database();
  const as = async (user: string, role = "authenticated") => db.exec(`reset role;select set_config('request.jwt.claim.sub','${user}',false);set role ${role};`);
  const save = (input: unknown) => db.query<{ id: string }>("select public.save_cognitive_session_v1($1::jsonb) as id", [JSON.stringify(input)]);
  try {
    await as("", "anon"); await assert.rejects(save(session), /permission denied/);
    await as(""); await assert.rejects(save(session), /AUTH_REQUIRED/);
    await as(A);
    assert.equal((await save(session)).rows[0].id, id);
    await save(session);
    const row = (await db.query<{ answered: number; correct: number; accuracy: string; qpm: string; score: string }>("select * from public.cognitive_sessions")).rows[0];
    assert.equal(row.answered, 2); assert.equal(row.correct, 1); assert.equal(Number(row.accuracy), 50); assert.equal(Number(row.qpm), 1); assert.equal(Number(row.score), 50);
    assert.equal((await db.query("select * from public.cognitive_sessions")).rows.length, 1);
    await assert.rejects(save({ ...session, score: 99999 }), /INVALID_SESSION/);
    await assert.rejects(save({ ...session, answers: [] }), /SESSION_CONFLICT/);
    await assert.rejects(db.query("update public.cognitive_sessions set score=999"), /permission denied/);
    await assert.rejects(db.query("delete from public.cognitive_sessions"), /permission denied/);
    await assert.rejects(db.query("insert into public.cognitive_sessions select * from public.cognitive_sessions"), /permission denied/);
    const exported = (await db.query<{ data: { data: Record<string, unknown[]> } }>("select public.axvital_export_account() as data")).rows[0].data;
    // Actual export envelope is asserted below without depending on unrelated account fields.
    assert.match(JSON.stringify(exported), /cognitive_sessions/);
    assert.match(JSON.stringify(exported), new RegExp(id));
    await as(B);
    assert.equal((await db.query("select * from public.cognitive_sessions")).rows.length, 0);
    await assert.rejects(save(session), /SESSION_CONFLICT/);
    await save({ ...session, id: B });
    assert.equal((await db.query("select * from public.cognitive_sessions")).rows.length, 1);
    assert.doesNotMatch(JSON.stringify((await db.query("select public.axvital_export_account() as data")).rows), new RegExp(id));
    await as(A);
    // Simulate an acknowledged network failure AFTER the database committed.
    let loseResponse = true;
    const retrySession = { ...session, id: "dddddddd-dddd-4ddd-dddd-dddddddddddd" };
    const client = { rpc: (_name: string, params: { p_session: Completion }) => ({ abortSignal: async () => {
      const saved = await save(params.p_session);
      if (loseResponse) { loseResponse = false; return { data: null, error: { message: "Connection lost after commit" } }; }
      return { data: saved.rows[0].id, error: null };
    } }) } as unknown as SupabaseClient;
    await assert.rejects(saveSession(client, retrySession), /Retry saving/);
    await saveSession(client, retrySession);
    assert.equal((await db.query("select * from public.cognitive_sessions")).rows.length, 2);
    assert.equal((await db.query("select * from public.axvital_account_schema_issues(false)")).rows.length, 0);
    // Existing account deletion preparation still applies; test the actual auth cascade.
    await db.exec("reset role");
    await db.query("insert into public.account_deletions(user_id,billing_closed) values($1,true)", [A]);
    await db.query("delete from auth.users where id=$1", [A]);
    assert.equal((await db.query("select * from public.cognitive_sessions where user_id=$1", [A])).rows.length, 0);
    assert.equal((await db.query("select * from public.cognitive_sessions where user_id=$1", [B])).rows.length, 1);
  } finally { await db.close(); }
});

test("database rejects malformed inputs and incomplete tests without leaving partial sessions", async () => {
  const db = await database();
  try {
    await db.exec(`select set_config('request.jwt.claim.sub','${A}',false);set role authenticated;`);
    const cases = [
      { ...session, config: { ...session.config, value: 3 } },
      { ...session, config: { ...session.config, difficulty: "other" } },
      { ...session, elapsedMs: 1 }, { ...session, scoringVersion: "other" },
      { ...session, answers: [{ ...session.answers[0], b: 100 }] },
      { ...session, answers: [{ ...session.answers[0], operator: "/", b: 0 }] },
      { ...session, config: { ...session.config, operation: "/" }, answers: [{ a: 3, b: 2, operator: "/", answer: 1, atMs: 1000 }] },
      { ...session, answers: [{ ...session.answers[0], atMs: 120000 }] },
      { ...session, answers: [{ ...session.answers[0], answer: null }] },
      { ...session, config: { ...session.config, mode: "count", value: 20 } },
      { ...session, startedAt: "Infinity" },
      { ...session, answers: [...session.answers].reverse() },
      { ...session, config: { ...session.config, extra: "health" } },
    ];
    for (const input of cases) await assert.rejects(db.query("select public.save_cognitive_session_v1($1::jsonb)", [JSON.stringify(input)]));
    assert.equal((await db.query("select * from public.cognitive_sessions")).rows.length, 0);
    const count = { ...session, config: { ...session.config, mode: "count", value: 20 }, elapsedMs: 20000, answers: Array.from({ length: 20 }, (_, i) => ({ ...session.answers[0], atMs: (i + 1) * 1000 })) };
    await db.query("select public.save_cognitive_session_v1($1::jsonb)", [JSON.stringify(count)]);
    assert.equal((await db.query<{ correct: number }>("select correct from public.cognitive_sessions")).rows[0].correct, 20);
  } finally { await db.close(); }
});
