# Account data controls — complete Sprint 12B

## Additive Sprint 13A.2 contract (not applied to Supabase)

The [Experiments 2.0 foundations report](C:/Users/apath/axvital/docs/sprint-13a2-experiments-foundations.md) documents forward migrations `202608280001` and `202608280002`. The first adds six private tables to the fixed account schema/export/deletion contract atomically: `target_rules`, `nutrition_patterns`, `nutrition_pattern_rules`, `user_food_classification_assertions`, `nutrition_log_days`, and `experiment_start_snapshots`. Shared `food_classification_assertions` is retained/excluded. Export is version `axvital.account.v2`; existing limits/redactions remain.

Cleanup removes experiments/snapshots and pattern memberships before referenced rules, Nutrition targets before rules, and private evidence/coverage before remaining domain cleanup. New relationship FK/delete-action/composite-owner assertions supplement the ownership inventory. The corruption scan still runs before deletion. Migration 005 billing/deletion coordination and all enablement flags remain unchanged. Read-only `supabase/tests/sprint13a2_preflight.sql`, staging real-role/concurrency testing and separate production approval are required; these changes do not supersede the existing provider/Storage/deletion enablement gates below.

Updated 2026-08-27. This continues, rather than replaces, [the initial implementation report](sprint-12b-account-control.md). No duplicate routes or migrations were introduced. **Not approved for production deletion or public launch.**

## Existing 12B.1–12B.5 implementation preserved

Account utilities at /settings and direct Profile links; server-authenticated settings; owner-only JSON export; bounded on-demand downloads and manifest; password reauthentication, typed DELETE and consequences acknowledgement; service-only deletion coordinator, immediate mapped Stripe customer closure, atomic application/Auth cleanup, best-effort local sign-out. Both Free and Premium use the same controls with no entitlement gate. The initial account-control migrations are 202608270003 and 202608270004; the subsequent billing-integrity fix adds 202608270005. Deletion remains disabled by default.

## Continuation corrections and additions

- Billing load now has Retry and Refresh status. Expired Premium records show Free access and last recorded period, not a future billing date; cancellation and subscription status are explicit. Checkout return still waits for authoritative webhook status.
- Existing Stripe closure is extracted into a testable contract and verifies the returned customer ID as well as deleted=true. No secret or provider client moved into browser code. Retry accepts an already-deleted matching customer; ambiguous paying mappings/provider errors fail closed.
- Privacy contact is separately configurable, falling back to support only when no separate address is supplied. Invalid addresses do not create mailto links. Configuration does not prove a mailbox is monitored.
- Privacy identifies documented Resend/Supabase SMTP and Vercel deployment context with verification caveats, plus support communications. Terms now cover recurring billing, eligibility, content/IP, service availability, refund questions and unapproved law/venue. No invented policy.
- Experiments has an explicit descriptive/non-causal health disclaimer. Patterns and Current Pattern already describe associations/history rather than diagnosis or probability. Footer, pricing and Terms retain diagnosis/treatment disclaimers. No intrusive logging-screen disclaimers added.
- Logout failure no longer suggests that closing a tab clears a session. Users are directed to clear AXVital site data if local logout fails.
- No new analytics events, CRM, email infrastructure, price changes or Sprint 12C work.

## Export architecture and contents

POST /api/account/export is guarded by verified Auth, same-origin validation, bounded body and the existing shared API budget (2/minute/account). The SECURITY INVOKER STABLE RPC axvital_export_account() uses auth.uid(), fixed source predicates and RLS in one statement snapshot. No supplied owner, no permanent file, no content logging. Responses use private/no-store and an attachment filename. JSON contains version axvital.account.v1, generated_at, source manifest and data.

Included: profile/preferences; check-ins; health events; weekly recaps; conditions/symptoms/episodes and their links/updates; nutrition entries/items, foods/preferences, saved meals/items and targets; activities/occurrences; protocols/templates/activities/pauses; workout templates/groups/exercises/sets/plans/sessions; custom exercises; experiments/interventions/outcomes/measurements/phase events/results/condition links; redacted subscription summary; user_insights if deployed. Relationship IDs remain, repeated user_id fields do not. Profile and subscription exports have explicit field allowlists.

Excluded: Auth/provider internals, password hashes, tokens, service keys, Stripe IDs/secret data, webhook events, product events, request budgets, deletion requests, shared catalogs and other accounts. A missing optional user_insights table has status not_present_in_schema. Required-source errors fail the entire file. No silent partial export.

Limits: 10,000 rows/source, 3 MiB accumulated SQL data, 4 MiB final JSON, 15-second RPC abort and 30-second route budget. Oversize/source errors return a safe failure. Verify database statement_timeout separately; HTTP abort does not guarantee database termination. Large accounts require an approved assisted-export procedure; no regulated portability guarantee is made.

## Deletion manifest

The table below covers every public CREATE TABLE in checked-in migrations, plus the original/legacy tables below it. CASCADE describes the checked-in parent relation, not a claim about deployed schema. Explicit deletion is by verified owner inside the Auth BEFORE DELETE trigger, even where an Auth cascade also exists. Deletion order is defined in migration 003. SET NULL links retain snapshots only until their owner row is deleted. Later composite ownership constraints in Sprint 12A also apply; the preflight query reports their exact deployed definitions.

| Table | Handling | Checked-in cascade paths |
| --- | --- | --- |
| `planned_activities` | Explicit owner deletion | auth.users CASCADE |
| `planned_activity_occurrences` | Cascade via listed parent/Auth | auth.users CASCADE, public.planned_activities CASCADE |
| `protocol_templates` | Explicit owner deletion | auth.users CASCADE |
| `protocol_template_activities` | Cascade via listed parent/Auth | auth.users CASCADE, public.protocol_templates CASCADE |
| `user_protocols` | Explicit owner deletion | auth.users CASCADE |
| `protocol_pause_periods` | Cascade via listed parent/Auth | auth.users CASCADE, public.user_protocols CASCADE |
| `user_protocol_activities` | Cascade via listed parent/Auth | auth.users CASCADE, public.user_protocols CASCADE, public.planned_activities CASCADE |
| `exercises` | Explicit owner deletion; NULL-owner shared exercises retained | auth.users CASCADE |
| `workout_templates` | Explicit owner deletion | auth.users CASCADE |
| `workout_template_groups` | Cascade via listed parent/Auth | auth.users CASCADE, public.workout_templates CASCADE |
| `workout_template_exercises` | Cascade via listed parent/Auth | auth.users CASCADE, public.workout_templates CASCADE, public.workout_template_groups CASCADE |
| `workout_template_sets` | Cascade via listed parent/Auth | auth.users CASCADE, public.workout_template_exercises CASCADE |
| `planned_workouts` | Explicit owner deletion | auth.users CASCADE |
| `planned_workout_exercises` | Cascade via listed parent/Auth | auth.users CASCADE, public.planned_workouts CASCADE |
| `planned_workout_sets` | Cascade via listed parent/Auth | auth.users CASCADE, public.planned_workouts CASCADE, public.planned_workout_exercises CASCADE |
| `workout_sessions` | Explicit owner deletion | auth.users CASCADE |
| `workout_session_exercises` | Cascade via listed parent/Auth | auth.users CASCADE, public.workout_sessions CASCADE |
| `workout_session_sets` | Cascade via listed parent/Auth | auth.users CASCADE, public.workout_sessions CASCADE, public.workout_session_exercises CASCADE |
| `condition_categories` | Retain shared catalog | None in CREATE TABLE |
| `conditions` | Retain shared catalog | None in CREATE TABLE |
| `user_conditions` | Explicit owner deletion | auth.users CASCADE |
| `symptom_categories` | Retain shared catalog | None in CREATE TABLE |
| `symptoms` | Retain shared catalog | None in CREATE TABLE |
| `condition_symptoms` | Retain shared catalog | public.conditions CASCADE, public.symptoms CASCADE |
| `user_symptoms` | Explicit owner deletion | auth.users CASCADE |
| `user_symptom_events` | Explicit owner deletion | auth.users CASCADE |
| `symptom_event_conditions` | Cascade via listed parent/Auth | public.user_symptom_events CASCADE, public.user_conditions CASCADE |
| `experiments` | Explicit owner deletion | auth.users CASCADE |
| `experiment_interventions` | Cascade via listed parent/Auth | public.experiments CASCADE |
| `experiment_outcomes` | Cascade via listed parent/Auth | public.experiments CASCADE |
| `experiment_condition_links` | Cascade via listed parent/Auth | public.experiments CASCADE, public.user_conditions CASCADE |
| `experiment_phase_events` | Cascade via listed parent/Auth | public.experiments CASCADE, auth.users CASCADE |
| `experiment_measurements` | Cascade via listed parent/Auth | public.experiments CASCADE, public.experiment_outcomes CASCADE, auth.users CASCADE |
| `experiment_results` | Cascade via listed parent/Auth | public.experiments CASCADE |
| `experiment_templates` | Retain shared catalog | None in CREATE TABLE |
| `food_categories` | Retain shared catalog | None in CREATE TABLE |
| `foods` | Retain shared catalog | None in CREATE TABLE |
| `food_servings` | Retain shared catalog | public.foods CASCADE |
| `user_foods` | Explicit owner deletion | auth.users CASCADE |
| `nutrition_entries` | Explicit owner deletion | auth.users CASCADE |
| `nutrition_entry_items` | Cascade via listed parent/Auth | public.nutrition_entries CASCADE |
| `user_food_preferences` | Explicit owner deletion | auth.users CASCADE, public.foods CASCADE |
| `saved_meals` | Explicit owner deletion | auth.users CASCADE |
| `saved_meal_items` | Cascade via listed parent/Auth | public.saved_meals CASCADE, public.foods CASCADE, public.food_servings CASCADE, public.user_foods CASCADE |
| `nutrition_targets` | Explicit owner deletion | auth.users CASCADE |
| `condition_episodes` | Explicit owner deletion | auth.users CASCADE, public.user_conditions CASCADE |
| `episode_symptom_links` | Cascade via listed parent/Auth | public.condition_episodes CASCADE, public.user_symptom_events CASCADE |
| `episode_updates` | Cascade via listed parent/Auth | public.condition_episodes CASCADE, auth.users CASCADE |
| `subscriptions` | Explicit owner deletion | auth.users CASCADE |
| `stripe_webhook_events` | Retain operational deduplication records | None in CREATE TABLE |
| `product_events` | Explicit owner deletion; existing NULL-owner events retained | None in CREATE TABLE |
| `api_request_budgets` | Cascade via listed parent/Auth | auth.users CASCADE |
| `account_deletions` | Cascade via listed parent/Auth | auth.users CASCADE |
| `billing_customer_provisions` | Operational creation state; excluded from export; pending state blocks deletion preparation | auth.users CASCADE |
| `profiles` | Explicit id=owner deletion | Owner confirms Auth CASCADE; explicit cleanup retained |
| `daily_checkins` | Explicit user_id=owner deletion | Owner confirms Auth CASCADE; explicit cleanup retained |
| `health_events` | Explicit user_id=owner deletion | Owner confirms Auth CASCADE; explicit cleanup retained |
| `weekly_recaps` | Explicit user_id=owner deletion | Owner confirms Auth CASCADE; explicit cleanup retained |
| `user_insights` | Explicit user_id=owner deletion if table exists | Owner confirms Auth CASCADE; optional absence supported |

Shared catalog FKs point FROM owned records TO shared rows; removing an owned record does not delete its referenced catalog. Shared exercises have NULL user_id and are not deleted. Cleanup checks incoming cross-owner links and aborts on suspected corruption. Tests verify populated shared catalog rows and another account survive.

### Deployed schema status

The owner has now confirmed that the five original/legacy tables exist with Auth ON DELETE CASCADE, that the Auth AFTER INSERT trigger only creates profiles, and that Sprint 12A checks are clean. Those deployed FK uncertainties are resolved. See **Final pre-application review of 003 with 005** below for the new explicit contract, required zero-row precheck, and remaining provider/Storage enablement gates.

## Stripe policy and remaining billing blocker

Immediate cancellation on permanent deletion is implemented by closing the authoritative mapped Stripe customer. This cancels active subscriptions and prevents new subscriptions for that customer while retaining provider history; see [Stripe customer deletion](https://docs.stripe.com/api/customers/delete). No invoice, charge, payment or refund deletion API is called. No health data enters metadata. This operation is irreversible and distinct from ordinary subscription cancellation.

Preparation locks the Auth row and blocks subscription projection writes. Billing is read after preparation. Provider retrieval/closure must succeed before billing_closed is set, then Auth removal can proceed. No mapping is treated as no linked billing only when no subscription row exists or its status is safely inactive without a subscription ID. Active/trialing/grace states without a customer fail. Closing a matching already-deleted customer is retry-safe.

**The future customer-mapping race is repository-resolved** by migration 005 and durable Stripe idempotency coordination. See [Billing customer integrity](billing-customer-integrity.md) for the original race, exact implementation, limits and regression tests. Historical duplicate/unmapped customers and subscriptions remain **OWNER ACTION REQUIRED**; no live Stripe inventory was run. Keep deletion disabled until historical reconciliation, deployed schema review and provider QA are complete. This is not production approval.

## Auth and atomic cleanup

The endpoint derives owner from getUser; no browser owner ID is accepted. Password is checked through an isolated nonpersistent Supabase client; verified MFA factors require current AAL2. Server-only admin client invokes deleteUser(owner,false). The BEFORE DELETE auth.users trigger removes app rows in the same database transaction. Cleanup/FK/Auth failure rolls app cleanup back. Service key stays server-only. Both endpoint and form require explicit enablement. Rate limit: 3/minute/account.

Direct dashboard Auth deletion also invokes this trigger and fails without prepared billing_closed state, even if the UI flag is off. Do not bypass the trigger. Supabase-owned sessions/identities are handled by Auth; existing access JWTs can remain valid until expiry, and owned Storage objects can block deletion. See [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data). Verify old-token behavior, all owner FKs and Storage before deployment. No browser-side delete loop exists.

## Operational recovery runbook

Only an authorized operator may use privileged tools, after independently verifying account ownership. Never ask the user for their password, tokens or exported health history. Keep investigation metadata to account UUID, stage, timestamps and generic error category, in access-controlled tooling; never log request bodies/provider payloads.

| Observed state | Safe action |
| --- | --- |
| Reauthentication or confirmation fails, no request | User retries credentials/recovery. No cleanup should have begun. |
| Request exists; billing_closed=false | Inspect authoritative customer/subscriptions in Stripe, including duplicates. App/Auth data should remain. Resolve provider outage/mapping error, then retry the same authenticated workflow. Do not mark billing closed speculatively. |
| Customer closed; marker still false | Verify matching customer is deleted and no other billable customer exists. Retry verifies already-deleted state and advances the marker. No refund or reactivation is automatic. |
| billing_closed=true; Auth still present | Billing cannot be undone. Resolve DB constraint/Storage/privilege failure, keeping app records intact. Retry the same workflow, or use verified operator Auth deletion only after independently confirming billing and the prepared marker. Do not disable the trigger or drop FKs. |
| Cross-owner relationship error | Stop. Investigate exact FK ownership using metadata first; repair only with authorized review and backups. Never remove another account's rows to force cleanup. |
| Network timeout / uncertain result | Check Auth existence, preparation marker and Stripe state. User login failure alone is not proof. If Auth is gone, verify app rows are gone and clear local session. If present, follow its stage above. Do not report success before confirmation. |
| App data absent but Auth remains | Not an expected state of this transactional trigger. Treat as incident/schema drift or an older/manual workflow. Do not recreate health data. Verify billing, inspect transaction/trigger deployment, and complete prepared Auth removal with authorized tools after repair. |
| Auth absent but app rows remain | Incident: orphan rows or deployment mismatch. Keep deletion disabled, inventory ownership and perform reviewed cleanup; do not recreate Auth to make health data accessible. |

The request marker contains only user_id, requested_at and billing_closed. It is removed by Auth cascade on success. There is no background worker. A stuck request blocks new billing projection writes until resolved. Do not simply remove it and resume billing. Provider failure means no success claim; Stripe closure cannot roll back if later Auth deletion fails.

## Actual retention behavior — not an approved retention policy

| Data | Actual implementation | Purpose / health contents | Duration |
| --- | --- | --- | --- |
| Owned application health/profile data | Hard-deleted on successful atomic Auth deletion | User records, includes health data | Immediate in active DB at commit; no promise about backups |
| Subscription projection | Hard-deleted with account | Provider IDs/status, no recorded health fields | At successful deletion |
| Linked product events | Explicitly deleted | Generic event names/times, no health payload | At successful deletion |
| Already NULL-owner product events | Remain | Unlinked usage metadata; cannot safely attribute to a deleted owner | OWNER/LEGAL DECISION REQUIRED |
| stripe_webhook_events | Remain | Event ID/type/processed time for replay deduplication; no health payload | OWNER/LEGAL DECISION REQUIRED; no scheduled purge exists |
| API budgets / deletion request | Auth cascade | Owner UUID, counts/window or deletion stage | At successful deletion; stalled requests persist until resolved |
| Stripe financial/history records | Provider-managed, not erased by this workflow | Billing/payment records | OWNER/LEGAL DECISION REQUIRED with provider obligations |
| Supabase/Vercel logs and backups | Outside app deletion transaction | May include identifiers/request metadata; deployment redaction must be verified | OWNER/LEGAL DECISION REQUIRED |
| Resend delivery / support mailbox | Provider-managed | Email/delivery metadata and user-supplied support text, potentially sensitive | OWNER/LEGAL DECISION REQUIRED |
| Downloaded exports | Outside app control | Sensitive personal records | User controls local copy |

## Support, Privacy, Terms and decisions

Set AXVITAL_SUPPORT_EMAIL to a real monitored address. Optional AXVITAL_PRIVACY_EMAIL uses a separate monitored address; if omitted, support handles both. support@axvital.com and privacy@axvital.com are suggestions only, not verified mailboxes. **OWNER ACTION REQUIRED — create/confirm and monitor these addresses if chosen, verify routing and delivery, and define safe ownership verification.** No response SLA or medical advice is promised. No contact form, external analytics or new mail sender was added. Rebuild/redeploy static public pages after configuration changes.

Privacy describes Supabase Auth/database, Stripe, documented Resend custom SMTP, Vercel where applicable, cookies/local storage, product telemetry, export/deletion and support. Actual SMTP/hosting configuration was not inspected remotely. Existing password-security documentation is the source for Resend, not proof of live delivery. Verify provider routing before final publication.

**LEGAL REVIEW REQUIRED:** Privacy and Terms remain prelaunch implementation descriptions, not approved legal policies. Configure AXVITAL_OPERATOR_NAME, approve facts/rights/retention, then qualified counsel must review eligibility, user-content/IP terms, changes, warranty/liability, governing law/venue. AXVITAL_LEGAL_REVIEWED must remain false until the actual pages and operations are approved; changing the flag is not legal review. No HIPAA, FDA, clinical-validation or SOC certification claim is made.

**OWNER DECISION REQUIRED — refunds:** Are payments refundable? What window? Are monthly/annual partial periods prorated? How are accidental renewals handled? Who processes requests/refunds? No refund promise or blanket denial is implemented. Submit approved decisions for legal review before publishing specific terms.

## Verification and manual QA

See the continuation verification section in launch-readiness.md for final command results. PGlite executes the real checked-in migrations over a labeled synthetic missing baseline. It is not deployed Supabase proof. Provider closure tests use mocked customer transport; no real Stripe deletion occurred.

Manual deployed QA is NOT performed: no approved disposable authenticated account pair or Test Mode subscription was supplied. Before enabling, create synthetic records across all domains, download JSON, verify IDs/counts/isolation/exclusions, exercise Free/Premium confirmation, delete only a disposable account, verify failed sign-in and exact DB removal, compare a second account/catalog snapshot, verify immediate Test Mode cancellation and no future subscription path, inject billing/Auth/network failures and retry. Never use real health history. Verify SMTP/support routing and provider settings separately.

## File inventory for this continuation

Modified: app/contact/page.tsx, app/privacy/page.tsx, app/terms/page.tsx; components/billing/BillingPanel.tsx; components/experiments/ExperimentsHome.tsx; components/account/DeleteAccountForm.tsx; lib/account/trust.ts, deletion-server.ts, account.test.ts; lib/billing/billing.test.ts; lib/api/validation.test.ts; lib/security/database.test.ts; docs/launch-readiness.md, docs/sprint-12b-account-control.md.

Created: lib/account/close-billing.ts; lib/billing/presentation.ts; docs/account-data-controls.md; supabase/tests/sprint12b_inventory.sql.

## Sprint 12C readiness

Do not begin automatically. Independent 12C repository work may be planned only after its scope is reviewed; 12B production acceptance is not complete. Deletion/schema/provider gates and historical Stripe reconciliation remain blockers to enabling destructive account controls; the future Checkout mapping race is repository-resolved by migration 005. Support and legal acceptance remain blockers to public launch. This report does not waive them.


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
