# Stripe customer mapping integrity

2026-08-27 — targeted Sprint 12B correction. Repository implementation only; no provider inspection, mutation, deployment or migration application performed. Account deletion remains disabled. No pricing, entitlement or Sprint 12C changes.

## Root cause and complete flow

Previously Checkout verified the user, read subscriptions, created a Stripe customer when its customer ID was empty, then upserted by user_id. Two requests could both read empty, create distinct customers and overwrite the row. Each could create a billable Checkout Session. Subscription webhooks also upserted metadata-selected owners, allowing historical/non-authoritative customers to replace the mapping later.

Now: authenticated session → validated monthly/annual interval → service-only reservation RPC → reuse existing customer or create with the durable operation key → atomic mapping establishment → retrieve/validate customer → assert mapping/not-closing → Checkout Session against that customer → assert again before returning URL → signature-verified webhook updates only the exact existing mapping. Checkout return remains informational, not payment proof.

## Database and Stripe contract

Migration **202608270005_billing_customer_coordination.sql** follows 003/004. It creates billing_customer_provisions (user_id PK/Auth CASCADE, unique operation_id UUID, created_at, unique nullable stripe_customer_id), service-only RPCs, and an immutable mapping trigger. No browser access is granted to coordination state or RPCs. The existing unique subscriptions.user_id and stripe_customer_id constraints are retained.

- Reserve locks auth.users FOR UPDATE, checks account_deletions, and returns an existing mapping or inserts one durable logical operation. Parallel reservations serialize on the same Auth row. No process-local lock and no database transaction is held open across the Stripe network call.
- All creation attempts use `axvital-customer-v1-<operation UUID>` and exactly `{metadata:{axvital_user_id:<authenticated owner>}}`. Creation no longer copies mutable email into Stripe, avoiding parameter mismatch on retries; Checkout collects billing details through its existing provider flow. No health information or email is in key material.
- Stripe deduplicates same-key calls. An overlapping provider call may return a conflict rather than wait; the endpoint fails safely and retry reuses the same operation. It never rotates the key on provider failure.
- Establish locks the same Auth row, verifies the operation and closing state, and atomically commits the provision customer plus subscription mapping. A write/constraint failure rolls both writes back. Existing mappings must equal the candidate; replacement is rejected by RPC and trigger, including legacy upserts.
- Existing mapped customers are retrieved and checked for deletion and contradictory ownership metadata. Missing/deleted/unavailable customers do not cause automatic replacement. Missing legacy metadata is accepted only with an existing DB mapping; contradicting metadata fails.
- Explicit mapping/closing assertions run before Session creation and after it, before returning the URL. Deletion preparation also refuses any unresolved provision so a pending provider operation cannot be lost by deleting Auth. A deletion that begins after a successful assertion still closes the same mapped customer, covering an in-flight/open Session under the existing 12B policy.
- Service-only coordination RPCs have 10-second HTTP aborts; customer and Checkout calls use 10-second provider timeouts with automatic network retries disabled. API guards retain private/no-store, shared budgets and body validation.

### Finite provider idempotency window

Stripe may prune idempotency results after at least 24 hours. Therefore an unresolved operation may be retried automatically only within **23 hours of its database creation**, checked by the reserve RPC and immediately before provider creation. No automatic expiry deletion, reset, new operation or new key exists. Keep application/database clocks synchronized and preserve the one-hour safety margin. Configuration must consistently use the same Stripe account/mode; do not repoint a deployment's pending operations to another provider account.

Expired pending operations return BILLING_RECONCILIATION_REQUIRED without contacting customer creation. This deliberately sacrifices automatic recovery rather than risking a second customer after Stripe's cache expires. Provider 500/conflict/timeouts also retain the operation. [Stripe idempotency contract](https://docs.stripe.com/api/idempotent_requests).

## Failure and orphan recovery

| Situation | Behavior / authorized operator action |
| --- | --- |
| No mapping | Reserve one durable operation; only its customer can be established. |
| Existing mapping | Reuse and retrieve; no create call. |
| Provider succeeded, DB mapping failed or response was lost | No Checkout Session is created by that failed attempt. Operation remains pending (or mapping already committed). Retry inside the safe window replays the original Stripe key or reuses the committed mapping. |
| Pending beyond 23 hours | Stop automatic creation; reconcile Stripe request history and owner metadata. Do not reset created_at or delete/recreate the provision. |
| Provider customer found for pending operation | Independently verify the request/key, exact metadata, ownership and uniqueness, and account not closing. An authorized operator may invoke the existing establish RPC with the original operation UUID and verified customer ID; it does not create/delete a Stripe object. This is a separate reviewed provider/DB action, not performed here. |
| No customer found / ambiguous results | Keep Checkout blocked. Lack of a search result is not proof no customer exists. Review paginated inventory, request logs and provider support as needed. No automatic replacement or deletion. |
| Mapped customer invalid/deleted | Fail safely; owner investigates historical subscriptions. Do not clear the mapping to force another checkout. |
| Closing/deleted account | Reserve/assert/establish fail; webhook never inserts a projection. |
| Session creation failed or response lost | Customer mapping remains safe; retry can make another Session on the same customer. This fix does not deduplicate Sessions or guarantee one subscription per customer. Existing deletion closes all subscriptions on that mapped customer. |

Provision rows contain only operational IDs/timestamps, are excluded from export, and cascade on successful Auth deletion. Pending operations block deletion preparation until reconciled. No independent purge/retention period is invented. Retention of stalled operational state remains OWNER/LEGAL DECISION REQUIRED.

## Webhook compatibility

The existing route still verifies the signature and event ID, resolves Checkout/invoice subscription details, and records successful event processing. `sync.ts` remains server-only; `subscription-sync.ts` contains the testable sync contract.

Lookup is by subscription.customer in the authoritative DB projection. Session owner and subscription metadata must agree with each other and the mapped owner. Missing/ambiguous/mismatched mappings fail with a generic webhook error and are not marked processed; operators must reconcile and replay after correction. Metadata is never sufficient to create a mapping. Closing/deleted accounts with a usable owner hint are ignored. Unknown unmapped events without a resolvable owner fail for investigation. Updates are filtered by owner AND customer, never upserts; database immutable/closing guards cover races during the final write. A concurrent closing write may cause a retryable webhook failure, never resurrection.

## Read-only historical reconciliation — OWNER ACTION REQUIRED

The fix prevents the future customer-establishment race; **historical Stripe data has not been inspected or reconciled**.

1. Verify the intended Supabase project, Stripe account and test/live mode. Use authorized credentials through environment variables, not command-line key arguments. Prefer a restricted Stripe read key with Customer/Subscription read permissions. Supabase service role is privileged but this script uses SELECT only; protect it. Do not put secrets in shell history.
2. Choose a private output location outside the repository, shared folders and public/static directories. Reports contain account/customer/subscription identifiers; do not commit or attach them to ordinary support tickets. Windows ACL protection must be verified by the operator; file mode alone is not an ACL guarantee.
3. With Node 24 and the repo dependencies installed, run from the repository using already-configured environment variables:

   `node scripts/reconcile-billing.mjs --output <new-private-report.json>`

   Required variables: STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. The script does not load or print credential files. `--help` does not connect to providers. It refuses to overwrite an existing output file.
4. The script paginates DB mapping rows, all Stripe Customers and subscriptions with status=all, then retrieves each mapped customer to distinguish missing/deleted/mismatched IDs. It records duplicate metadata owners, non-authoritative subscriptions (including active/trialing/past-due), owner metadata conflicts, customers without usable owner metadata, and unresolved provision rows. No health tables, email fields, payment details or raw provider objects are written. Stripe APIs return fuller objects in memory; only allowlisted operational fields enter the report. Raw errors are suppressed; permission/outage failures abort the report, not misclassified as missing customers.
5. Default Stripe list APIs exclude Test Clock records. Repeat with `--test-clock <clock ID>` for **every** Test Clock used by that test account, plus the default run. Retain scope labels and review across reports. Production has no Test Clocks. [Customer pagination/scope](https://docs.stripe.com/api/customers/list), [subscription status/scope](https://docs.stripe.com/api/subscriptions/list).
6. This is not a transactional cross-provider snapshot. Repeat during an owner-approved quiet billing window and compare results. Customer metadata may be missing, wrong or manually changed; inspect unowned/customer mismatch findings against request records. Inventory is evidence for review, not an automatic clean bill of health.
7. For duplicate customers or subscriptions on a non-authoritative customer, document the intended owner/mapping and all billable subscriptions. Obtain separate authorization for any repair/cancellation/refund. The script never creates, updates or deletes Stripe customers/subscriptions or Supabase rows.
8. Before migration 005, provisions are explicitly reported as table_not_deployed. After migration 005, rerun to inspect pending/established operations. Do not apply a newly generated key to an old unresolved operation. Do not drop immutable/closing protections to fix historical data casually.

## Tests and deployment sequence

Regression tests use concurrent promises with real checked-in PostgreSQL migrations in PGlite and a mocked idempotent Stripe transport. Two overlapping creation calls receive the same durable operation and converge to one customer. Tests cover reuse, provider timeout/key reuse, mapping outage, SQL write rollback, expired pending operations, immutable mapping, client ID rejection, closing reservations/assertions, missing/deleted customers, webhook mismatches and closing/deleted owners, and reconciliation analysis.

PGlite has a single database backend: these are not live multi-instance load tests or proof of deployed Supabase grants/Auth behavior. Owner staging validation must send simultaneous first Checkout requests from separate app instances and exercise Stripe Test Mode conflicts/timeouts, DB failure and late webhooks. No provider mutation was performed by this work.

Deploy review: reconcile the baseline schema first; apply 003 → 004 → **005** in a staging transactionally managed migration sequence before routing Checkout to this new code. Coordinate app/migration rollout and pause old Checkout traffic during transition. Existing mappings are preserved; historical corrupt mappings may cause guarded writes to fail and need review. Do not deploy this app against only 003/004: required coordination RPCs would be absent and Checkout fails closed. Do not roll back to the old Checkout implementation after traffic begins.

**Repository status:** the specific future customer-mapping concurrency blocker is resolved by this implementation and its tests. Migrations 003/004 plus 005 can proceed to owner-controlled staging validation, not unconditional production approval. Historical reconciliation, missing baseline schema/Storage verification, provider QA and legal/support gates remain. Account deletion stays disabled; no Sprint 12C work started.

## Files in this targeted change

- Checkout route; lib/billing/sync.ts wrapper; new customer-coordination.ts, customer-server.ts, subscription-sync.ts, reconciliation.ts.
- New migration 202608270005_billing_customer_coordination.sql.
- Billing and database regression tests; scripts/reconcile-billing.mjs (read-only).
- This report and account-data-controls.md, sprint-12b-account-control.md, billing.md, launch-readiness.md.


### Targeted fix verification results

- `npm test`: **270 passed**, zero failures.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- After the final explicit API-role permission revocation, the PostgreSQL suite was rerun: **3 passed**. Its fixture gives new functions permissive default grants and verifies authenticated access is still denied.
- `node scripts/reconcile-billing.mjs --help`: passed without connecting to providers. Reconciliation analysis uses synthetic fixtures; the live inventory was **not run**.
- No migrations applied, no external provider data read or modified, no deletion enabled, and no Sprint 12C work performed. Existing untracked supabase/.temp was untouched.
