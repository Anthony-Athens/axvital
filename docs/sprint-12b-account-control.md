# Sprint 12B — Account control and legal surface

Date: 2026-08-27. Code implemented locally; not a production launch approval.

## Blocker mapping

| Blocker | Changes | Remaining release gate |
| --- | --- | --- |
| B01 — Account control | Account utility hub; visible profile links; authenticated JSON export; deliberate password-confirmed deletion with billing handling and atomic application/Auth cleanup | Apply and verify migrations, isolated Supabase/Stripe staging QA, then explicitly enable deletion |
| B02 — Trust/legal | Privacy, Terms and Contact now describe implemented behavior, expose account tools, and avoid invented operator, support, retention or compliance claims | Owner identity, monitored support address, retention/refund/jurisdiction decisions and legal review remain unresolved |

No Experiments 2.0, voice, Mental Mathletics, pricing changes or broad navigation redesign. Earlier Sprint 12A provider and schema gates remain open.

## Account utilities

`/settings` provides Profile/preferences, Security, Billing, Export, Delete and Support. Nested settings routes verify the Auth user server-side. Profile has direct account/export/delete links. Onboarding does not block profile/settings access. Existing password recovery and billing remain available.

Deletion is deliberately **disabled by default**. `AXVITAL_ACCOUNT_DELETION_ENABLED=true` enables its server endpoint and form only after the owner completes the checks below. The UI presents consequences, export-first guidance, immediate loss of paid access, current password, exact DELETE confirmation, and an acknowledgement checkbox. It never equates a public completion URL with proof of deletion.

## Export contract

`POST /api/account/export` derives ownership from the verified session. No user ID is accepted. The SECURITY INVOKER `axvital_export_account()` RPC uses explicit auth.uid() predicates plus existing RLS and a single statement snapshot. Sources are enumerated in migration 003 rather than discovered from arbitrary client input.

Included domains: profile/preferences; daily check-ins; health events; weekly recaps; planned activities/occurrences; protocol templates, activities, active protocols and pauses; workout templates/groups/exercises/sets, plans and sessions; custom exercises; conditions, symptoms, occurrences and links; episodes/updates/links; experiments, interventions, outcomes, measurements, phase events, condition links and results; nutrition entries/items, user foods/preferences, saved meals/items and targets; redacted subscription summary; legacy user_insights when present.

Relationship IDs are retained, repeated owner IDs removed. Profile and subscription fields use explicit allowlists; other personal-domain rows retain their stored fields. Future schema changes require export privacy review. Shared catalogs/templates are not account-owned exports. Auth internals, secrets, Stripe identifiers, webhook/product events, deletion state and API budgets are excluded.

The file contains `export_version`, `generated_at`, named `data` sections and an `export_manifest` with source status/count. A missing legacy user_insights table is explicitly marked `not_present_in_schema`; all other source errors fail the entire request. The legacy table is referenced by application code but its original DDL is not in the repository, so deployment inventory is required.

Limits: 10,000 rows per source (10,001 triggers failure), 3 MiB accumulated SQL data, 4 MiB final serialized response, 15-second client RPC abort, 30-second route maxDuration. No PostgREST 1,000-row truncation. These are bounded synchronous exports, not an unlimited archive service. SQL oversize currently returns the generic safe export failure. A provider-side statement timeout must also be configured: aborting the HTTP request does not prove the server query stopped. A single oversized source is aggregated before its size check; validate realistic maximum records in staging. Larger accounts need an operator-assisted export process before launch.

Responses are private/no-store; download generation is on demand and browser-memory based, with no permanent server export files or health analytics payloads. Users are warned to store the sensitive file securely. Request budgets are 2 export and 3 deletion attempts per minute per authenticated account. Account POSTs require matching Origin and reject owner overrides.

## Deletion safety and retry contract

1. Validate authenticated owner, exact confirmation, acknowledgement and password. Reauthenticate against Supabase using an isolated nonpersistent client; do not replace the browser session. Accounts with verified MFA factors also require an existing AAL2 session.
2. Service-role RPC locks the Auth row and creates an idempotent private account_deletions request. Subscription projection writes lock that same row and reject a closing account.
3. Read the authoritative stored customer mapping after preparation. Close the Stripe customer, or verify it was already deleted on retry. Missing/ambiguous subscription mappings fail closed. No subscription record is treated as no linked billing; verify mappings in staging before enabling.
4. Mark billing_closed only after successful provider handling.
5. Hard-delete the Supabase Auth user. A BEFORE DELETE trigger checks preparation and deletes application records within the same database transaction. Any Auth/FK failure rolls back application cleanup. Suspect cross-owner references stop cleanup rather than cascading into another account.
6. Clear local auth and redirect. The client distinguishes confirmed deletion from uncertain network results; a retry can finish a prepared request. Authenticated webhook synchronization skips closing or deleted accounts; the projection trigger also blocks late writes.

Stripe customer deletion immediately cancels active subscriptions and prevents further operations for that customer, including new subscriptions. Historical provider records can still exist. See [Stripe customer deletion](https://docs.stripe.com/api/customers/delete). This is stronger than ordinary end-of-period cancellation and must be explicitly tested against open/concurrent Checkout sessions. It does not request a refund. An orphan customer created before a rejected mapping write may need provider reconciliation.

**External billing closure cannot be rolled back with SQL.** A later failure leaves the account/data intact but billing closed or uncertain; the durable request supports retry. Once preparation begins, new billing projection writes remain blocked even if provider closure fails. Operators must resolve or finish that request, not casually remove its marker or re-enable purchases. There is no background deletion worker or automatic retry.

The Auth cleanup trigger also affects direct dashboard/admin deletes, even while the UI feature flag is off. Operators must use the prepared workflow; do not bypass it to force deletion. Admin removal without billing_closed fails. The service role and trigger installation privileges must be verified on a staging Supabase project. Consult [Supabase admin deletion](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser) and [user data management](https://supabase.com/docs/guides/auth/managing-user-data).

Storage objects are not managed by this workflow. Inventory storage and external integrations before enablement; Auth deletion may fail if owned objects remain. Backups, operational/provider records and downloaded exports are not erased by this transaction. Existing token lifetime, deleted-owner FK behavior and cookie cleanup must be verified in the actual deployment. No complete erasure, regulated portability or retention-duration guarantee is made.

## Deployment sequence and owner checklist

1. Complete Sprint 12A schema preflight first. Original profiles/daily_checkins/health_events/weekly_recaps DDL is still absent; tests use a clearly labeled synthetic baseline. Reconcile deployed constraints, grants, policies and legacy user_insights before release.
2. Apply `202608270003_account_control.sql` and `202608270004_account_api_budgets.sql` in order in staging. Deploy the app and migrations together: webhook synchronization now depends on account_deletions. Do not enable deletion yet. Back up and review trigger effects before production migration.
3. With two isolated synthetic accounts, verify all domain exports, empty/large/soft-deleted records, optional legacy manifest, relationship IDs, owner isolation and no secret/provider identifiers. Check failed/slow source behavior and deployment statement/request limits.
4. In Stripe Test Mode, verify no-billing, active/trialing/past-due/canceled, missing mapping, deleted-customer retry, provider timeout, concurrent/open Checkout and late webhooks. Confirm no future charge path remains before Auth removal. Test wrong password, MFA/recovery, duplicate submission, failed Auth cleanup, disconnected response, retry and logout. Never use a real paying account for these checks.
5. Verify every owned table and storage bucket in the deployed schema. Test a failed Auth delete leaves application data intact; test successful deletion removes child records and leaves the second account intact. Verify old JWTs cannot recreate owned rows. Configure request-body/log redaction so passwords and health contents are not captured by deployment tooling.
6. Set a real `AXVITAL_OPERATOR_NAME` and monitored `AXVITAL_SUPPORT_EMAIL`; verify delivery and a safe ownership-verification process. Values are server-side configuration; static public pages require rebuild/redeploy after changes.
7. Finalize actual retention/backups, provider/hosting disclosures, applicable rights, age/access terms, refunds, jurisdiction and support commitments with qualified counsel. Edit the pages to reflect those decisions. `AXVITAL_LEGAL_REVIEWED=true` only removes the prelaunch notice when operator/email are present; setting it does not itself complete legal review or fill missing terms. Do not set it until the copy and operations are approved.
8. Enable `AXVITAL_ACCOUNT_DELETION_ENABLED=true` only after the above account safety gates pass. B01 is not operationally closed until this workflow is verified and available. B02 remains open pending owner facts and review.

## Verification performed locally

- Full unit/integration suite: 257 tests passed; TypeScript passed; ESLint passed; production build passed.
- PostgreSQL/PGlite executes checked-in migrations. Expanded tests pass for 1,001-row export, A/B isolation, redaction, optional insights, oversized and missing-source failure, denied user preparation, closing-account billing guard, transactional rollback on blocked Auth deletion, corrupt cross-owner cleanup rejection, related-child cleanup and surviving other-account records.
- Production HTTP smoke: both account endpoints return 401 and private/no-store when signed out.
- Browser smoke: Contact rendered correctly at the browser's desktop viewport, and signed-out Export redirected to Login. Signed-in account UI, mobile layouts, real Supabase Auth deletion, provider cancellation and email delivery were not exercised.
- No live account, subscription or provider configuration was modified. Existing untracked supabase/.temp directory was left untouched.


## Continuation through 12B.25

See [Account data controls](account-data-controls.md) for the complete table manifest, recovery runbook, expanded legal/support scope, verification and unresolved Checkout customer-mapping race. This later report supersedes any implication that closing one mapped customer proves all possible billing is closed. Deletion must remain disabled pending remediation and deployed schema/provider QA.


## Subsequent targeted fix — customer mapping concurrency

**Supersedes earlier statements that the future Checkout race remains uncorrected.** The race is now repository-resolved using a database-reserved logical operation, deterministic Stripe idempotency, atomic mapping establishment and immutable mapping guards. Metadata-only webhook upserts have been replaced with matching-projection updates. See [Billing customer integrity](billing-customer-integrity.md) for implementation, finite retry window, orphan recovery, file inventory and read-only reconciliation.

New migration: `202608270005_billing_customer_coordination.sql`, after 003/004. Review and apply 003/004/**005** together for staging validation before serving the new Checkout code. No migration or external provider change was performed here. Existing customer mappings are preserved.

**OWNER ACTION REQUIRED:** run the read-only historical inventory in the correct provider/project scope (including every Test Clock if used), resolve duplicate/unmapped billable subscriptions, verify baseline schema/Storage/grants and exercise concurrent Test Mode Checkout and failure/retry/webhook flows. Historical data was not inspected. Account deletion must remain disabled. Legal/support gates are unchanged; Sprint 12C was not begun.


## Final pre-application review of 003 with 005

This review edits the **unapplied** migrations 003 and 005 in place. No new migration is needed. Order remains **202608270003_account_control.sql → 202608270004_account_api_budgets.sql → 202608270005_billing_customer_coordination.sql**. Nothing was applied remotely and deletion remains disabled.

### Confirmed deployed facts supplied by the owner

The owner completed the deployed inventory: profiles, daily_checkins, health_events, weekly_recaps and user_insights all exist and reference auth.users with ON DELETE CASCADE. The only reported custom Auth trigger is on_auth_user_created AFTER INSERT calling handle_new_user(), which only inserts profiles. Sprint 12A integrity checks were clean. These findings supersede earlier uncertainty about those five deployed FK paths; their historical CREATE TABLE files remain absent from the repository but that is no longer an unanswered deployed-schema question. Local test fixtures now model the confirmed cascades. This review did not independently access the deployment.

### Explicit deletion contract

- The existing explicit cleanup order is retained. No discovery-based table deletion was added. Owned roots are explicitly removed in dependency order; declared child cascades remove children, and verified Auth cascades provide the final cleanup paths. Profiles uses id, other direct owners use user_id; indirect sources use their declared parent IDs.
- 003 adds an explicit catalog contract for required tables, UUID ownership columns, validated owner/parent FK delete actions, table kind, RLS and operational columns. Exported tables also need authenticated SELECT privileges and an applicable permissive SELECT policy; a missing policy cannot silently turn an export into empty sections. Policy predicate correctness still requires the existing owner-isolation tests. Unknown public FK dependents of Auth/account tables require review. The catalog scan only validates, never selects new tables for deletion.
- The complete contract is checked at migration completion, during deletion preparation (before the normal server workflow closes billing), and again by the Auth BEFORE DELETE trigger **before any cleanup DELETE**. Schema problems raise ACCOUNT_SCHEMA_REVIEW_REQUIRED with table/issue metadata for an authorized operator; the API still returns safe generic errors. Any subsequent failure rolls back the entire database transaction.
- user_insights is the only optional legacy source: absent means skip it in deletion and explicitly mark its absence in the export manifest. If present, its user_id UUID/validated Auth cascade and RLS must be compatible. A present malformed legacy table is rejected before cleanup, never silently ignored and never deleted through a guessed owner column. A missing id column alone is now harmless to export.
- Cross-owner validation now joins **all columns of composite foreign keys** and recognizes profiles.id ownership, in addition to direct user_id and declared indirect-parent paths. Shared catalog rows are not deleted; cross-owner links into another account abort cleanup. Unreviewed public incoming FK tables are rejected by preflight instead of being silently cascaded.
- 003 explicitly revokes privileged function access from PUBLIC, anon and authenticated, including when the deployment has permissive function default grants. Only the schema diagnostic functions and owner-only export are callable by authenticated users; state preparation remains service-only.

### Migration 005 coordination state

billing_customer_provisions is **not explicitly deleted or retained/anonymized**: its validated user_id → auth.users(id) ON DELETE CASCADE removes the row only when the Auth transaction commits. It contains operational IDs/timestamps, no health payload, and remains excluded from export.

003 installs a deletion-contract hook without requiring the not-yet-created table. After creating the coordination table, 005 replaces that hook to require its schema/cascade and check the account's provision. Both preparation and actual Auth deletion now refuse an unresolved provision (NULL customer) or a provision whose customer differs from the authoritative subscriptions mapping. This catches drift after preparation, even if billing_closed was already marked. After 005, a missing/renamed coordination table fails explicitly; it is not treated as optional. A valid completed provision cascades on successful Auth deletion; rollback preserves it with the account and other data. No coordination state is orphaned or lost as part of a failed deletion.

### Auth trigger and export findings

Ordinary unprepared Auth deletes fail closed, including accidental privileged dashboard deletes. A prepared owner deletion also requires billing_closed=true and valid schema/relationships/coordination. SQL cannot independently certify Stripe cancellation: the trusted server sets that marker only after provider verification. A malicious superuser can alter triggers or markers; that is outside the client/ordinary accidental-delete guarantee.

Application cleanup and Auth removal remain one PostgreSQL transaction via BEFORE DELETE. Tests verify that an Auth-side blocking FK rolls application cleanup back. The distinct AFTER INSERT profile trigger is unaffected by 003 and coexists with deletion; regression tests exercise profile creation after a prepared deletion. No change to handle_new_user is required.

Export remains SECURITY INVOKER, auth.uid()-owned and explicitly allowlisted, with the same redaction, manifest and limits. It now validates declared source schema before querying and sorts rows by their JSON representation rather than assuming every source has r.id. Optional legacy rows without an id can be exported. Required-source schema failures fail the whole request; there is no silent partial health export. Coordination internals remain excluded.

### New owner preflight and deployment checks

1. Before 003, run **supabase/tests/sprint12b_pre003_preflight.sql** as an authorized schema reviewer. This is self-contained, read-only catalog SQL and needs none of the new functions. Expected result: **zero rows**. It checks the full explicit contract available before 003, including unknown public incoming FK dependents and the billing mapping column. 003 itself enables legacy insights RLS; the precheck does not require that specific RLS change in advance.
2. Retain the existing sprint12b_inventory.sql review for Storage ownership and unexpected custom DELETE triggers/dependencies. The owner-confirmed AFTER INSERT trigger alone is not a conflict. Do not disable protective FKs/triggers to obtain a clean result.
3. 003 and 005 each perform their own contract assertion before COMMIT. Any reported mismatch aborts that migration. Resolve it deliberately; do not skip the assertion. After applying the full sequence, `select * from public.axvital_account_schema_issues(true);` should return zero rows, and an authorized `select public.axvital_assert_account_schema(true);` should succeed.
4. Validate the full sequence on a staging copy/disposable accounts, including wrong/missing preparation, false billing marker, valid completed provision cascade, rollback, cross-owner links and signup profile creation. Keep schema-changing operations out of the deletion validation window. PostgreSQL rollback remains the safety net for concurrent DDL or late constraints.
5. Historical Stripe reconciliation, Test Mode billing/deletion QA, Storage ownership handling, log/request controls and legal/support release remain separate enablement gates. This change does not enable deletion or approve erasure of external provider records.

**Application decision:** 003 is code-reviewed and suitable for controlled production application **once the new pre-003 check is clean and staging/backup/change-window checks are satisfied**. There is no remaining identified 003/005 ordering conflict. This is not an unconditional safety claim about unseen deployment state. Applying 003 installs a protective Auth DELETE trigger even with the application feature flag off; alert operators that unprepared dashboard deletes will fail. Apply 004 and 005 in order before serving the coordinated Checkout/deletion version. Deletion must remain disabled until the separate provider and end-to-end enablement gates pass. Sprint 12C was not started.


### Final review verification

`npm test`: **274 passed**, zero failures. `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`: **passed**.

Regression coverage includes required-table/ownership/FK drift before cleanup, absent optional insights, malformed legacy installation rejection, missing permissive export access, legacy rows without id, missing/pending/mismatched 005 coordination, successful provision cascade, Auth-side rollback, composite/profile-linked cross-owner rejection, API-role permission denial, and coexistence with the profile AFTER INSERT trigger. The read-only pre-003 script is exercised against the pre-003 local fixture.

No migrations were applied, no provider state changed, no account deletion enabled, and no Sprint 12C work started. The owner's deployed-schema confirmations are recorded separately from local test evidence.
