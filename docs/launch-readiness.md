# Launch readiness

Funnel: visitor → signup → onboarding complete → first log → day 2 return → day 7 return → pricing viewed → checkout started → Premium activated.

Track conversion, onboarding completion, first-log activation, day 1/7/30 retention, weekly active users, logs per active user, checkout conversion, Free-to-Premium conversion, MRR, ARR, and churn.

Product analytics must use generic event names only. Never attach health values or names, notes, hypotheses, pattern results, or Outlook classifications.

Professional counsel must review Privacy, Terms, disclaimer, refund, tax, and jurisdictional wording. User export and safe self-service account deletion remain launch requirements.


## Sprint 12B account controls

See [Sprint 12B account control report](sprint-12b-account-control.md) for export, deletion migrations, immediate billing closure during account deletion, and required staging/owner checks. Ordinary subscription cancellation still does not delete health records. Self-service account deletion defaults off; legal/support launch gates remain open.


## Sprint 12B continuation — 12B.6 through 12B.25

### IMPLEMENTED

Existing account/export/deletion routes and migrations preserved. Added billing Retry/Refresh and corrected expired/canceled period labels; configurable privacy contact; provider/support disclosures; expanded Terms decision surfaces; Experiments non-causal disclaimer; verified customer-ID closure contract and recovery documentation. No new analytics or mail infrastructure.

See [Account data controls](account-data-controls.md) for the table-by-table deletion manifest, exclusions, exact failure stages, recovery steps, file inventory and decisions. [Read-only schema inventory](../supabase/tests/sprint12b_inventory.sql) supports deployed review.

### VERIFIED LOCALLY

- `npm test`: 264 passed, zero failures. Includes migration/RLS execution, 1,001-row export, source/size failure, redaction, owner isolation, catalog retention, rollback, account budgets and mapped Stripe closure with mocked transport.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed after correcting the extracted Stripe adapter's SDK type normalization.
- `git diff --check`: passed.
- Production HTTP smoke: export/delete return 401 with private/no-store while signed out; export/delete/billing pages return 307 to Login.
- Browser: updated Contact rendered at desktop size with honest missing-mailbox notices and account links; Privacy navigation and provider/support text inspected.
- No authenticated disposable-account export/delete, live Stripe Test Mode cancellation, email routing/delivery or deployed schema QA performed. Mobile/authenticated Billing Retry interaction not verified in browser.

### OWNER ACTION REQUIRED

- Keep deletion disabled. Reconcile missing original table DDL, every deployed owned table/FK/RLS policy, Storage and Auth trigger permissions. PGlite uses a synthetic baseline, not production evidence.
- Correct and test the existing concurrent first-Checkout customer creation race, then reconcile historical duplicate/unmapped Stripe customers/subscriptions. Closing the stored customer alone cannot prove unmapped subscriptions stopped. Do not enable deletion before this blocker is resolved.
- Apply existing 12B migrations in staging alongside the app; webhook code depends on account_deletions. Verify rollback and disposal with two synthetic accounts and a disposable Stripe Test Mode subscription.
- Create/confirm and monitor support@axvital.com if selected; optionally privacy@axvital.com, or one monitored address for both. Set AXVITAL_SUPPORT_EMAIL and optional AXVITAL_PRIVACY_EMAIL. No mailbox existence was verified.
- Verify existing Resend custom SMTP, support routing, Vercel/Supabase deployment settings, body/log redaction, timeout behavior and old-token restrictions.
- Choose refund eligibility/window/proration/accidental-renewal handling and operator; choose retention/backups/log/mailbox periods and rights procedures. No periods or refund promises invented.

### LEGAL REVIEW REQUIRED

Publish verified operator identity; obtain qualified Privacy/Terms review covering provider facts, applicable rights, eligibility, content/IP, service changes, refund/retention, liability, law and venue. Keep AXVITAL_LEGAL_REVIEWED false until copy and operations are approved.

**Status:** continuation code and local checks complete, but Sprint 12B is not accepted as fully repository-/release-complete: deletion safety gates and historical billing reconciliation remain unresolved, and a monitored contact is not established. The future mapping race is resolved by the subsequent fix below. Sprint 12C was not started. Review its scope separately; no production readiness is implied.


## Subsequent targeted fix — customer mapping concurrency

**Supersedes earlier statements that the future Checkout race remains uncorrected.** The race is now repository-resolved using a database-reserved logical operation, deterministic Stripe idempotency, atomic mapping establishment and immutable mapping guards. Metadata-only webhook upserts have been replaced with matching-projection updates. See [Billing customer integrity](billing-customer-integrity.md) for implementation, finite retry window, orphan recovery, file inventory and read-only reconciliation.

New migration: `202608270005_billing_customer_coordination.sql`, after 003/004. Review and apply 003/004/**005** together for staging validation before serving the new Checkout code. No migration or external provider change was performed here. Existing customer mappings are preserved.

**OWNER ACTION REQUIRED:** run the read-only historical inventory in the correct provider/project scope (including every Test Clock if used), resolve duplicate/unmapped billable subscriptions, verify baseline schema/Storage/grants and exercise concurrent Test Mode Checkout and failure/retry/webhook flows. Historical data was not inspected. Account deletion must remain disabled. Legal/support gates are unchanged; Sprint 12C was not begun.


### Targeted fix verification results

- `npm test`: **270 passed**, zero failures.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- After the final explicit API-role permission revocation, the PostgreSQL suite was rerun: **3 passed**. Its fixture gives new functions permissive default grants and verifies authenticated access is still denied.
- `node scripts/reconcile-billing.mjs --help`: passed without connecting to providers. Reconciliation analysis uses synthetic fixtures; the live inventory was **not run**.
- No migrations applied, no external provider data read or modified, no deletion enabled, and no Sprint 12C work performed. Existing untracked supabase/.temp was untouched.


## Final deletion migration review (supersedes original baseline uncertainty)

The owner confirmed Auth CASCADE for profiles, daily_checkins, health_events, weekly_recaps and user_insights; the Auth AFTER INSERT trigger only creates profiles; Sprint 12A checks are clean. Unapplied 003/005 were hardened in place. 003 now validates an explicit ownership/FK/RLS contract before cleanup; 005 strengthens the same hook for required coordination state and matching customer mappings. Provision rows cascade transactionally on successful Auth deletion only. Composite/profile-linked cross-owner checks and privileged-function grants were hardened. Export no longer assumes every source has id.

Run the new read-only [pre-003 check](../supabase/tests/sprint12b_pre003_preflight.sql), expecting zero rows, then follow the [final contract and application checklist](account-data-controls.md). Order remains 003 → 004 → 005; no new migration. This resolves the identified code/ordering issues, not provider/deletion enablement gates. No migrations applied or external state changed. Account deletion remains disabled.


### Final review verification

`npm test`: **274 passed**, zero failures. `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`: **passed**.

Regression coverage includes required-table/ownership/FK drift before cleanup, absent optional insights, malformed legacy installation rejection, missing permissive export access, legacy rows without id, missing/pending/mismatched 005 coordination, successful provision cascade, Auth-side rollback, composite/profile-linked cross-owner rejection, API-role permission denial, and coexistence with the profile AFTER INSERT trigger. The read-only pre-003 script is exercised against the pre-003 local fixture.

No migrations were applied, no provider state changed, no account deletion enabled, and no Sprint 12C work started. The owner's deployed-schema confirmations are recorded separately from local test evidence.
