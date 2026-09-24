import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestHealthEvent, ingestHealthEvents, HealthEventIngestionError, type HealthEventInput } from "./ingestion.ts";

const event: HealthEventInput = { user_id: "owner", event_date: "2026-09-23", event_time: "23:59:01.123", event_type: "supplement", title: "Creatine", dose_amount: 5, dose_unit: "g", dose: "5 g", tags: ["After workout", "custom TAG"], notes: " unchanged " };
function fixture(mode = "ok", owner: string | null = "owner") {
  const writes: HealthEventInput[][] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: owner ? { id: owner } : null }, error: null }) },
    from: (table: string) => {
      assert.equal(table, "health_events");
      return { insert: async (rows: HealthEventInput[]) => {
        writes.push(rows);
        if (mode === "throw") throw Error("private transport detail");
        return { error: mode === "error" ? { message: "private SQL detail" } : null };
      } };
    },
  } as unknown as SupabaseClient;
  return { client, writes };
}
test("single manual ingestion preserves every payload field, timestamps and tags without mutation", async () => {
  const f = fixture(), before = structuredClone(event);
  await ingestHealthEvent(f.client, event);
  assert.deepEqual(f.writes, [[{ ...event, input_method: "manual" }]]);
  assert.deepEqual(event, before);
});
test("multi-event ingestion supports every channel in one insert", async () => {
  const f = fixture();
  const rows = (["manual", "voice", "integration", "import", "system"] as const).map(input_method => ({ ...event, input_method }));
  await ingestHealthEvents(f.client, rows);
  assert.deepEqual(f.writes, [rows]);
});
test("invalid batches write nothing, including when a later event is invalid", async () => {
  for (const invalid of [null, { ...event, event_type: "unknown" }, { ...event, event_date: "2026-02-30" }, { ...event, event_time: "24:00" }, { ...event, input_method: null }, { ...event, input_method: "garmin" }, { ...event, tags: [1] }, { ...event, severity: NaN }, { ...event, distance: Infinity }, { ...event, notes: 3 }, { ...event, id: "injected" }]) {
    const f = fixture();
    await assert.rejects(ingestHealthEvents(f.client, [event, invalid as unknown as HealthEventInput]), { code: "INVALID_EVENT" });
    assert.equal(f.writes.length, 0);
  }
  await assert.rejects(ingestHealthEvents(fixture().client, []), { code: "INVALID_EVENT" });
});
test("anonymous and mixed-owner batches fail before persistence", async () => {
  for (const owner of [null, "different-owner"]) {
    const f = fixture("ok", owner);
    await assert.rejects(ingestHealthEvent(f.client, event), { code: "AUTH_REQUIRED" });
    assert.equal(f.writes.length, 0);
  }
  const f = fixture();
  await assert.rejects(ingestHealthEvents(f.client, [event, { ...event, user_id: "other" }]), { code: "AUTH_REQUIRED" });
  assert.equal(f.writes.length, 0);
});
test("returned and thrown persistence failures are standardized and never retried", async () => {
  for (const mode of ["error", "throw"]) {
    const f = fixture(mode);
    await assert.rejects(ingestHealthEvents(f.client, [event, event]), error => error instanceof HealthEventIngestionError && error.code === "PERSISTENCE_FAILED" && !error.message.includes("private"));
    assert.equal(f.writes.length, 1);
  }
});
test("optional null payloads and all supported event types remain accepted", async () => {
  const f = fixture();
  for (const event_type of ["food", "fluid", "supplement", "exercise", "symptom", "medication", "note"] as const) {
    await ingestHealthEvent(f.client, { ...event, event_type, title: null, tags: null, dose_amount: null });
  }
  assert.equal(f.writes.length, 7);
});
