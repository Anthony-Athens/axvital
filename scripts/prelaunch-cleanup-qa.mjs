// Cleans only AXVital synthetic users tagged by the pre-launch QA scripts.
import { createClient } from "@supabase/supabase-js";

const truthy = ["AXVITAL_PRELAUNCH_TESTING", "AXVITAL_SYNTHETIC_USERS_ONLY", "AXVITAL_NO_REAL_USER_DATA_CONFIRMED"];
if (process.env.AXVITAL_ENVIRONMENT !== "production" || truthy.some((name) => process.env[name] !== "true")) throw new Error("PREFLIGHT_NOT_AUTHORIZED");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) throw new Error("PREFLIGHT_MISSING");
const expectedValue = process.env.AXVITAL_EXPECTED_SUPABASE_PROJECT_REF ?? "";
let expectedRef = expectedValue;
try { expectedRef = new URL(expectedValue).hostname.replace(/\.supabase\.co$/, ""); } catch {}
if (new URL(url).hostname.replace(/\.supabase\.co$/, "") !== expectedRef) throw new Error("PREFLIGHT_SUPABASE_MISMATCH");

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const qaUsers = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  qaUsers.push(...data.users.filter((user) => user.email?.startsWith("apathens13+axvital-") && typeof user.user_metadata?.qa_reference === "string"));
  if (data.users.length < 1000) break;
}
const results = [];
for (const user of qaUsers) {
  const begin = await admin.rpc("axvital_begin_account_deletion", { target_user: user.id });
  if (begin.error && !String(begin.error.message).includes("ACCOUNT_DELETION_PENDING")) {
    results.push({ prepared: false, deleted: false, code: begin.error.code });
    continue;
  }
  const closed = await admin.from("account_deletions").update({ billing_closed: true }).eq("user_id", user.id).select("user_id").single();
  if (closed.error) { results.push({ prepared: true, deleted: false, code: closed.error.code }); continue; }
  const deletion = await admin.auth.admin.deleteUser(user.id, false);
  results.push({ prepared: true, deleted: !deletion.error, code: deletion.error?.status ?? null });
}
console.log(JSON.stringify({ matchedSyntheticUsers: qaUsers.length, results }, null, 2));
