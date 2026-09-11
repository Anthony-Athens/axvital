import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { analyticsPayload, analyticsUrl, type AnalyticsEvent, type BillingInterval } from "./policy.ts";
import { notificationsEnabled } from "../notifications/owner.ts";
import { database } from "../security/test-database.ts";

async function fixture(file: string, values: Record<string, unknown> = {}, extra: Record<string, string> = {}) {
  const pending: (() => Promise<unknown>)[] = [], tracked: unknown[][] = [], deliveries: string[] = [], logs: unknown[][] = [];
  const mocks: Record<string, string> = {
    "server-only": "export {};",
    "next/server": "export const after = fn => pending.push(fn);",
    "@vercel/analytics/server": "export const track = async (...args) => tracked.push(args);",
    "@/lib/supabase/admin": "export const createAdminClient = () => admin;",
    ...extra,
  };
  const code = (await build({ entryPoints: [file], bundle: true, write: false, platform: "node", format: "cjs", plugins: [{ name: "mocks", setup(b) {
    b.onResolve({ filter: /.*/ }, args => mocks[args.path] ? { path: args.path, namespace: "mock" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path] }));
  } }] })).outputFiles[0].text;
  const testModule = { exports: {} as Record<string, (...args: never[]) => Promise<unknown>> };
  runInNewContext(code, { module: testModule, exports: testModule.exports, require: (name: string) => { if (name === "node:crypto") return { timingSafeEqual: (a: Buffer, b: Buffer) => a.equals(b) }; throw Error(name); }, Buffer, Request, Response, Headers, URL, URLSearchParams, TextDecoder, AbortSignal, Uint8Array,
    process: { env: { VERCEL_ENV: "production", AXVITAL_SIGNUP_WEBHOOK_SECRET: "x".repeat(32), RESEND_API_KEY: "private-key", AXVITAL_EMAIL_FROM: "sender@example.test", AXVITAL_ADMIN_EMAIL: "owner@example.test", STRIPE_PRICE_PREMIUM_MONTHLY: "monthly-price", STRIPE_PRICE_PREMIUM_ANNUAL: "annual-price" } },
    pending, tracked, console: { error: (...args: unknown[]) => logs.push(args) }, fetch: async (_url: string, init: RequestInit) => { deliveries.push(String(init.body)); return new Response(null, { status: 200 }); }, ...values });
  return { exports: testModule.exports, pending, tracked, deliveries, logs, async flush() { for (const task of pending.splice(0)) await task(); } };
}

test("analytics allowlist discards identifiers, arbitrary properties and private URLs", () => {
  assert.deepEqual(analyticsPayload("Signup Started", { email: "private" } as unknown as BillingInterval), {});
  assert.equal(analyticsPayload("private@email.test" as AnalyticsEvent), null);
  assert.equal(analyticsPayload("Checkout Started", "customer-id" as BillingInterval), null);
  for (const interval of ["monthly", "annual"] as const) assert.deepEqual(analyticsPayload("Checkout Started", interval), { billing_interval: interval });
  for (const path of ["/conditions/private-condition?email=private#notes", "/experiments/user-id", "/reset-password?token=secret", "/unknown/private"]) assert.equal(analyticsUrl(`https://example.test${path}`), "https://example.test/app");
  assert.equal(analyticsUrl("https://example.test/signup?email=private#token"), "https://example.test/signup");
  assert.equal(analyticsUrl("javascript:secret"), null);
});

test("notifications are gated by Vercel production, not NODE_ENV production builds", () => {
  assert.equal(notificationsEnabled({ NODE_ENV: "production", VERCEL_ENV: "preview" }), false);
  assert.equal(notificationsEnabled({ NODE_ENV: "production" }), false);
  assert.equal(notificationsEnabled({ VERCEL_ENV: "production" }), true);
  assert.equal(notificationsEnabled({ AXVITAL_NOTIFICATIONS_ALLOW_NON_PRODUCTION: "true" }), true);
});

test("root layout includes application-wide Analytics with URL sanitization", async () => {
  const f = await fixture("app/layout.tsx", {}, {
    "@/components/Navbar": 'export const Navbar = () => null;',
    "react": 'export const useEffect = () => {}; export const useRef = value => ({current:value});',
    "next/navigation": 'export const usePathname = () => "/";',
    "next/script": 'export default function Script(){return null;}',
    "react/jsx-runtime": 'export const jsx = (type, props) => typeof type === "function" ? type(props) : ({type,props}); export const jsxs = jsx; export const Fragment = "fragment";',
    "@vercel/analytics/next": 'export const Analytics = props => ({analytics:true,props});',
    "./globals.css": 'export {};',
  });
  const root = f.exports.default as unknown as (props: { children: string }) => { props: { children: { props: { children: { analytics?: boolean; props: { beforeSend?: (event: {type:string;url:string}) => {url:string} } }[] } } } };
  const body = root({ children: "page content" }).props.children;
  const analytics = body.props.children.find(child => child?.analytics);
  assert.ok(analytics?.props.beforeSend);
  assert.equal(analytics.props.beforeSend({ type: "pageview", url: "https://example.test/conditions/private?notes=secret" }).url, "https://example.test/app");
});

test("confirmed signup sends once; spoofed delivery is rejected; email failure cannot fail signup", async () => {
  let claimed = false, exists = true;
  const admin = { auth: { admin: { getUserById: async () => ({ data: { user: exists ? { id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", email: "member@example.test", created_at: "2026-09-10T00:00:00Z" } : null } }) } }, rpc: async () => { const first = !claimed; claimed = true; return { data: first }; } };
  const f = await fixture("app/api/notifications/signup/route.ts", { admin });
  const post = f.exports.POST as unknown as (request: Request) => Promise<Response>;
  const request = (authorized = true) => new Request("https://example.test/api/notifications/signup", { method: "POST", headers: { authorization: authorized ? `Bearer ${"x".repeat(32)}` : "Bearer bad" }, body: JSON.stringify({ type: "INSERT", schema: "public", table: "profiles", record: { id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", primary_goal: "private health" } }) });
  assert.equal((await post(request(false))).status, 401);
  exists = false; assert.equal((await post(request())).status, 204); assert.equal(claimed, false);
  exists = true; assert.equal((await post(request())).status, 204); await f.flush();
  assert.equal(f.deliveries.length, 1); assert.match(f.deliveries[0], /New AXVital Signup/); assert.doesNotMatch(f.deliveries[0], /private health/);
  await post(request()); await f.flush(); assert.equal(f.deliveries.length, 1); assert.equal(f.tracked.length, 1);
  claimed = false;
  const failed = await fixture("app/api/notifications/signup/route.ts", { admin, fetch: async () => { throw Error("private secret"); } });
  assert.equal((await (failed.exports.POST as unknown as typeof post)(request())).status, 204); await failed.flush();
  assert.equal(failed.logs.length, 1); assert.doesNotMatch(JSON.stringify(failed.logs), /private secret|member@example/);
});

test("paid notification accepts monthly/annual positive payments once and excludes trials/free invoices", async () => {
  for (const interval of ["monthly", "annual"]) {
    let claimed = false;
    const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: "owner", stripe_subscription_id: "sub" } }) }) }) }), auth: { admin: { getUserById: async () => ({ data: { user: { email: "member@example.test" } } }) } }, rpc: async () => { const first = !claimed; claimed = true; return { data: first }; } };
    const f = await fixture("lib/notifications/paid.ts");
    const paid = f.exports.paidMember as unknown as (request: Request, admin: unknown, invoice: unknown, subscription: unknown) => Promise<void>;
    const invoice = { status: "paid", amount_paid: 999, currency: "usd", customer: "customer", created: 1789000000, status_transitions: { paid_at: 1789000000 } };
    const subscription = { id: "sub", customer: "customer", items: { data: [{ price: { id: `${interval}-price` } }] } };
    const req = new Request("https://example.test/api/stripe/webhook");
    await paid(req, admin, { ...invoice, amount_paid: 0 }, subscription); assert.equal(claimed, false);
    await paid(req, admin, { ...invoice, status: "open" }, subscription); assert.equal(claimed, false);
    await Promise.all([paid(req, admin, invoice, subscription), paid(req, admin, invoice, subscription)]); await f.flush();
    assert.equal(f.deliveries.length, 1); assert.match(f.deliveries[0], new RegExp(`Plan: ${interval}`)); assert.match(f.deliveries[0], /\$9.99/);
    assert.equal(f.tracked.length, 1); assert.doesNotMatch(JSON.stringify(f.tracked), /member@example|customer|"sub"|cookie/);
  }
});

test("server analytics refuses query-bearing URLs and sends no request headers", async () => {
  const f = await fixture("lib/telemetry/server.ts");
  const schedule = f.exports.scheduleAnalytics as unknown as (request: Request, event: string) => void;
  schedule(new Request("https://example.test/api/product-events?notes=private"), "First Health Event Logged");
  assert.equal(f.pending.length, 0);
  schedule(new Request("https://example.test/api/product-events", { headers: { cookie: "secret", referer: "https://example.test/private" } }), "First Health Event Logged");
  await f.flush(); assert.equal(JSON.stringify(f.tracked), '[["First Health Event Logged",{},{"headers":{}}]]');
});

test("Stripe invoice webhook syncs before notification; retry and delivery failure preserve provisioning", async () => {
  let seen = false, claimed = false, syncs = 0;
  const subscription = { id: "sub", customer: "customer", items: { data: [{ price: { id: "monthly-price" } }] } };
  const invoice = { status: "paid", amount_paid: 999, currency: "usd", customer: "customer", created: 1789000000, status_transitions: { paid_at: 1789000000 }, parent: { subscription_details: { subscription: "sub" } } };
  const admin = {
    from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "stripe_webhook_events" ? (seen ? { stripe_event_id: "evt" } : null) : { user_id: "owner", stripe_subscription_id: "sub" } }) }) }), insert: async () => { seen = true; return { error: null }; } }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "member@example.test" } } }) } },
    rpc: async () => { assert.equal(syncs, 1); const first = !claimed; claimed = true; return { data: first }; },
  };
  const f = await fixture("app/api/stripe/webhook/route.ts", {
    admin, process: { env: { STRIPE_WEBHOOK_SECRET: "signature-secret", STRIPE_PRICE_PREMIUM_MONTHLY: "monthly-price", VERCEL_ENV: "production", RESEND_API_KEY: "private", AXVITAL_ADMIN_EMAIL: "owner@example.test", AXVITAL_EMAIL_FROM: "sender@example.test" } },
    sync: async () => { syncs++; },
    provider: { webhooks: { constructEvent: () => ({ id: "evt", type: "invoice.paid", data: { object: invoice } }) }, subscriptions: { retrieve: async () => subscription } },
    fetch: async () => { throw Error("private provider failure"); },
  }, {
    "next/headers": 'export const headers = async () => new Headers({"stripe-signature":"valid"});',
    "@/lib/billing/stripe": 'export const stripe = () => provider;',
    "@/lib/billing/sync": 'export const syncSubscription = (...args) => sync(...args);',
  });
  const post = f.exports.POST as unknown as (request: Request) => Promise<Response>;
  const request = () => new Request("https://example.test/api/stripe/webhook", { method: "POST", body: "{}" });
  assert.equal((await post(request())).status, 200); await f.flush(); assert.equal(claimed, true);
  const retry = await post(request()); assert.equal(retry.status, 200); assert.equal((await retry.json()).duplicate, true);
  assert.equal(syncs, 1); assert.equal(f.tracked.length, 1); assert.equal(f.logs.length, 1);
});

test("database milestone claims require persisted records, remain once after deletion, and deny API roles", async () => {
  const db = await database();
  const owner = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const claim = async (event: string) => (await db.query<{ claimed: boolean }>(`select public.claim_product_milestone('${owner}','${event}') as claimed`)).rows[0].claimed;
  try {
    assert.equal(await claim("signup_completed"), false);
    await db.exec(`insert into public.profiles(id) values('${owner}')`);
    assert.equal(await claim("signup_completed"), true); assert.equal(await claim("signup_completed"), false);
    assert.equal(await claim("first_health_event"), false);
    await db.exec(`insert into public.health_events(user_id) values('${owner}')`);
    assert.equal(await claim("first_health_event"), true);
    await db.exec(`delete from public.health_events where user_id='${owner}'; insert into public.health_events(user_id) values('${owner}')`);
    assert.equal(await claim("first_health_event"), false);
    assert.equal(await claim("first_daily_checkin"), false);
    await db.exec(`insert into public.daily_checkins(user_id,checkin_date) values('${owner}','2026-09-10')`);
    assert.equal(await claim("first_daily_checkin"), true); assert.equal(await claim("first_daily_checkin"), false);
    assert.equal(await claim("premium_activated"), true); assert.equal(await claim("premium_activated"), false);
    await db.exec("set role authenticated"); await assert.rejects(claim("signup_completed"), /permission denied/);
  } finally { await db.close(); }
});
