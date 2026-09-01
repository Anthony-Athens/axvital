// Local, read-only configuration inventory. It reports presence and mode only.
const required = [
  "AXVITAL_ENVIRONMENT",
  "AXVITAL_STAGING_SUPABASE_PROJECT_REF",
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
const environment = process.env.AXVITAL_ENVIRONMENT?.trim().toLowerCase() ?? "unknown";
const safeHost = (name) => {
  try { return process.env[name] ? new URL(process.env[name]).host : null; }
  catch { return "invalid"; }
};
const supabaseProjectRef = (() => {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
    return host.endsWith(".supabase.co") ? host.slice(0, -".supabase.co".length) : null;
  } catch { return null; }
})();
const expectedSupabaseProjectRef = process.env.AXVITAL_STAGING_SUPABASE_PROJECT_REF?.trim() ?? "";
const appHost = safeHost("NEXT_PUBLIC_APP_URL");
const appHostname = (() => {
  try { return process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : null; }
  catch { return null; }
})();
const stagingSpecificAppHost = Boolean(appHostname && appHostname !== "localhost" && appHostname !== "127.0.0.1" && appHostname !== "::1");
const stagingDesignated = environment === "staging";
const supabaseMatchesDesignation = Boolean(supabaseProjectRef && expectedSupabaseProjectRef && supabaseProjectRef === expectedSupabaseProjectRef);
const deletionEnabled = process.env.AXVITAL_ACCOUNT_DELETION_ENABLED === "true";
const legalReviewed = process.env.AXVITAL_LEGAL_REVIEWED === "true";
const missing = required.filter((name) => !present[name]);

console.log(JSON.stringify({
  readOnly: true,
  environment,
  stagingDesignated,
  appHost,
  stagingSpecificAppHost,
  supabaseHost: safeHost("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseMatchesDesignation,
  stripeMode,
  deletionEnabled,
  legalReviewed,
  privacyContactDedicated: Boolean(process.env.AXVITAL_PRIVACY_EMAIL?.trim()),
  configurationPresent: present,
  missing,
}, null, 2));

if (missing.length || !stagingDesignated || !stagingSpecificAppHost || !supabaseMatchesDesignation || stripeMode !== "test") {
  process.exitCode = 1;
}
