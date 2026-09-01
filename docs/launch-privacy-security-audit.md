# Launch privacy, security, and data-controls audit

Updated 2026-09-01. This audit describes the checked-in implementation, not deployed-provider configuration or legal approval. It supplements `account-data-controls.md`, which contains the full table-by-table export/deletion contract and recovery runbook.

## Executive status

The repository has strong owner-derived API boundaries, RLS coverage, bounded export, fail-closed account deletion, server-only privileged credentials, and conservative health-analysis behavior. No production AI/LLM integration was found. Public trust pages no longer expose internal TODO language.

Launch is still blocked on operational evidence: deployed migration/RLS verification, disposable-account deletion with Stripe Test Mode, historical Stripe mapping reconciliation, Storage inspection, monitored support/privacy contact configuration, retention decisions, and qualified legal review. Self-service deletion must remain disabled until those gates pass.

## Privacy policy claim matrix

| Claim | Implementation support | Status | Action |
| --- | --- | --- | --- |
| AXVital stores account, profile, and entered health records | Supabase Auth plus owned public tables | Confirmed | Keep inventory current as schema changes |
| Data powers tracking, planning, analysis, billing, export, and deletion | Application routes, RPCs, and services | Confirmed | None |
| No health data is sent to an external AI provider | No AI SDK, endpoint, or runtime dependency found | Confirmed for checked-in production code | Re-audit before adding AI |
| No advertising-data sale integration exists | Only bounded signed-in product-intent events found | Confirmed for checked-in code | Legal review must decide any broader “sale/share” wording |
| Stripe handles payment entry; AXVital stores subscription metadata | Stripe-hosted Checkout/Portal and subscription projection | Confirmed | Verify live Stripe configuration |
| Product events exclude health payloads | Event allowlist and API validation | Confirmed | Preserve allowlist |
| Export is owner-only and omits secrets/provider internals | Auth-derived SECURITY INVOKER RPC with allowlists | Confirmed | Stage-test v2 migration and large-account procedure |
| Deletion closes the mapped Stripe customer before Auth/data deletion | Prepared workflow and fail-closed coordinator | Confirmed in code; deployment unverified | Keep disabled until provider/staging QA |
| Active application data is deleted on successful account deletion | Auth BEFORE DELETE transactional cleanup | Confirmed in migration contract | Verify deployed trigger and Storage |
| Provider records, logs, backups, and downloaded exports may remain | Outside application transaction | Partially supported | Set retention and disclosure decisions |
| General active-account retention period | No scheduled retention mechanism found | Operational decision required | Approve periods or justify account-lifetime retention |
| Privacy rights beyond correction/export/deletion | No request-management workflow | Operational/legal decision required | Define manual intake, identity verification, response, and escalation |
| Children/minimum age handling | Optional birth month/year; no age gate | Operational/legal decision required | Decide eligibility and implement/disclose consistently |
| Operator identity/contact/legal approval | Environment-driven; deployment not verified | Operational/legal decision required | Configure monitored contacts and obtain counsel approval |

## Technical data inventory

| Data | Storage | User identifier | Exported | Deleted | Retention known |
| --- | --- | --- | --- | --- | --- |
| Auth account, identities, sessions | Supabase Auth | Auth UUID/email | No provider internals | Auth user deleted; provider behavior applies | No |
| Profile/goals/birth context/weight/sleep note | `profiles` | `id` | Yes, allowlisted | Explicit/Auth cascade | No |
| Check-ins and general health events | `daily_checkins`, `health_events` | `user_id` | Yes | Explicit/Auth cascade | No |
| Conditions, symptoms, episodes, updates/links | Owned condition/symptom/episode tables | Owner or owned parent | Yes | Explicit plus cascades | No |
| Nutrition foods, entries/items, targets, meals, patterns/rules/coverage | Owned nutrition tables | Owner or owned parent | Yes in v2 | Explicit plus cascades | No |
| Activities, habits, occurrences | Planning tables | `user_id` | Yes | Explicit/Auth cascade | No |
| Protocol templates, protocols, activities, pauses | Protocol tables | `user_id` | Yes | Explicit plus cascades | No |
| Workout templates, plans, sessions, exercises, sets | Workout tables | `user_id` | Yes | Explicit plus cascades; shared exercises retained | No |
| Experiments, snapshots, evidence, results, measurements, lifecycle | Experiment tables | Owner or owned experiment | Yes in current contracts, including durable evidence migrations | Explicit plus cascades | No |
| Weekly recaps and persisted insights | `weekly_recaps`, optional `user_insights` | `user_id` | Yes | Explicit/Auth cascade | No |
| Subscription projection | `subscriptions` | `user_id` | Redacted summary only | Explicit/Auth cascade after Stripe closure | No |
| Stripe customer/subscription/payment history | Stripe | Provider/customer mapping | No | Customer closure; provider financial history may remain | No |
| Product intent events | `product_events` | nullable `user_id` | No | Linked rows explicit; null-owner rows remain | No |
| Webhook deduplication | `stripe_webhook_events` | Stripe event ID, no app owner | No | Retained | No |
| API budgets/deletion coordination | Operational tables | `user_id` | No | Auth cascade | No |
| Auth email delivery metadata | Supabase SMTP/provider | Email/provider identifiers | No | Provider managed | No |
| Support messages | Configured mailbox provider | Email/content | No | Manual/provider managed | No |
| Runtime logs/backups | Hosting/Supabase providers | Potential request/account metadata | No | Provider managed | No |

No application file-upload or Storage integration was found in the checked-in product. Deployed Supabase Storage must still be inspected before deletion enablement.

## Export coverage

`POST /api/account/export` obtains the verified Auth user, applies same-origin/body/rate limits, and calls `axvital_export_account()` without an owner argument. Migration `202608280001` returns `axvital.account.v2`, includes the owned domain tables above, removes repeated `user_id`, allowlists profile/subscription fields, provides a source manifest, and fails the entire export on required-source/schema/size errors.

Excluded intentionally: password/auth internals, secrets, Stripe identifiers and transactions, webhook events, product events, request budgets, deletion coordination, shared catalogs, and other users. Provider-managed email/support/billing data is not part of the application export. Export size/time limits require an approved assisted-export process for unusually large accounts.

## Deletion and subscription coverage

The user must supply the current password, exact `DELETE`, and a consequences acknowledgement. Identity comes from `auth.getUser`; client owner fields are rejected. MFA-enrolled accounts additionally require AAL2. Deletion creates a durable prepared marker, retrieves and closes the exact mapped Stripe customer, marks billing closed, and only then deletes the Auth user. The Auth BEFORE DELETE trigger validates the complete schema/ownership contract before deleting application rows transactionally.

Closing the Stripe customer cancels subscriptions and prevents continued recurring billing for that mapped customer. Stripe transaction/accounting history is not erased and no refund is promised. Missing, mismatched, active-but-unmapped, duplicate, or provider-failing billing state stops deletion. A later Auth/database failure cannot undo Stripe closure, so the recovery runbook must be operational before enablement.

Retained or external: Stripe financial history, webhook deduplication records, null-owner product events, provider logs/backups, mailbox records, and downloaded exports. Storage is unknown until deployment inspection. Resend/support records are provider-managed and not deleted by application code.

## RLS review

| Table group | RLS | SELECT | INSERT | UPDATE | DELETE | Concern |
| --- | --- | --- | --- | --- | --- | --- |
| Profiles/check-ins/health events/recaps | Enabled by migrations/required contract | Owner | Owner | Owner | Owner | Verify deployed legacy policies |
| Planning/habits/protocols | Enabled | Owner | Owner | Owner | Owner | None found in checked-in policy tests |
| Workouts/custom exercises | Enabled | Owner; shared exercises readable | Owner only | Owner only | Owner only | Shared exercise rows intentionally immutable to users |
| Conditions/symptoms/episodes | Enabled | Owner or owned-parent | Owner | Owner | Owner | Catalog tables are shared/read-only |
| Nutrition | Enabled | Owner or owned-parent | Owner | Owner | Owner | Catalog foods/servings are shared/read-only |
| Experiments/results/evidence | Enabled | Owner or owned experiment | Owner or controlled RPC | Owner/controlled lifecycle | Owner where permitted | Durable evidence intentionally restricts mutation |
| Insights | Enabled when table exists | Owner | Owner | Owner | Owner | Optional schema presence is explicit |
| Subscriptions | Enabled | Owner read | No browser write | No browser write | No browser delete | Service/webhook controlled |
| Operational billing/events/budgets/deletion | Enabled | Restricted/service paths | Restricted | Restricted | Restricted | Retention decisions remain |

The schema assertion requires RLS, Auth ownership FKs, export SELECT access, and reviewed relationship FKs for every contracted owned table. Existing database tests exercise foreign-owner denial and real authenticated/service roles. No policy was weakened.

## API authorization and secret handling

The shared API guard authenticates with Supabase, validates same-origin/bounded input, derives `userId`, applies database-backed rate limits, and returns private/no-store responses. Analytics, timeline, recap, nutrition, experiments, account, and billing handlers use the authenticated client or explicit owned projections. Account deletion/export reject owner overrides. Experiment routes have dedicated ownership and foreign/not-found equivalence tests. No straightforward IDOR or trusted client `user_id` defect was found.

`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` are read only from server-only modules/routes. Public Supabase URL and anon key are intentionally browser configuration. No secret values are returned or logged. Webhook signatures are verified before processing. Operational API logs contain route, HTTP status, and a generic category only; development-only client logs use generic context and provider errors are not rendered to users.

## Authentication review

Passwords are bounded to 8–72 characters; Supabase may additionally reject weak/compromised passwords. Reset messaging does not disclose account existence. Reset origins are restricted to a configured HTTPS origin (localhost HTTP allowed), recovery authorization is short-lived and user-bound, and password/account mutations suppress duplicate submission. Middleware refreshes sessions, protects all authenticated routes, enforces onboarding, and redirects signed-in users away from login/signup. Email verification behavior is deployment-owned Supabase configuration and must be verified.

## Processor map

| Processor | Technical purpose | Data indicated by repository | Health content sent |
| --- | --- | --- | --- |
| Supabase | Auth, database, session cookies, optional SMTP routing | Account identifiers and all stored application health records | Yes, as primary application storage |
| Stripe | Checkout, Portal, subscription lifecycle, billing closure | Account/provider identifiers and billing metadata | No health fields found |
| Resend | Documented custom SMTP path through Supabase | Email address and delivery metadata | No application health payload found; support email content may be sensitive |
| Vercel | Referenced deployment host | Requests, runtime/access metadata | No explicit health payload integration; logs/config require verification |
| Squarespace/domain infrastructure | Mentioned as possible domain infrastructure only | DNS/request metadata depending on deployment | Repository does not establish usage |

Vendor contracts, regions, subprocessors, retention, legal bases, and international-transfer terms are not established by this repository and require operational/legal verification.

## Required operational decisions

1. Verify and publish the legal operator identity and monitored support/privacy contact.
2. Obtain qualified review of Privacy and Terms, including eligibility/minimum age, regions, rights, user-content license, refunds, liability, governing law, notices, and processor disclosures.
3. Define health/account, log, backup, webhook, analytics, mailbox, and provider-record retention.
4. Define privacy-request intake, identity verification, correction/access/deletion escalation, response tracking, and large-export handling.
5. Apply and verify migrations in staging, run the read-only schema inventory, and test two-account isolation.
6. Reconcile historical Stripe customers/subscriptions, including unmapped or duplicate billable records.
7. Test a disposable paid account through export, Stripe Test Mode deletion, Auth removal, database cleanup, retry, and partial-failure recovery.
8. Inspect deployed Storage buckets, Auth hooks, email verification, SMTP delivery, logs/redaction, backups, and old-token behavior.

## Retention statement

**No explicit application-level retention period is currently enforced.** Successful account deletion removes owned active-database records through the reviewed transaction. This is not a promise about provider records, logs, backups, support mail, Stripe financial history, or copies previously downloaded by the user.
