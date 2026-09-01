# AXVital controlled-beta operations runbook

Updated 2026-09-01. This is a launch gate and operator procedure, not proof that a deployment passed. Never use real health data, live Stripe charges, production account deletion, or copied authentication tokens for verification.

## Current evidence and environment inventory

| Environment | App host | Supabase | Stripe | Email | Purpose / status |
| --- | --- | --- | --- | --- | --- |
| Local | `localhost` | Project host is configured locally | Test key locally | Not evidenced | Development only; not staging evidence |
| Preview/staging | Not identified | Not identified | Not identified | Not identified | **No dedicated staging environment is established** |
| Production | Repository suggests `www.axvital.com`, but no linked deployment was available | Not verified | Not verified | Not verified | Deployment/provider verification unavailable |

The workspace is not linked to a Vercel project, and Vercel/Supabase CLIs are unavailable. Process environment did not contain deployment credentials. `.env.local` identifies localhost, one Supabase project host, and Stripe Test Mode, but a local file does not designate that project as staging or production. Locally, the Stripe webhook secret, support/privacy contacts, operator identity, and legal-review flag were not configured; account deletion was disabled. Values were not printed.

Run `npm run ops:preflight` only in the explicitly selected environment. It reports hostnames, mode, and variable presence without printing credentials. A successful result is configuration inventory, not connectivity or workflow proof.

## Disposable account strategy

Create accounts only in an explicitly designated staging Supabase project:

- Account A: unique synthetic email, Free plan, used for signup, onboarding, representative records, RLS, export, and free deletion.
- Account B: unique synthetic email, Stripe Test Mode only, used for Checkout, Portal, cancellation/failure, export, and paid deletion.
- Optional Account C: second foreign-owner/RLS actor if Account B lifecycle timing would interfere.

Use an operator-owned catch-all or plus-address domain approved for testing. Use invented names and neutral synthetic entries such as “Test meal,” “Test workout,” and “Test condition”; never copy real user or operator health history. Record account UUIDs, environment, creation time, test case, and cleanup state in the private test log. Never record passwords, tokens, exported JSON, provider secrets, or detailed synthetic record bodies in tickets.

## Migration verification

Repository migrations exist through `202608280007_nutrition_goals_access.sql`. Staging and production application state are currently **unknown** for every migration.

1. Explicitly identify the target project and have another operator confirm staging versus production.
2. Use the authorized Supabase migration-history view/CLI and export only migration names/status, never connection credentials.
3. Compare the ordered list in `supabase/migrations` with remote migration history.
4. Before account-control/Experiment v2 migrations, run the applicable read-only scripts in `supabase/tests`, including `sprint12b_pre003_preflight.sql` and `sprint13a2_preflight.sql`.
5. Stop on a missing predecessor, modified checksum, unexpected table/FK/policy, nonzero schema issue, or an environment-identity mismatch.
6. Apply only to staging in filename order during an approved change window. Re-run preflight and application tests afterward.
7. Production application requires a separate approval after staging evidence and backup/restore verification.

| Migration range | Repository | Staging | Production | Concern |
| --- | --- | --- | --- | --- |
| `202607210001`–`006` planning/habits/protocols/workouts | Present | Unknown | Unknown | Baseline ownership/RLS parity required |
| `202608060001`–`008` conditions/symptoms/experiments/nutrition | Present | Unknown | Unknown | Catalog and owned-table policies required |
| `202608210001`–`003` workout safety/recaps/episodes | Present | Unknown | Unknown | Relationship/FK parity required |
| `202608220001` billing | Present | Unknown | Unknown | Webhook/projection dependencies |
| `202608270001`–`005` owner hardening/budgets/export/deletion/billing coordination | Present | Unknown | Unknown | Mandatory before deletion enablement |
| `202608280001`–`007` Experiment v2/evidence/weight/nutrition goals | Present | Unknown | Unknown | Run 13A preflight and real-role tests |

## Deployed RLS verification

Use Accounts A and C and representative records in each domain: profile, check-in, health event, nutrition, habit/activity, protocol, workout, condition/symptom/episode, experiment, recap, and insights when deployed.

For each owned table or public API:

1. Create one record as A through the normal application or authenticated client.
2. Record only its UUID/type in the private test log.
3. As C, attempt SELECT by exact ID and list/search paths; expect no A row.
4. As C, attempt UPDATE and DELETE by exact A ID; expect zero affected rows or authorization failure.
5. As C, attempt INSERT with A’s owner UUID or A-owned parent; expect denial.
6. Confirm A can still read/update its own record.
7. Confirm anonymous access is denied.
8. Delete fixtures through normal owner workflows.

Any cross-owner read or mutation is a **stop-launch security incident**. Preserve minimal request IDs/timestamps, disable the affected feature or deployment, restrict access, and follow the exposure runbook below. Do not weaken policies to continue testing.

## Authentication and email checklist

- [ ] Signup creates Auth user and profile exactly once.
- [ ] Verification email arrives from the approved sender and expected SMTP provider.
- [ ] Subject/branding are correct and do not expose internal project names.
- [ ] Verification callback returns to the exact staging host.
- [ ] Invalid/expired link fails safely without account enumeration.
- [ ] Unverified login behavior is understandable and matches Supabase configuration.
- [ ] Verified login enters onboarding; required primary goal is enforced.
- [ ] Refresh and logout/login preserve the completed onboarding gate.
- [ ] Forgot-password response is identical for known/unknown email.
- [ ] Reset email returns only to the configured trusted origin.
- [ ] New password works; old password and reused/expired token fail.
- [ ] `/settings/security` update works and does not expose tokens in URL/logs.

Record whether Supabase native email or custom SMTP/Resend actually delivered each message. Repository documentation is not configuration evidence.

## Core browser smoke path

Run desktop and 390×844 mobile passes with Account A:

- [ ] Signup → verification → login → onboarding → Today.
- [ ] Today: save check-in, Quick Log one neutral item, observe timeline update.
- [ ] Track: every destination opens the expected route.
- [ ] Nutrition: log a synthetic food and verify totals/history.
- [ ] Workouts: create/open a template, schedule/start/complete representative sets, inspect history/progress.
- [ ] Habits: create and complete a synthetic habit.
- [ ] Protocols: create/start a protocol and confirm Today/weekly linkage.
- [ ] My Health: add synthetic condition, symptom, and episode; verify ownership/history.
- [ ] Learn: Health Overview, Insights, and Weekly Recap show honest low/nonzero-data states.
- [ ] Experiments: create/save/start a supported synthetic draft and inspect active/results states without bypassing readiness.
- [ ] Me: profile, Settings, Billing, Export, and Delete pages are reachable.
- [ ] No horizontal overflow, obscured bottom actions, duplicate submission, or raw technical error.

## Stripe Test Mode lifecycle and reconciliation

Account B must use a Stripe Test Mode key and test payment method:

- [ ] Free state is authoritative before Checkout.
- [ ] Checkout shows approved product, amount, interval, and Test Mode.
- [ ] Repeated/failed Checkout attempts converge on the intended customer mapping.
- [ ] Successful Checkout webhook is received once and projection becomes Premium.
- [ ] Return from Checkout alone does not grant entitlement before webhook state.
- [ ] Billing Portal opens for the mapped customer and returns to the expected host.
- [ ] Cancellation/period-end state and entitlement match Stripe.
- [ ] Failed payment produces the documented bounded grace/inactive behavior.

Run `scripts/reconcile-billing.mjs` read-only with a new private output path and the explicitly designated Test Mode scope. Review duplicate owners, duplicate customers, unmapped subscriptions, missing/deleted customers, owner metadata mismatch, stale projections, and incomplete provisions. Do not attach the report to ordinary tickets; it contains provider/account identifiers. Never automatically merge or delete findings.

## Export, free deletion, and paid deletion

Populate Account A across the representative domains, export through the UI, and validate JSON/manifest offline. Confirm A’s records are present, C’s are absent, JSON parses, secrets/provider IDs are absent, and documented exclusions remain absent.

For free deletion, capture a bounded list of representative A record IDs before deletion. Complete password, exact `DELETE`, and acknowledgement. Verify Auth user removal, application rows absent, login failure, old browser/API session denial, and no Storage objects/orphans. Never print tokens.

For paid deletion, repeat with B while the Test Mode subscription is active. Verify the mapped Stripe customer/subscription closes before Auth removal, health/application rows disappear, entitlement ends, old session/API access fails, and the deletion-complete page appears.

Exercise failures with mocks or controlled provider interruption only. If Stripe closure succeeds and Auth deletion fails, stop retries until the operator checks the prepared marker, exact customer state, Auth existence, and database rows using `account-data-controls.md`. Never mark billing closed manually without independent provider verification.

## Storage and backup verification

Repository inspection found no application upload or Supabase Storage usage. In the designated project, still inventory every bucket, public flag, object ownership convention, storage RLS policy, and object count. Any publicly readable user health object blocks beta. Confirm deletion behavior with disposable objects if any owned workflow exists.

Record Supabase plan, backup frequency, point-in-time recovery availability, last successful backup, restore owner, restore procedure, and a non-production restore test date. Account deletion affects the active database; it must not be described as instant erasure from provider backups. Set a reviewed backup retention disclosure before launch.

## Observability findings and minimum beta controls

Current repository behavior provides generic server logs for 5xx API failures and safe UI errors/retries. Stripe webhook failures return safe 500 responses and Stripe supplies delivery history. There is no repository evidence of centralized exception tracking, alert rules, email-delivery alerts, deletion/export alerts, or a tested on-call notification path.

Before beta, configure the smallest available operational layer:

- Vercel alert/query for repeated 500s and deployment failure.
- Supabase alerts/log review for Auth/database/API failures and resource limits.
- Stripe webhook failure/retry notifications and daily reconciliation review during early beta.
- SMTP/Resend delivery-failure monitoring.
- A private incident log with environment, request ID, generic category, timestamps, and owner.

Do not send health contents, passwords, tokens, request bodies, exports, or provider secrets to monitoring. User UUID may be recorded only when necessary and access-controlled.

Existing product events record only signed-in pricing/upgrade intent. They cannot currently answer onboarding completion, Today return, first log, Learn visit, experiment creation, or authoritative checkout success. If beta analytics are required, add only server-authoritative lifecycle events and generic route/action names—never health values, titles, notes, conditions, symptoms, or hypotheses. API failure monitoring belongs in operational telemetry, not product events.

## Incident runbook

| Incident | Symptom / inspect first | Immediate containment | Owner/escalation | Recovery |
| --- | --- | --- | --- | --- |
| Auth outage | Login/signup/reset spike; Supabase Auth status/logs | Pause invites and publish status | Operator → Supabase | Restore provider/config, test disposable login |
| Verification email failure | Signup succeeds but mail absent; Auth/SMTP delivery logs | Pause invites; avoid repeated sends | Operator → SMTP/Supabase | Correct sender/routing, resend to test account |
| Checkout failure | Checkout API 5xx or no session; Vercel/Stripe request logs | Disable upgrade CTA if systemic | Billing owner → Stripe | Fix config/provider, retry idempotently |
| Webhook failure | Stripe retries; projection stale | Do not manually grant Premium | Billing owner | Repair endpoint/secret, replay verified events, reconcile |
| Incorrect billing | User charge/projection mismatch | Stop new checkout if systemic | Billing/privacy owner | Verify Stripe source, correct through provider process, document refund decision |
| Partial deletion | Billing closed but Auth/data remains | Disable deletion; preserve marker | Security/billing owner | Follow staged recovery in `account-data-controls.md` |
| Export failure | Safe export error/size limit | Do not request health data by email | Privacy owner | Inspect generic error/schema contract; use approved assisted export |
| Suspected cross-user exposure | Foreign record visible/mutable | Stop affected feature/deployment; preserve minimal evidence | Security/privacy owner immediately | Scope, revoke access, repair RLS, legal notification review, two-user retest |
| Database outage | Broad API failures | Pause mutations/checkout/deletion | Operator → Supabase | Restore service, verify consistency and queues |
| Bad deployment | New errors after release | Halt rollout; use Vercel prior deployment rollback | Release owner | Roll back app only, validate health checks; handle schema separately |
| Migration problem | Migration failure or post-deploy schema error | Stop rollout and writes to affected feature | Database owner | Prefer forward corrective migration; restore only under approved disaster plan |

Severity: Sev 0 cross-user exposure/active incorrect billing/destructive corruption; Sev 1 auth/database/deletion outage; Sev 2 major feature degradation; Sev 3 isolated usability issue. Every incident gets a unique reference, environment, severity, start time, owner, containment, resolution, and follow-up. Privacy/security incidents use a restricted record.

## Support workflow

1. Receive issue through the verified monitored mailbox.
2. Assign unique reference and severity.
3. Record environment, time, route/action, browser/device, and user UUID only when necessary.
4. Do not request passwords, tokens, payment-card data, exports, or detailed health history.
5. Route billing, privacy, and suspected exposure issues to their designated owners.
6. Investigate using generic logs/provider IDs and least privilege.
7. Communicate acknowledgement, safe workaround, resolution, and any user action.
8. Close with cause/category and follow-up; retain according to the approved support policy.

Before beta, designate mailbox owner, backup owner, expected review cadence, acknowledgement target, billing escalation, privacy/security escalation, and provider contacts. Do not publish an address until delivery and monitoring are verified.

## Deployment and rollback

For application rollback, identify the last known-good Vercel deployment, compare commit/environment configuration, promote or redeploy it through the approved console, then smoke-test Auth, Today, read-only health routes, Checkout disabled/enabled state, export, and webhook response. Never roll back app code across an incompatible database migration.

Database migrations are forward-first. Many checked-in migrations change durable data/contracts and cannot be safely reversed by running rollback SQL blindly. Before migration: verify backup/restore, read-only preflight, lock/runtime expectations, and compatible old/new app behavior. On failure, stop rollout and use a reviewed forward correction; restore a backup only as a coordinated disaster-recovery action with data-loss analysis.

Environment variables must be managed in the deployment provider, scoped separately for preview/staging/production, reviewed without copying secrets into tickets, and followed by a redeployment where required. Maintain an access-controlled owner/rotation register.

## Synthetic beta seed

The existing Profile demo tool is development-only and safely inserts tagged check-ins/health events without overwriting collisions. It does not cover nutrition, workouts, habits, protocols, conditions, episodes, recaps, insights, or experiments and must not be enabled in production/staging builds by bypassing `NODE_ENV`.

For staging, prefer a written browser fixture checklist using normal owner-scoped UI/API flows. Recreate Accounts A/B and neutral records per test run, tag names with the private test reference, export if required, then delete through the workflow under test. A broader automated seed should be a separate server/operator tool with explicit staging-project allowlist, synthetic-only content, collision refusal, and no service-role client in browser code.

## Controlled-beta launch gate

### Must pass

- [ ] Dedicated staging environment explicitly designated.
- [ ] Staging and production app/Supabase/Stripe/email mapping recorded.
- [ ] All repository migrations reconciled against staging; required preflights clean.
- [ ] Production migration plan separately approved.
- [ ] Two-user deployed RLS SELECT/INSERT/UPDATE/DELETE tests pass.
- [ ] Signup, verification email, login, reset, and onboarding pass.
- [ ] Desktop/mobile core journey passes with synthetic data.
- [ ] Stripe Test Mode Checkout, webhook, entitlement, Portal, cancellation/failure pass.
- [ ] Read-only Stripe reconciliation has no unresolved billable mapping issue.
- [ ] Representative export is complete, isolated, redacted, and valid.
- [ ] Free deletion and old-token denial pass.
- [ ] Paid deletion, Stripe closure, cleanup, and old-token denial pass.
- [ ] Storage inventory and deletion behavior verified.
- [ ] Monitored support/privacy contact and escalation owners verified.
- [ ] Legal operator identity and Privacy/Terms approved.
- [ ] Backup frequency, restore owner/procedure, and deletion/backups disclosure approved.
- [ ] Critical alerts and incident owners tested.

### Strongly recommended

- [ ] Full mobile smoke on a real device.
- [ ] Repeatable synthetic staging fixture log.
- [ ] Vercel rollback rehearsal.
- [ ] Supabase non-production restore rehearsal.
- [ ] Daily Stripe reconciliation during initial beta.
- [ ] Minimal non-sensitive activation events if product analytics are required.

### Post-beta

- [ ] Public/authenticated root-layout separation.
- [ ] Automated approved retention enforcement.
- [ ] Formal privacy-request tracking.
- [ ] Centralized error monitoring and expanded alerts.
- [ ] Continuous schema/RLS/export drift checks.
- [ ] Planned backwards-compatible schema cleanup.
