// Destructive only to synthetic users created by this run. Requires explicit pre-launch authorization.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const truthy = ["AXVITAL_PRELAUNCH_TESTING", "AXVITAL_SYNTHETIC_USERS_ONLY", "AXVITAL_NO_REAL_USER_DATA_CONFIRMED"];
if (process.env.AXVITAL_ENVIRONMENT !== "production" || truthy.some((name) => process.env[name] !== "true")) throw new Error("PREFLIGHT_NOT_AUTHORIZED");
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) throw new Error("PREFLIGHT_STRIPE_NOT_TEST");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) throw new Error("PREFLIGHT_MISSING");
const expectedValue = process.env.AXVITAL_EXPECTED_SUPABASE_PROJECT_REF ?? "";
let expectedRef = expectedValue;
try { expectedRef = new URL(expectedValue).hostname.replace(/\.supabase\.co$/, ""); } catch {}
if (new URL(url).hostname.replace(/\.supabase\.co$/, "") !== expectedRef) throw new Error("PREFLIGHT_SUPABASE_MISMATCH");

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const password = `Axvital-QA-${randomBytes(18).toString("base64url")}!`;
const email = (label) => `apathens13+axvital-${label}-${stamp}@gmail.com`;
const created = [];
const report = { syntheticUsersCreated: 0, domains: [], forgedOwnerInsertDenied: false, ownedParentInsertDenied: false, oldSessionDenied: false, cleanupComplete: false };

const createUser = async (label) => {
  const { data, error } = await admin.auth.admin.createUser({ email: email(label), password, email_confirm: true, user_metadata: { full_name: `AXVital Synthetic ${label}`, preferred_name: "Synthetic", primary_goal: "general_wellness", qa_reference: stamp } });
  if (error || !data.user) throw new Error(`CREATE_USER_${label}_${error?.status ?? "FAILED"}`);
  created.push(data.user.id);
  return data.user.id;
};

const clientFor = async (label) => {
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: email(label), password });
  if (error) throw new Error(`LOGIN_${label}_${error.status ?? "FAILED"}`);
  return client;
};
const deleteSyntheticUser = async (id) => {
  const begin = await admin.rpc("axvital_begin_account_deletion", { target_user: id });
  if (begin.error && !String(begin.error.message).includes("ACCOUNT_DELETION_PENDING")) throw new Error(`PREPARE_CLEANUP_${begin.error.code ?? "FAILED"}`);
  const closed = await admin.from("account_deletions").update({ billing_closed: true }).eq("user_id", id).select("user_id").single();
  if (closed.error) throw new Error(`MARK_CLEANUP_${closed.error.code ?? "FAILED"}`);
  const { error } = await admin.auth.admin.deleteUser(id, false);
  if (error) throw new Error(`CLEANUP_${error.status ?? "FAILED"}`);
};

try {
  const a = await createUser("owner");
  const b = await createUser("other");
  report.syntheticUsersCreated = 2;
  const clientA = await clientFor("owner");
  const clientB = await clientFor("other");
  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  const testIsolation = async (table, id) => {
    const own = await clientA.from(table).select("id").eq("id", id);
    const foreignRead = await clientB.from(table).select("id").eq("id", id);
    const foreignUpdate = await clientB.from(table).update(table === "profiles" ? { preferred_name: "Synthetic other" } : { user_id: b }).eq("id", id).select("id");
    const foreignDelete = await clientB.from(table).delete().eq("id", id).select("id");
    return {
      table,
      ownerRead: !own.error && own.data.length === 1,
      foreignReadDenied: !foreignRead.error && foreignRead.data.length === 0,
      foreignUpdateDenied: !foreignUpdate.error && foreignUpdate.data.length === 0,
      foreignDeleteDenied: !foreignDelete.error && foreignDelete.data.length === 0,
    };
  };
  report.domains.push(await testIsolation("profiles", a));
  const fixtures = [
    ["daily_checkins", { user_id: a, checkin_date: date, energy_score: 5, notes: `Synthetic QA ${stamp}` }],
    ["health_events", { user_id: a, event_date: date, event_time: "12:00", event_type: "note", title: `Synthetic QA event ${stamp}` }],
    ["nutrition_entries", { user_id: a, entry_type: "food", consumed_at: now, source_type: "manual", title: `Synthetic QA nutrition ${stamp}` }],
    ["exercises", { user_id: a, name: `Synthetic QA exercise ${stamp}`, category: "custom", default_tracking_type: "repetitions" }],
    ["planned_activities", { user_id: a, title: `Synthetic QA habit ${stamp}`, activity_type: "habit", recurrence_type: "none", start_date: date }],
    ["user_protocols", { user_id: a, name: `Synthetic QA protocol ${stamp}`, category: "custom", start_date: date }],
    ["user_conditions", { user_id: a, custom_condition_name: `Synthetic QA condition ${stamp}` }],
    ["user_symptoms", { user_id: a, custom_symptom_name: `Synthetic QA symptom ${stamp}`, source: "custom" }],
    ["experiments", { user_id: a, name: `Synthetic QA experiment ${stamp}`, hypothesis: "Synthetic QA tracking may produce a test observation." }],
    ["user_insights", { user_id: a, insight_type: "sleep_energy", title: `Synthetic QA insight ${stamp}`, description: "Synthetic QA observation only.", confidence_level: "Early Signal", sample_size: 1 }],
    ["weekly_recaps", { user_id: a, week_start: date, week_end: date, title: "Synthetic QA week", summary: "Synthetic QA summary only." }],
    ["workout_templates", { user_id: a, name: `Synthetic QA workout ${stamp}` }],
  ];
  let conditionId = null;
  for (const [table, payload] of fixtures) {
    const { data, error } = await admin.from(table).insert(payload).select("id").single();
    if (error) { report.domains.push({ table, fixture: "failed", code: error.code }); continue; }
    if (table === "user_conditions") conditionId = data.id;
    report.domains.push(await testIsolation(table, data.id));
  }
  const forged = await clientB.from("daily_checkins").insert({ user_id: a, checkin_date: "2099-01-01", notes: `Synthetic forged QA ${stamp}` });
  report.forgedOwnerInsertDenied = Boolean(forged.error);
  if (conditionId) {
    const parent = await clientB.from("condition_episodes").insert({ user_id: b, user_condition_id: conditionId, started_at: now, title: `Synthetic QA episode ${stamp}` });
    report.ownedParentInsertDenied = Boolean(parent.error);
  }
  for (const id of created) {
    await deleteSyntheticUser(id);
  }
  const old = await clientA.from("daily_checkins").select("id").limit(1);
  const oldAuth = await clientA.auth.getUser();
  report.oldSessionDenied = Boolean(old.error || oldAuth.error || !oldAuth.data.user);
  const remaining = await admin.from("profiles").select("id").in("id", created);
  report.cleanupComplete = !remaining.error && remaining.data.length === 0;
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  for (const id of created) await deleteSyntheticUser(id).catch(() => {});
  throw error;
}
