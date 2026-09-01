// Read-only provider inventory for an explicitly authorized synthetic pre-launch environment.
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { readdir, readFile } from "node:fs/promises";

const requiredTrue = [
  "AXVITAL_PRELAUNCH_TESTING",
  "AXVITAL_SYNTHETIC_USERS_ONLY",
  "AXVITAL_NO_REAL_USER_DATA_CONFIRMED",
];
const required = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_PREMIUM_MONTHLY",
  "STRIPE_PRICE_PREMIUM_ANNUAL",
  "AXVITAL_EXPECTED_SUPABASE_PROJECT_REF",
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) throw new Error(`PREFLIGHT_MISSING:${missing.join(",")}`);
if (process.env.AXVITAL_ENVIRONMENT !== "production" || requiredTrue.some((name) => process.env[name] !== "true")) {
  throw new Error("PREFLIGHT_NOT_AUTHORIZED");
}
if (!process.env.STRIPE_SECRET_KEY.startsWith("sk_test_")) throw new Error("PREFLIGHT_STRIPE_NOT_TEST");

const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const projectRef = supabaseUrl.hostname.replace(/\.supabase\.co$/, "");
const expectedValue = process.env.AXVITAL_EXPECTED_SUPABASE_PROJECT_REF;
let expectedRef = expectedValue;
try { expectedRef = new URL(expectedValue).hostname.replace(/\.supabase\.co$/, ""); } catch {}
if (projectRef !== expectedRef) throw new Error("PREFLIGHT_SUPABASE_MISMATCH");

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(supabaseUrl.toString(), serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const schemaResponse = await fetch(new URL("/rest/v1/", supabaseUrl), { headers });
if (!schemaResponse.ok) throw new Error(`SUPABASE_SCHEMA_${schemaResponse.status}`);
const openapi = await schemaResponse.json();
const definitions = openapi.definitions ?? openapi.components?.schemas ?? {};
const migrationFiles = (await readdir(new URL("../supabase/migrations/", import.meta.url))).filter((name) => name.endsWith(".sql")).sort();
const repositoryTables = new Set();
for (const file of migrationFiles) {
  const sql = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
  for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) repositoryTables.add(match[1]);
}
const missingRepositoryTables = [...repositoryTables].filter((table) => !definitions[table]).sort();
const ownedTables = Object.entries(definitions)
  .filter(([, definition]) => definition?.properties?.user_id || definition?.properties?.owner_id)
  .map(([name]) => name)
  .filter((name) => !name.includes("."))
  .sort();

const countTable = async (table, column) => {
  const { count, error } = await admin.from(table).select(column, { count: "exact", head: true });
  return error ? { table, error: error.code ?? "QUERY_FAILED" } : { table, count: count ?? 0 };
};
const ownedCounts = [];
for (const table of ownedTables) ownedCounts.push(await countTable(table, "*"));
const profileCount = definitions.profiles ? await countTable("profiles", "*") : { table: "profiles", error: "MISSING" };
const { data: schemaIssues, error: schemaIssuesError } = await admin.rpc("axvital_account_schema_issues", { require_coordination: true });

let authUsers = 0;
for (let page = 1; ; page += 1) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw new Error(`AUTH_INVENTORY_${error.status ?? "FAILED"}`);
  authUsers += data.users.length;
  if (data.users.length < 1000) break;
}

const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
if (bucketError) throw new Error(`STORAGE_INVENTORY_${bucketError.message}`);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const priceIds = [process.env.STRIPE_PRICE_PREMIUM_MONTHLY, process.env.STRIPE_PRICE_PREMIUM_ANNUAL];
const prices = [];
for (const id of priceIds) {
  const price = await stripe.prices.retrieve(id);
  prices.push({ active: price.active, currency: price.currency, interval: price.recurring?.interval ?? null, unitAmount: price.unit_amount });
}
const webhookEndpoints = await stripe.webhookEndpoints.list({ limit: 100 });
const customers = await stripe.customers.list({ limit: 1 });
const subscriptions = await stripe.subscriptions.list({ status: "all", limit: 1 });

const totalOwnedRows = ownedCounts.reduce((sum, item) => sum + (item.count ?? 0), 0);
console.log(JSON.stringify({
  readOnly: true,
  appHost: new URL(process.env.NEXT_PUBLIC_APP_URL).host,
  supabaseProjectRef: projectRef,
  schemaTableCount: Object.keys(definitions).length,
  repositoryMigrationCount: migrationFiles.length,
  latestRepositoryMigration: migrationFiles.at(-1) ?? null,
  repositoryCreatedTableCount: repositoryTables.size,
  missingRepositoryTables,
  accountSchemaIssueCount: schemaIssuesError ? null : schemaIssues.length,
  accountSchemaIssueError: schemaIssuesError?.code ?? null,
  ownedTableCount: ownedTables.length,
  authUserCount: authUsers,
  profileCount: profileCount.count ?? null,
  totalOwnedRows,
  ownedTablesWithRows: ownedCounts.filter((item) => (item.count ?? 0) > 0),
  ownedTableQueryErrors: ownedCounts.filter((item) => item.error),
  storageBuckets: buckets.map((bucket) => ({ name: bucket.name, public: bucket.public })),
  stripeMode: "test",
  stripePrices: prices,
  stripeWebhookEndpoints: webhookEndpoints.data.map((endpoint) => ({ url: endpoint.url, status: endpoint.status })),
  stripeHasCustomers: customers.data.length > 0,
  stripeHasSubscriptions: subscriptions.data.length > 0,
}, null, 2));
