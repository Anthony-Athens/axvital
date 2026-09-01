// Local, read-only configuration inventory. It reports presence and mode only.
const required = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_PREMIUM_MONTHLY",
  "STRIPE_PRICE_PREMIUM_ANNUAL",
  "AXVITAL_SUPPORT_EMAIL",
  "AXVITAL_OPERATOR_NAME",
];

const present = Object.fromEntries(required.map((name) => [name, Boolean(process.env[name]?.trim())]));
const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
const stripeMode = stripeKey.startsWith("sk_test_") ? "test" : stripeKey.startsWith("sk_live_") ? "live" : "unknown";
const safeHost = (name) => {
  try { return process.env[name] ? new URL(process.env[name]).host : null; }
  catch { return "invalid"; }
};
const deletionEnabled = process.env.AXVITAL_ACCOUNT_DELETION_ENABLED === "true";
const legalReviewed = process.env.AXVITAL_LEGAL_REVIEWED === "true";
const missing = required.filter((name) => !present[name]);

console.log(JSON.stringify({
  readOnly: true,
  appHost: safeHost("NEXT_PUBLIC_APP_URL"),
  supabaseHost: safeHost("NEXT_PUBLIC_SUPABASE_URL"),
  stripeMode,
  deletionEnabled,
  legalReviewed,
  privacyContactDedicated: Boolean(process.env.AXVITAL_PRIVACY_EMAIL?.trim()),
  configurationPresent: present,
  missing,
}, null, 2));

if (missing.length || stripeMode === "unknown") process.exitCode = 1;
