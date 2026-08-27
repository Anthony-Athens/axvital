import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { INVALID_RECOVERY, PASSWORD_HELP, RESET_SENT, passwordError, passwordUpdateMessage, resetRedirectUrl, resetRequestMessage, submissionGuard, requestPasswordReset, updatePassword } from "./passwords.ts";
import { recoveryTracker } from "./recovery.ts";
import { createClient } from "@supabase/supabase-js";

test("password bounds and confirmation share signup policy without complexity requirements", () => {
  assert.equal(passwordError("a".repeat(7)), PASSWORD_HELP);
  assert.equal(passwordError("a".repeat(8)), "");
  assert.equal(passwordError("a".repeat(72)), "");
  assert.equal(passwordError("a".repeat(73)), PASSWORD_HELP);
  assert.equal(passwordError("eight chars", "different"), "Passwords do not match.");
  assert.equal(passwordError("eight chars", "eight chars"), "");
});
test("trusted configuration produces exact production and local redirects", () => {
  assert.equal(resetRedirectUrl("https://www.axvital.com"), "https://www.axvital.com/reset-password");
  assert.equal(resetRedirectUrl("https://www.axvital.com/"), "https://www.axvital.com/reset-password");
  assert.equal(resetRedirectUrl("http://localhost:3000"), "http://localhost:3000/reset-password");
  for (const value of [undefined, "javascript:alert(1)", "http://evil.test", "https://user:secret@example.com", "https://example.com/?next=evil", "https://example.com/path"]) {
    assert.throws(() => resetRedirectUrl(value));
  }
});
test("reset response does not disclose account existence", () => {
  for (const error of [null, { code: "user_not_found" }, { code: "email_not_confirmed" }, { code: "user_banned" }]) {
    assert.equal(resetRequestMessage(error), RESET_SENT);
  }
  assert.equal(resetRequestMessage({ code: "smtp_secret_details" }), "We couldn't send a reset email right now. Please try again.");
});
test("rate limits and reauthentication have safe actionable messages", () => {
  assert.match(resetRequestMessage({ status: 429 }), /Please wait/);
  assert.match(resetRequestMessage({ code: "over_email_send_rate_limit" }), /Please wait/);
  assert.match(passwordUpdateMessage({ code: "reauthentication_needed" }), /sign in again/);
  assert.match(passwordUpdateMessage({ code: "same_password" }), /different/);
  assert.match(passwordUpdateMessage({ code: "weak_password" }), /stronger/);
  assert.equal(passwordUpdateMessage({ code: "private_server_detail" }), "We couldn't update your password. Please try again.");
});
test("rapid duplicate submissions are suppressed and guard releases afterward", async () => {
  const submit = submissionGuard();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const first = submit(async () => { calls++; await pending; });
  await submit(async () => { calls++; });
  assert.equal(calls, 1);
  release(); await first;
  await assert.rejects(submit(async () => { throw new Error("network"); }));
  await submit(async () => { calls++; });
  assert.equal(calls, 2);
});
test("ordinary session or manual navigation never grants recovery access", () => {
  const tracker = recoveryTracker();
  tracker.event("INITIAL_SESSION", "one", 100);
  tracker.event("SIGNED_IN", "one", 100);
  assert.equal(tracker.valid("one", 101), false);
  assert.equal(tracker.valid(undefined, 101), false);
});
test("recovery event is user-bound, short-lived, and survives refresh events", () => {
  const tracker = recoveryTracker();
  tracker.event("PASSWORD_RECOVERY", "one", 100);
  assert.equal(tracker.valid("one", 101), true);
  assert.equal(tracker.valid("two", 101), false);
  tracker.event("INITIAL_SESSION", "one", 102);
  tracker.event("SIGNED_IN", "one", 103); // SDK emits on refocus too.
  tracker.event("TOKEN_REFRESHED", "one", 104);
  assert.equal(tracker.valid("one", 105), true);
  assert.equal(tracker.valid("one", 900100), false);
});
test("logout, user switch, completion, and reload invalidate recovery", () => {
  for (const event of ["SIGNED_OUT", "SIGNED_IN"]) {
    const tracker = recoveryTracker();
    tracker.event("PASSWORD_RECOVERY", "one", 100);
    tracker.event(event, event === "SIGNED_IN" ? "two" : undefined, 101);
    assert.equal(tracker.valid("one", 102), false);
  }
  const tracker = recoveryTracker();
  tracker.event("PASSWORD_RECOVERY", "one");
  tracker.clear();
  assert.equal(tracker.valid("one"), false);
  assert.equal(recoveryTracker().valid("one"), false);
});

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
test("auth integration uses existing clients, password policy, and protected settings", () => {
  assert.match(source("app/login/page.tsx"), /href="\/forgot-password"/);
  assert.match(source("app/signup/page.tsx"), /passwordError\(password\)/);
  assert.match(source("app/forgot-password/page.tsx"), /requestPasswordReset\(createClient\(\).auth, email, process.env.NEXT_PUBLIC_APP_URL\)/);
  assert.match(source("components/auth/PasswordForm.tsx"), /updatePassword\(supabase.auth/);
  assert.match(source("components/auth/PasswordForm.tsx"), /if \(recoveryMode\) await finishRecovery\(\)/);
  assert.match(source("app/settings/security/page.tsx"), /if \(error \|\| !data.user\) redirect\("\/login"\)/);
  assert.match(source("lib/supabase/routes.ts"), /"\/settings"/);
  assert.match(source("app/profile/page.tsx"), /href="\/settings\/security"/);
});

test("reset request calls Supabase with trimmed email and configured redirect", async () => {
  const calls: unknown[] = [];
  const auth = { async resetPasswordForEmail(email: string, options: { redirectTo: string }) { calls.push({ email, ...options }); return { error: null }; } };
  assert.equal(await requestPasswordReset(auth, " test@example.test ", "https://www.axvital.com"), RESET_SENT);
  assert.deepEqual(calls, [{ email: "test@example.test", redirectTo: "https://www.axvital.com/reset-password" }]);
});
test("reset network failures and missing configuration fail safely", async () => {
  let calls = 0;
  const auth = { async resetPasswordForEmail() { calls++; throw new Error("private diagnostics"); } };
  assert.match(await requestPasswordReset(auth, "test@example.test", undefined), /couldn't send/);
  assert.equal(calls, 0);
  assert.match(await requestPasswordReset(auth, "test@example.test", "http://localhost:3000"), /couldn't send/);
  assert.equal(calls, 1);
});
test("valid account and recovery updates call authoritative auth without changing session", async () => {
  const updates: unknown[] = [];
  const auth = {
    async getUser() { return { data: { user: { id: "verified-user" } }, error: null }; },
    async updateUser(attributes: { password: string }) { updates.push(attributes); return { error: null }; },
  };
  assert.equal(await updatePassword(auth, "test-password", "test-password"), "");
  assert.equal(await updatePassword(auth, "test-password", "test-password", id => id === "verified-user"), "");
  assert.deepEqual(updates, [{ password: "test-password" }, { password: "test-password" }]);
});
test("invalid recovery, missing user, mismatch and weak input never update", async () => {
  let updates = 0;
  const auth = {
    async getUser() { return { data: { user: { id: "user" } }, error: null }; },
    async updateUser() { updates++; return { error: null }; },
  };
  assert.equal(await updatePassword(auth, "test-password", "test-password", () => false), INVALID_RECOVERY);
  assert.equal(await updatePassword(auth, "test-password", "mismatch"), "Passwords do not match.");
  assert.equal(await updatePassword(auth, "short", "short"), PASSWORD_HELP);
  assert.match(await updatePassword({ ...auth, async getUser() { return { data: { user: null }, error: null }; } }, "test-password", "test-password"), /sign in again/);
  assert.equal(updates, 0);
});

test("installed Supabase PKCE recovery emits recovery event, updates password and signs out", async () => {
  const requests: { url: string; method: string; body: Record<string, unknown> }[] = [];
  const storage = new Map<string, string>();
  const user = { id: "test-user", aud: "authenticated", role: "authenticated", email: "test@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const token = ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"), "test"].join(".");
  const client = createClient("https://auth.example.test", "test-anon-key", {
    auth: { flowType: "pkce", autoRefreshToken: false, detectSessionInUrl: false, storage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value); },
      removeItem: key => { storage.delete(key); },
    } },
    global: { fetch: async (input, init) => {
      const url = String(input);
      requests.push({ url, method: init?.method ?? "GET", body: JSON.parse(String(init?.body ?? "{}")) });
      const response = url.includes("/token") ? { access_token: token, refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user } : url.includes("/user") ? { user } : {};
      return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
    } },
  });
  const tracker = recoveryTracker();
  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => tracker.event(event, session?.user.id));
  try {
    assert.equal(await requestPasswordReset(client.auth, user.email, "http://localhost:3000"), RESET_SENT);
    assert.ok(requests[0].url.includes("redirect_to=http%3A%2F%2Flocalhost%3A3000%2Freset-password"));
    assert.equal(requests[0].body.code_challenge_method, "s256");
    const exchanged = await client.auth.exchangeCodeForSession("test-recovery-code");
    assert.equal(exchanged.error, null);
    assert.equal(tracker.valid(user.id), true);
    assert.equal(await updatePassword(client.auth, "test-password", "test-password", id => tracker.valid(id)), "");
    assert.equal(requests.find(request => request.method === "PUT")?.body.password, "test-password");
    assert.equal((await client.auth.signOut()).error, null);
    assert.equal(tracker.valid(user.id), false);
    assert.equal((await client.auth.getSession()).data.session, null);
  } finally { subscription.unsubscribe(); }
});
test("sensitive auth forms do not log, track, or persist passwords", () => {
  for (const path of ["app/forgot-password/page.tsx", "app/reset-password/page.tsx", "components/auth/PasswordForm.tsx", "lib/auth/recovery.ts"]) {
    assert.doesNotMatch(source(path), /console\.|logDevError|localStorage|sessionStorage|RESEND_API_KEY|trackEvent|\/api\/events|service_role/);
  }
  assert.match(source("app/reset-password/layout.tsx"), /referrer: "no-referrer"/);
});
