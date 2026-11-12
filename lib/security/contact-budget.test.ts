import test from "node:test";
import assert from "node:assert/strict";
import { database } from "./test-database.ts";

test("contact budget limits each sender and the global inbox, and only the server can call it", async t => {
  const db = await database();
  t.after(() => db.close());
  const consume = async (bucket: string) => (await db.query<{ ok: boolean }>("select public.axvital_consume_contact_budget($1) ok", [bucket])).rows[0].ok;

  for (const role of ["anon", "authenticated"]) {
    await db.exec(`reset role; set role ${role};`);
    await assert.rejects(consume("ip:a"), /permission denied/);
    await assert.rejects(db.query("select * from public.contact_rate_limits"), /permission denied/);
  }

  await db.exec("reset role; set role service_role;");
  await assert.rejects(consume("global"), /INVALID_BUCKET/);
  assert.deepEqual([await consume("ip:a"), await consume("ip:a"), await consume("ip:a"), await consume("ip:a")], [true, true, true, false]);
  assert.equal(await consume("ip:b"), true, "other senders keep their own budget");

  // An expired sender window resets.
  await db.exec("reset role; update public.contact_rate_limits set window_start = now() - interval '11 minutes' where bucket = 'ip:a'; set role service_role;");
  assert.equal(await consume("ip:a"), true);

  // Rotating senders still hit the global hourly cap of 30. Five accepted so far;
  // the rejected per-sender attempt never reaches the global counter.
  const results: boolean[] = [];
  for (let i = 0; i < 27; i++) results.push(await consume(`ip:rotating-${i}`));
  assert.equal(results.slice(0, 25).every(Boolean), true);
  assert.deepEqual(results.slice(25), [false, false]);
});
